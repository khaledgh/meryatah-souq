package services

import (
	"context"
	"encoding/json"
	"fmt"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/currency"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/storage"
)

// ProductService implements vendor-scoped product CRUD plus image
// attachment (blueprint §11.B7/B8, §3.3). price_usd is the only
// canonical, editable price; display-currency conversion is computed at
// read time via currency.Service, never stored (blueprint §4.5, §7).
type ProductService struct {
	db              *gorm.DB
	currencySvc     *currency.Service
	storageRegistry *storage.Registry
}

func NewProductService(db *gorm.DB, currencySvc *currency.Service, storageRegistry *storage.Registry) *ProductService {
	return &ProductService{db: db, currencySvc: currencySvc, storageRegistry: storageRegistry}
}

// ProductWithDisplay bundles a product with its resolved image URLs and a
// converted display price, for direct JSON serialization to clients.
type ProductWithDisplay struct {
	models.Product
	Images          []models.ProductImage `json:"images"`
	DisplayCurrency string                `json:"display_currency"`
	DisplayPrice    float64               `json:"display_price"`
}

type CreateProductInput struct {
	VendorID        string
	CategoryID      *string
	NameI18n        json.RawMessage
	DescriptionI18n json.RawMessage
	PriceUSD        float64
	Stock           int
}

func (s *ProductService) Create(ctx context.Context, in CreateProductInput) (*models.Product, *apperror.AppError) {
	if in.PriceUSD < 0 {
		return nil, apperror.Validation("price_usd must not be negative")
	}
	if in.Stock < 0 {
		return nil, apperror.Validation("stock must not be negative")
	}
	if in.CategoryID != nil {
		var count int64
		if err := s.db.WithContext(ctx).Model(&models.Category{}).
			Where("id = ? AND vendor_id = ?", *in.CategoryID, in.VendorID).
			Count(&count).Error; err != nil {
			return nil, apperror.Internal(fmt.Errorf("product: verify category ownership: %w", err))
		}
		if count == 0 {
			return nil, apperror.Validation("category_id does not belong to this vendor")
		}
	}

	p := models.Product{
		ID:              newUUID(),
		VendorID:        in.VendorID,
		CategoryID:      in.CategoryID,
		NameI18n:        in.NameI18n,
		DescriptionI18n: in.DescriptionI18n,
		PriceUSD:        in.PriceUSD,
		Stock:           in.Stock,
		IsActive:        true,
	}
	if err := s.db.WithContext(ctx).Create(&p).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("product: create: %w", err))
	}
	return &p, nil
}

type UpdateProductInput struct {
	CategoryID      *string
	NameI18n        *json.RawMessage
	DescriptionI18n *json.RawMessage
	PriceUSD        *float64
	Stock           *int
	IsActive        *bool
}

// Update applies a partial update, scoped to vendorID (blueprint §5.3). A
// non-nil CategoryID is verified to belong to the same vendor before being
// applied, so a product can never be assigned to another vendor's category.
func (s *ProductService) Update(ctx context.Context, vendorID, productID string, in UpdateProductInput) *apperror.AppError {
	updates := map[string]any{}
	if in.CategoryID != nil {
		var count int64
		if err := s.db.WithContext(ctx).Model(&models.Category{}).
			Where("id = ? AND vendor_id = ?", *in.CategoryID, vendorID).
			Count(&count).Error; err != nil {
			return apperror.Internal(fmt.Errorf("product: verify category ownership: %w", err))
		}
		if count == 0 {
			return apperror.Validation("category_id does not belong to this vendor")
		}
		updates["category_id"] = *in.CategoryID
	}
	if in.NameI18n != nil {
		updates["name_i18n"] = *in.NameI18n
	}
	if in.DescriptionI18n != nil {
		updates["description_i18n"] = *in.DescriptionI18n
	}
	if in.PriceUSD != nil {
		if *in.PriceUSD < 0 {
			return apperror.Validation("price_usd must not be negative")
		}
		updates["price_usd"] = *in.PriceUSD
	}
	if in.Stock != nil {
		if *in.Stock < 0 {
			return apperror.Validation("stock must not be negative")
		}
		updates["stock"] = *in.Stock
	}
	if in.IsActive != nil {
		updates["is_active"] = *in.IsActive
	}
	if len(updates) == 0 {
		return nil
	}

	result := s.db.WithContext(ctx).Model(&models.Product{}).
		Where("id = ? AND vendor_id = ?", productID, vendorID).
		Updates(updates)
	if result.Error != nil {
		return apperror.Internal(fmt.Errorf("product: update: %w", result.Error))
	}
	if result.RowsAffected == 0 {
		return apperror.NotFound("product")
	}
	return nil
}

