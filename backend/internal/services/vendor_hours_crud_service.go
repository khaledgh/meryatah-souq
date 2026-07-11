package services

import (
	"context"
	"fmt"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

// SetWeeklyHours replaces all vendor_hours rows for a vendor with the
// given set (blueprint §11.B4: weekly grid, split shifts via multiple rows
// per day). Ownership is checked by the caller before invoking this.
func (s *VendorHoursService) SetWeeklyHours(ctx context.Context, vendorID string, rows []models.VendorHour) *apperror.AppError {
	for _, r := range rows {
		if r.DayOfWeek < 0 || r.DayOfWeek > 6 {
			return apperror.Validation("day_of_week must be between 0 and 6")
		}
	}

	txErr := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("vendor_id = ?", vendorID).Delete(&models.VendorHour{}).Error; err != nil {
			return fmt.Errorf("delete existing hours: %w", err)
		}
		for i := range rows {
			rows[i].ID = newUUID()
			rows[i].VendorID = vendorID
		}
		if len(rows) > 0 {
			if err := tx.Create(&rows).Error; err != nil {
				return fmt.Errorf("create new hours: %w", err)
			}
		}
		return nil
	})
	if txErr != nil {
		return apperror.Internal(fmt.Errorf("hours: set weekly hours: %w", txErr))
	}
	return nil
}

// ListWeeklyHours returns all vendor_hours rows for a vendor.
func (s *VendorHoursService) ListWeeklyHours(ctx context.Context, vendorID string) ([]models.VendorHour, *apperror.AppError) {
	rows := make([]models.VendorHour, 0)
	if err := s.db.WithContext(ctx).Where("vendor_id = ?", vendorID).Order("day_of_week ASC").Find(&rows).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("hours: list weekly hours: %w", err))
	}
	return rows, nil
}

// UpsertOverride creates or replaces a date-specific override (holiday,
// special hours) for a vendor (blueprint §3.3 unique (vendor_id, date)).
// The Assign set deliberately excludes ID: on the update path, Assign's
// attrs are applied to the existing row via UPDATE, and including a
// freshly-generated ID would overwrite the existing row's primary key on
// every call instead of preserving row identity.
func (s *VendorHoursService) UpsertOverride(ctx context.Context, o models.VendorHourOverride) *apperror.AppError {
	newID := o.ID
	if newID == "" {
		newID = newUUID()
	}

	var existing models.VendorHourOverride
	err := s.db.WithContext(ctx).
		Where("vendor_id = ? AND date = ?", o.VendorID, o.Date).
		Assign(map[string]any{
			"is_closed":  o.IsClosed,
			"open_time":  o.OpenTime,
			"close_time": o.CloseTime,
			"note":       o.Note,
		}).
		Attrs(map[string]any{"id": newID}).
		FirstOrCreate(&existing).Error
	if err != nil {
		return apperror.Internal(fmt.Errorf("hours: upsert override: %w", err))
	}
	return nil
}

// ListOverrides returns all overrides for a vendor, most recent first.
func (s *VendorHoursService) ListOverrides(ctx context.Context, vendorID string) ([]models.VendorHourOverride, *apperror.AppError) {
	rows := make([]models.VendorHourOverride, 0)
	if err := s.db.WithContext(ctx).Where("vendor_id = ?", vendorID).Order("date DESC").Find(&rows).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("hours: list overrides: %w", err))
	}
	return rows, nil
}

// DeleteOverride removes a single override by ID, scoped to vendorID so a
// caller can't delete another vendor's override by guessing an ID.
func (s *VendorHoursService) DeleteOverride(ctx context.Context, vendorID, overrideID string) *apperror.AppError {
	if err := s.db.WithContext(ctx).
		Where("id = ? AND vendor_id = ?", overrideID, vendorID).
		Delete(&models.VendorHourOverride{}).Error; err != nil {
		return apperror.Internal(fmt.Errorf("hours: delete override: %w", err))
	}
	return nil
}
