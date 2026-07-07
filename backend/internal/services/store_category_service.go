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

// StoreCategoryService implements admin CRUD for the marketplace's
// top-level sections (Food, Electronics, Market, ...). Icon upload follows
// the same storage pipeline as BannerAdService — never a plain URL string.
// Unlike a banner ad, the icon is optional: a category can exist without one
// (IconURL stays empty and the client shows its own placeholder).
type StoreCategoryService struct {
	db              *gorm.DB
	cache           *config.Cache
	storageRegistry *storage.Registry
}

func NewStoreCategoryService(db *gorm.DB, cache *config.Cache, storageRegistry *storage.Registry) *StoreCategoryService {
	return &StoreCategoryService{db: db, cache: cache, storageRegistry: storageRegistry}
}

// resolveIconURLs fills IconURL for each category from its stored
// IconKey + StorageDriver, mirroring BannerAdService.resolveImageURLs.
// Categories with no icon (or a resolve failure) are left with an empty
// IconURL — the client falls back to its own placeholder.
func (s *StoreCategoryService) resolveIconURLs(ctx context.Context, categories []models.StoreCategory) {
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

var validTemplateKinds = map[string]bool{
	"food": true, "electronics": true, "market": true, "generic": true,
}

// List returns all store categories for admin management, regardless of
// active status, priority-ordered.
func (s *StoreCategoryService) List(ctx context.Context) ([]models.StoreCategory, *apperror.AppError) {
	var categories []models.StoreCategory
	if err := s.db.WithContext(ctx).Order("sort_order ASC").Find(&categories).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("store_category: list: %w", err))
	}
	s.resolveIconURLs(ctx, categories)
	return categories, nil
}

// ListActive returns active store categories only — the public listing the
// mobile home screen renders as section tiles.
func (s *StoreCategoryService) ListActive(ctx context.Context) ([]models.StoreCategory, *apperror.AppError) {
	var categories []models.StoreCategory
	if err := s.db.WithContext(ctx).Where("is_active = true").Order("sort_order ASC").Find(&categories).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("store_category: list active: %w", err))
	}
	s.resolveIconURLs(ctx, categories)
	return categories, nil
}

type CreateStoreCategoryInput struct {
	NameI18n     []byte
	Slug         string
	TemplateKind string
	AccentColor  *string
	SortOrder    int
	IconData     []byte // optional
}

func validateStoreCategoryFields(slug, templateKind string) *apperror.AppError {
	if slug == "" {
		return apperror.Validation("slug is required")
	}
	if templateKind == "" {
		templateKind = "generic"
	}
	if !validTemplateKinds[templateKind] {
		return apperror.Validation("template_kind must be one of: food, electronics, market, generic")
	}
	return nil
}

// Create adds a new store category (super_admin only, enforced by route
// RBAC). Icon upload is optional; when provided it goes through the §5.9
// storage pipeline exactly like a banner ad's image.
func (s *StoreCategoryService) Create(ctx context.Context, in CreateStoreCategoryInput) (*models.StoreCategory, *apperror.AppError) {
	if in.TemplateKind == "" {
		in.TemplateKind = "generic"
	}
	if appErr := validateStoreCategoryFields(in.Slug, in.TemplateKind); appErr != nil {
		return nil, appErr
	}

	category := models.StoreCategory{
		ID:           newUUID(),
		NameI18n:     in.NameI18n,
		Slug:         in.Slug,
		TemplateKind: in.TemplateKind,
		AccentColor:  in.AccentColor,
		SortOrder:    in.SortOrder,
		IsActive:     true,
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
			return nil, apperror.Validation(fmt.Sprintf("store category slug %q already exists", in.Slug))
		}
		return nil, apperror.Internal(fmt.Errorf("store_category: create: %w", err))
	}

	if driver != nil {
		if url, urlErr := driver.URL(ctx, objectKey, 0); urlErr == nil {
			category.IconURL = url
		}
	}
	return &category, nil
}

type UpdateStoreCategoryInput struct {
	NameI18n     []byte
	Slug         string
	TemplateKind string
	AccentColor  *string
	SortOrder    int
	IconData     []byte // optional — when non-empty, replaces the stored icon
}

// Update edits a store category's metadata (super_admin only). The icon is
// only re-uploaded when new IconData is provided; is_active is managed
// separately via SetActive.
func (s *StoreCategoryService) Update(ctx context.Context, id string, in UpdateStoreCategoryInput) (*models.StoreCategory, *apperror.AppError) {
	if appErr := validateStoreCategoryFields(in.Slug, in.TemplateKind); appErr != nil {
		return nil, appErr
	}

	var category models.StoreCategory
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&category).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperror.NotFound("store category")
		}
		return nil, apperror.Internal(fmt.Errorf("store_category: load for update: %w", err))
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
	category.TemplateKind = in.TemplateKind
	category.AccentColor = in.AccentColor
	category.SortOrder = in.SortOrder

	if err := s.db.WithContext(ctx).Model(&models.StoreCategory{}).Where("id = ?", id).
		Updates(map[string]any{
			"name_i18n":      category.NameI18n,
			"slug":           category.Slug,
			"template_kind":  category.TemplateKind,
			"accent_color":   category.AccentColor,
			"icon_key":       category.IconKey,
			"storage_driver": category.StorageDriver,
			"sort_order":     category.SortOrder,
		}).Error; err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == postgresUniqueViolation {
			return nil, apperror.Validation(fmt.Sprintf("store category slug %q already exists", in.Slug))
		}
		return nil, apperror.Internal(fmt.Errorf("store_category: update: %w", err))
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

// SetActive toggles a store category on/off (super_admin only).
func (s *StoreCategoryService) SetActive(ctx context.Context, id string, active bool) *apperror.AppError {
	result := s.db.WithContext(ctx).Model(&models.StoreCategory{}).Where("id = ?", id).Update("is_active", active)
	if result.Error != nil {
		return apperror.Internal(fmt.Errorf("store_category: set active: %w", result.Error))
	}
	if result.RowsAffected == 0 {
		return apperror.NotFound("store category")
	}
	return nil
}

// Delete removes a store category and best-effort deletes its stored icon.
// Vendors referencing it keep their store_category_id but it will point at
// nothing (ON DELETE is not RESTRICT on vendors.store_category_id) — callers
// should confirm no active vendors depend on it before deleting in practice;
// enforcing that is left to the admin UI's confirmation step.
func (s *StoreCategoryService) Delete(ctx context.Context, id string) *apperror.AppError {
	var category models.StoreCategory
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&category).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return apperror.NotFound("store category")
		}
		return apperror.Internal(fmt.Errorf("store_category: load: %w", err))
	}
	if err := s.db.WithContext(ctx).Delete(&category).Error; err != nil {
		return apperror.Internal(fmt.Errorf("store_category: delete: %w", err))
	}
	if category.IconKey != nil && category.StorageDriver != nil {
		if driver, resolveErr := s.storageRegistry.Resolve(*category.StorageDriver); resolveErr == nil {
			_ = driver.Delete(ctx, *category.IconKey)
		}
	}
	return nil
}