func (s *ProductService) Delete(ctx context.Context, vendorID, productID string) *apperror.AppError {
	result := s.db.WithContext(ctx).Where("id = ? AND vendor_id = ?", productID, vendorID).Delete(&models.Product{})
	if result.Error != nil {
		return apperror.Internal(fmt.Errorf("product: delete: %w", result.Error))
	}
	if result.RowsAffected == 0 {
		return apperror.NotFound("product")
	}
	return nil
}

// List returns a vendor's products with resolved images and converted
// display prices in the vendor's display_currency (falls back to USD).
func (s *ProductService) List(ctx context.Context, vendorID string) ([]ProductWithDisplay, *apperror.AppError) {
	var products []models.Product
	if err := s.db.WithContext(ctx).Where("vendor_id = ?", vendorID).Order("created_at DESC").Find(&products).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("product: list: %w", err))
	}

	displayCurrency, appErr := s.vendorDisplayCurrency(ctx, vendorID)
	if appErr != nil {
		return nil, appErr
	}

	out := make([]ProductWithDisplay, 0, len(products))
	for _, p := range products {
		withDisplay, appErr := s.attachDisplay(ctx, p, displayCurrency)
		if appErr != nil {
			return nil, appErr
		}
		out = append(out, *withDisplay)
	}
	return out, nil
}

// GetByID returns a single product with resolved images and converted
// display price. Public — no ownership check (a store page any user can
// view, blueprint §11.C7).
func (s *ProductService) GetByID(ctx context.Context, productID string) (*ProductWithDisplay, *apperror.AppError) {
	var p models.Product
	if err := s.db.WithContext(ctx).Where("id = ?", productID).First(&p).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperror.NotFound("product")
		}
		return nil, apperror.Internal(fmt.Errorf("product: get: %w", err))
	}

	displayCurrency, appErr := s.vendorDisplayCurrency(ctx, p.VendorID)
	if appErr != nil {
		return nil, appErr
	}
	return s.attachDisplay(ctx, p, displayCurrency)
}

func (s *ProductService) vendorDisplayCurrency(ctx context.Context, vendorID string) (string, *apperror.AppError) {
	var displayCurrency *string
	if err := s.db.WithContext(ctx).Raw(`SELECT display_currency FROM vendors WHERE id = ?`, vendorID).Scan(&displayCurrency).Error; err != nil {
		return "", apperror.Internal(fmt.Errorf("product: load vendor display_currency: %w", err))
	}
	if displayCurrency == nil || *displayCurrency == "" {
		return "USD", nil
	}
	return *displayCurrency, nil
}

func (s *ProductService) attachDisplay(ctx context.Context, p models.Product, displayCurrency string) (*ProductWithDisplay, *apperror.AppError) {
	var images []models.ProductImage
	if err := s.db.WithContext(ctx).Where("product_id = ?", p.ID).Order("sort_order ASC").Find(&images).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("product: load images: %w", err))
	}
	for i := range images {
		driver, err := s.storageRegistry.Resolve(images[i].StorageDriver)
		if err != nil {
			// A file recorded against a driver that's no longer
			// configured (e.g. S3 credentials removed) shouldn't break
			// the whole product response — omit just that image's URL.
			continue
		}
		url, err := driver.URL(ctx, images[i].ObjectKey, 0)
		if err == nil {
			images[i].URL = url
		}
	}

	displayPrice, appErr := s.currencySvc.Convert(p.PriceUSD, displayCurrency)
	if appErr != nil {
		// Currency not active/configured shouldn't 500 the whole product
		// read — fall back to USD face value.
		displayCurrency = "USD"
		displayPrice = p.PriceUSD
	}

	return &ProductWithDisplay{
		Product:         p,
		Images:          images,
		DisplayCurrency: displayCurrency,
		DisplayPrice:    displayPrice,
	}, nil
}
