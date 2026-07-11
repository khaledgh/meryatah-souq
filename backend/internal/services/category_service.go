package services

import (
	"context"
	"encoding/json"
	"fmt"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

// CategoryService implements vendor-scoped category CRUD (blueprint
// §11.B6). Ownership of the parent vendor is checked by the caller
// (middleware.RequireVendorOwnership) before any of these are invoked.
type CategoryService struct {
	db *gorm.DB
}

func NewCategoryService(db *gorm.DB) *CategoryService {
	return &CategoryService{db: db}
}

func (s *CategoryService) List(ctx context.Context, vendorID string) ([]models.Category, *apperror.AppError) {
	rows := make([]models.Category, 0)
	if err := s.db.WithContext(ctx).Where("vendor_id = ?", vendorID).Order("sort_order ASC").Find(&rows).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("category: list: %w", err))
	}
	return rows, nil
}

func (s *CategoryService) Create(ctx context.Context, vendorID string, nameI18n json.RawMessage, sortOrder int) (*models.Category, *apperror.AppError) {
	c := models.Category{ID: newUUID(), VendorID: vendorID, NameI18n: nameI18n, SortOrder: sortOrder}
	if err := s.db.WithContext(ctx).Create(&c).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("category: create: %w", err))
	}
	return &c, nil
}

// Update applies a partial update, scoped to vendorID so a caller can't
// modify another vendor's category by guessing its ID (blueprint §5.3).
func (s *CategoryService) Update(ctx context.Context, vendorID, categoryID string, nameI18n *json.RawMessage, sortOrder *int) *apperror.AppError {
	updates := map[string]any{}
	if nameI18n != nil {
		updates["name_i18n"] = *nameI18n
	}
	if sortOrder != nil {
		updates["sort_order"] = *sortOrder
	}
	if len(updates) == 0 {
		return nil
	}
	result := s.db.WithContext(ctx).Model(&models.Category{}).
		Where("id = ? AND vendor_id = ?", categoryID, vendorID).
		Updates(updates)
	if result.Error != nil {
		return apperror.Internal(fmt.Errorf("category: update: %w", result.Error))
	}
	if result.RowsAffected == 0 {
		return apperror.NotFound("category")
	}
	return nil
}

// Delete removes a category, scoped to vendorID. Products referencing it
// have category_id set to NULL by the FK's ON DELETE SET NULL (blueprint
// §3.3) — they are not deleted.
func (s *CategoryService) Delete(ctx context.Context, vendorID, categoryID string) *apperror.AppError {
	result := s.db.WithContext(ctx).Where("id = ? AND vendor_id = ?", categoryID, vendorID).Delete(&models.Category{})
	if result.Error != nil {
		return apperror.Internal(fmt.Errorf("category: delete: %w", result.Error))
	}
	if result.RowsAffected == 0 {
		return apperror.NotFound("category")
	}
	return nil
}
