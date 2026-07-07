package services

import (
	"bytes"
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"

	"meryata-souq/backend/internal/config"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/storage"
)

// ProductCategoryService implements admin CRUD for the global product
// taxonomy (Drinks, Laptops, Leafy Greens, ...), including subcategories via
// a self-referencing ParentID. This is entirely separate from the existing
// vendor-scoped `categories` table (per-store menu sections) — see
// CategoryService for that one; do not confuse the two.
type ProductCategoryService struct {
	db              *gorm.DB
	cache           *config.Cache
	storageRegistry *storage.Registry
}

func NewProductCategoryService(db *gorm.DB, cache *config.Cache, storageRegistry *storage.Registry) *ProductCategoryService {
	return &ProductCategoryService{db: db, cache: cache, storageRegistry: storageRegistry}
}

func (s *ProductCategoryService) resolveIconURLs(ctx context.Context, categories []models.ProductCategory) {
	for i := range categories {
		if categories[i].IconKey == nil || categories[i].StorageDriver == nil {
			continue
		}
		if driver, resolveErr := s.storageRegistry.Resolve(*categories[i].StorageDriver); resolveErr == nil {
			if url, urlErr := driver.URL(ctx, *categories[i].IconKey, 0); urlErr == nil {
				categories[i].IconURL = url
			}
		}
	}
}

// List returns all product categories for admin management, priority-ordered.
func (s *ProductCategoryService) List(ctx context.Context) ([]models.ProductCategory, *apperror.AppError) {
	var categories []models.ProductCategory
	if err := s.db.WithContext(ctx).Order("sort_order ASC").Find(&categories).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("product_category: list: %w", err))
	}
	s.resolveIconURLs(ctx, categories)
	return categories, nil
}

// ListActive returns active product categories, optionally scoped to a
// store category — used by the public "product categories for this section"
// endpoint the mobile app calls.
func (s *ProductCategoryService) ListActive(ctx context.Context, storeCategoryID string) ([]models.ProductCategory, *apperror.AppError) {
	query := s.db.WithContext(ctx).Where("is_active = true")
	if storeCategoryID != "" {
		query = query.Where("store_category_id = ?", storeCategoryID)
	}
	var categories []models.ProductCategory
	if err := query.Order("sort_order ASC").Find(&categories).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("product_category: list active: %w", err))
	}
	s.resolveIconURLs(ctx, categories)
	return categories, nil
}

// validateParent rejects a parent that doesn't exist, or that would create a
// cycle (a category cannot be its own ancestor). selfID is empty on create.
func (s *ProductCategoryService) validateParent(ctx context.Context, selfID string, parentID *string) *apperror.AppError {
	if parentID == nil || *parentID == "" {
		return nil
	}
	if *parentID == selfID {
		return apperror.Validation("a category cannot be its own parent")
	}
	var parent models.ProductCategory
	if err := s.db.WithContext(ctx).Where("id = ?", *parentID).First(&parent).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return apperror.Validation("parent category does not exist")
		}
		return apperror.Internal(fmt.Errorf("product_category: load parent: %w", err))
	}
	// Walk up the parent's ancestor chain; if selfID appears, this would be
	// a cycle. Bounded by a depth cap so a corrupt chain can't loop forever.
	if selfID != "" {
		current := parent.ParentID
		for depth := 0; current != nil && depth < 50; depth++ {
			if *current == selfID {
				return apperror.Validation("assigning this parent would create a category cycle")
			}
			var ancestor models.ProductCategory
			if err := s.db.WithContext(ctx).Where("id = ?", *current).First(&ancestor).Error; err != nil {
				break
			}
			current = ancestor.ParentID
		}
	}
	return nil
}

type CreateProductCategoryInput struct {
	NameI18n        []byte
	Slug            string
	ParentID        *string
	StoreCategoryID *string
	SortOrder       int
	IconData        []byte // optional
}

