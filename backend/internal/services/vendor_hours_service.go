package services

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

// VendorHoursService implements the store-hours evaluation described in
// blueprint §4.6: overrides first (date match), else weekly recurring
// hours for the weekday, always evaluated in the vendor's own timezone —
// never UTC or the server's local time.
type VendorHoursService struct {
	db *gorm.DB
}

func NewVendorHoursService(db *gorm.DB) *VendorHoursService {
	return &VendorHoursService{db: db}
}

// OpenStatus is the result of IsOpenNow: whether the vendor is currently
// open, and if not, when it next opens (best-effort — nil if it can't be
// determined, e.g. every day is marked closed).
type OpenStatus struct {
	IsOpen      bool
	NextOpenAt  *time.Time
	CheckedAtTZ string // IANA zone name used for the evaluation, for client display
}

// IsOpenNow evaluates whether vendorID is open at "at" (typically time.Now()
// in UTC — this function converts internally to the vendor's timezone).
func (s *VendorHoursService) IsOpenNow(ctx context.Context, vendorID string, at time.Time) (*OpenStatus, *apperror.AppError) {
	var timezone string
	if err := s.db.WithContext(ctx).Raw(`SELECT timezone FROM vendors WHERE id = ?`, vendorID).Scan(&timezone).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("hours: load vendor timezone: %w", err))
	}
	if timezone == "" {
		return nil, apperror.NotFound("vendor")
	}

	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("hours: invalid vendor timezone %q: %w", timezone, err))
	}
	local := at.In(loc)
	dateStr := local.Format("2006-01-02")

	var override models.VendorHourOverride
	overrideErr := s.db.WithContext(ctx).
		Where("vendor_id = ? AND date = ?", vendorID, dateStr).
		First(&override).Error
	switch {
	case overrideErr == nil:
		return s.evaluateOverride(override, local, loc), nil
	case overrideErr != gorm.ErrRecordNotFound:
		return nil, apperror.Internal(fmt.Errorf("hours: load override: %w", overrideErr))
	}

	// 0=Sunday to match Postgres's/blueprint's day_of_week convention.
	weekday := int(local.Weekday())
	var hours []models.VendorHour
	if err := s.db.WithContext(ctx).
		Where("vendor_id = ? AND day_of_week = ?", vendorID, weekday).
		Find(&hours).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("hours: load weekly hours: %w", err))
	}

	return s.evaluateWeeklyHours(hours, local, loc), nil
}

func (s *VendorHoursService) evaluateOverride(o models.VendorHourOverride, local time.Time, loc *time.Location) *OpenStatus {
	if o.IsClosed || o.OpenTime == nil || o.CloseTime == nil {
		return &OpenStatus{IsOpen: false, CheckedAtTZ: loc.String()}
	}
	open, closeT, ok := parseTimeWindow(local, *o.OpenTime, *o.CloseTime)
	if !ok {
		return &OpenStatus{IsOpen: false, CheckedAtTZ: loc.String()}
	}
	isOpen := !local.Before(open) && local.Before(closeT)
	status := &OpenStatus{IsOpen: isOpen, CheckedAtTZ: loc.String()}
	if !isOpen && local.Before(open) {
		status.NextOpenAt = &open
	}
	return status
}

func (s *VendorHoursService) evaluateWeeklyHours(hours []models.VendorHour, local time.Time, loc *time.Location) *OpenStatus {
	status := &OpenStatus{IsOpen: false, CheckedAtTZ: loc.String()}
	var earliestUpcoming *time.Time

	for _, h := range hours {
		if h.IsClosed {
			continue
		}
		open, closeT, ok := parseTimeWindow(local, h.OpenTime, h.CloseTime)
		if !ok {
			continue
		}
		if !local.Before(open) && local.Before(closeT) {
			status.IsOpen = true
			return status
		}
		if local.Before(open) && (earliestUpcoming == nil || open.Before(*earliestUpcoming)) {
			earliestUpcoming = &open
		}
	}

	status.NextOpenAt = earliestUpcoming
	return status
}

// parseTimeWindow builds today's open/close instants in the vendor's
// timezone from TIME-of-day strings ("HH:MM:SS"). Split shifts spanning
// midnight are not supported (close must be after open on the same day) —
// represent an overnight shift as two rows instead, consistent with the
// blueprint's "multiple rows per day allow split shifts" design.
func parseTimeWindow(local time.Time, openStr, closeStr string) (time.Time, time.Time, bool) {
	openT, err := time.Parse("15:04:05", trimSeconds(openStr))
	if err != nil {
		return time.Time{}, time.Time{}, false
	}
	closeT, err := time.Parse("15:04:05", trimSeconds(closeStr))
	if err != nil {
		return time.Time{}, time.Time{}, false
	}
	loc := local.Location()
	openAt := time.Date(local.Year(), local.Month(), local.Day(), openT.Hour(), openT.Minute(), openT.Second(), 0, loc)
	closeAt := time.Date(local.Year(), local.Month(), local.Day(), closeT.Hour(), closeT.Minute(), closeT.Second(), 0, loc)
	if !closeAt.After(openAt) {
		return time.Time{}, time.Time{}, false
	}
	return openAt, closeAt, true
}

// trimSeconds normalizes a Postgres TIME string, which may come back as
// "HH:MM:SS" already but defensively handles a shorter "HH:MM" form too.
func trimSeconds(s string) string {
	if len(s) == 5 {
		return s + ":00"
	}
	return s
}