// Create adds a new product category or subcategory (super_admin only).
func (s *ProductCategoryService) Create(ctx context.Context, in CreateProductCategoryInput) (*models.ProductCategory, *apperror.AppError) {
	if in.Slug == "" {
		return nil, apperror.Validation("slug is required")
	}
	if appErr := s.validateParent(ctx, "", in.ParentID); appErr != nil {
		return nil, appErr
	}

	category := models.ProductCategory{
		ID:              newUUID(),
		NameI18n:        in.NameI18n,
		Slug:            in.Slug,
		ParentID:        in.ParentID,
		StoreCategoryID: in.StoreCategoryID,
		SortOrder:       in.SortOrder,
		IsActive:        true,
	}

	var objectKey, driverName string
	var driver storage.Storage
	if len(in.IconData) > 0 {
		validated, err := storage.ValidateImageUpload(in.IconData)
		if err != nil {
			return nil, apperror.Validation(err.Error())
		}
		key, keyErr := storage.RandomObjectKey("category-icons", validated.Extension)
		if keyErr != nil {
			return nil, apperror.Internal(keyErr)
		}
		name, resolvedDriver, resolveErr := s.storageRegistry.ResolveActive(ctx, s.cache)
		if resolveErr != nil {
			return nil, apperror.Internal(resolveErr)
		}
		if putErr := resolvedDriver.Put(ctx, key, bytes.NewReader(validated.Data), validated.ContentType); putErr != nil {
			return nil, apperror.Internal(putErr)
		}
		objectKey, driverName, driver = key, name, resolvedDriver
		category.IconKey = &objectKey
		category.StorageDriver = &driverName
	}

	if err := s.db.WithContext(ctx).Create(&category).Error; err != nil {
		if driver != nil {
			_ = driver.Delete(ctx, objectKey)
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == postgresUniqueViolation {
			return nil, apperror.Validation(fmt.Sprintf("product category slug %q already exists", in.Slug))
		}
		return nil, apperror.Internal(fmt.Errorf("product_category: create: %w", err))
	}

	if driver != nil {
		if url, urlErr := driver.URL(ctx, objectKey, 0); urlErr == nil {
			category.IconURL = url
		}
	}
	return &category, nil
}

type UpdateProductCategoryInput struct {
	NameI18n        []byte
	Slug            string
	ParentID        *string
	StoreCategoryID *string
	SortOrder       int
	IconData        []byte // optional — when non-empty, replaces the stored icon
}

// Update edits a product category/subcategory (super_admin only).
func (s *ProductCategoryService) Update(ctx context.Context, id string, in UpdateProductCategoryInput) (*models.ProductCategory, *apperror.AppError) {
	if in.Slug == "" {
		return nil, apperror.Validation("slug is required")
	}
	if appErr := s.validateParent(ctx, id, in.ParentID); appErr != nil {
		return nil, appErr
	}

	var category models.ProductCategory
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&category).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperror.NotFound("product category")
		}
		return nil, apperror.Internal(fmt.Errorf("product_category: load for update: %w", err))
	}

	oldKey, oldDriver := category.IconKey, category.StorageDriver
	iconReplaced := false
	if len(in.IconData) > 0 {
		validated, err := storage.ValidateImageUpload(in.IconData)
		if err != nil {
			return nil, apperror.Validation(err.Error())
		}
		objectKey, keyErr := storage.RandomObjectKey("category-icons", validated.Extension)
		if keyErr != nil {
			return nil, apperror.Internal(keyErr)
		}
		driverName, driver, resolveErr := s.storageRegistry.ResolveActive(ctx, s.cache)
		if resolveErr != nil {
			return nil, apperror.Internal(resolveErr)
		}
		if putErr := driver.Put(ctx, objectKey, bytes.NewReader(validated.Data), validated.ContentType); putErr != nil {
			return nil, apperror.Internal(putErr)
		}
		category.IconKey = &objectKey
		category.StorageDriver = &driverName
		iconReplaced = true
	}

	category.NameI18n = in.NameI18n
	category.Slug = in.Slug
	category.ParentID = in.ParentID
	category.StoreCategoryID = in.StoreCategoryID
	category.SortOrder = in.SortOrder

	if err := s.db.WithContext(ctx).Model(&models.ProductCategory{}).Where("id = ?", id).
		Updates(map[string]any{
			"name_i18n":         category.NameI18n,
			"slug":              category.Slug,
			"parent_id":         category.ParentID,
			"store_category_id": category.StoreCategoryID,
			"icon_key":          category.IconKey,
			"storage_driver":    category.StorageDriver,
			"sort_order":        category.SortOrder,
		}).Error; err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == postgresUniqueViolation {
			return nil, apperror.Validation(fmt.Sprintf("product category slug %q already exists", in.Slug))
		}
		return nil, apperror.Internal(fmt.Errorf("product_category: update: %w", err))
	}

	if iconReplaced && oldKey != nil && oldDriver != nil {
		if driver, resolveErr := s.storageRegistry.Resolve(*oldDriver); resolveErr == nil {
			_ = driver.Delete(ctx, *oldKey)
		}
	}

	if category.IconKey != nil && category.StorageDriver != nil {
		if driver, resolveErr := s.storageRegistry.Resolve(*category.StorageDriver); resolveErr == nil {
			if url, urlErr := driver.URL(ctx, *category.IconKey, 0); urlErr == nil {
				category.IconURL = url
			}
		}
	}
	return &category, nil
}

// SetActive toggles a product category on/off (super_admin only).
func (s *ProductCategoryService) SetActive(ctx context.Context, id string, active bool) *apperror.AppError {
	result := s.db.WithContext(ctx).Model(&models.ProductCategory{}).Where("id = ?", id).Update("is_active", active)
	if result.Error != nil {
		return apperror.Internal(fmt.Errorf("product_category: set active: %w", result.Error))
	}
	if result.RowsAffected == 0 {
		return apperror.NotFound("product category")
	}
	return nil
}

// Delete removes a product category and best-effort deletes its stored
// icon. Child subcategories cascade-delete at the DB level
// (ON DELETE CASCADE on parent_id).
func (s *ProductCategoryService) Delete(ctx context.Context, id string) *apperror.AppError {
	var category models.ProductCategory
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&category).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return apperror.NotFound("product category")
		}
		return apperror.Internal(fmt.Errorf("product_category: load: %w", err))
	}
	if err := s.db.WithContext(ctx).Delete(&category).Error; err != nil {
		return apperror.Internal(fmt.Errorf("product_category: delete: %w", err))
	}
	if category.IconKey != nil && category.StorageDriver != nil {
		if driver, resolveErr := s.storageRegistry.Resolve(*category.StorageDriver); resolveErr == nil {
			_ = driver.Delete(ctx, *category.IconKey)
		}
	}
	return nil
}
