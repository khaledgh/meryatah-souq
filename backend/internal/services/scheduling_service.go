package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

// SchedulingService generates available delivery slots for a vendor
// (blueprint §4.7, §8): scheduling_config intersected with store hours,
// capacity-capped by existing orders per slot. Requires both
// scheduling_allowed (admin) and scheduling_enabled (vendor).
type SchedulingService struct {
	db       *gorm.DB
	hoursSvc *VendorHoursService
}

func NewSchedulingService(db *gorm.DB, hoursSvc *VendorHoursService) *SchedulingService {
	return &SchedulingService{db: db, hoursSvc: hoursSvc}
}

type schedulingConfig struct {
	SlotMinutes  int `json:"slot_minutes"`
	LeadMinutes  int `json:"lead_minutes"`
	MaxDaysAhead int `json:"max_days_ahead"`
	MaxPerSlot   int `json:"max_per_slot"`
}

// Slot is one bookable delivery window.
type Slot struct {
	StartAt      time.Time `json:"start_at"`
	EndAt        time.Time `json:"end_at"`
	RemainingCap int       `json:"remaining_capacity"`
}

// AvailableSlots returns bookable slots for the next scheduling_config's
// max_days_ahead days, intersected with store hours and capacity-checked
// against existing scheduled orders. Returns a Validation error if
// scheduling isn't both admin-allowed and vendor-enabled.
//
// Runs three queries total (vendor config, all vendor_hours + overrides
// for the window, and existing booking counts grouped by slot) rather than
// one query per candidate slot per day — the naive per-slot approach was
// measured at over two minutes for a 7-day/30-minute-slot/24-hour vendor in
// testing, which is unusable for a request-path endpoint.
func (s *SchedulingService) AvailableSlots(ctx context.Context, vendorID string) ([]Slot, *apperror.AppError) {
	var allowed, enabled bool
	var configRaw json.RawMessage
	var timezone string
	err := s.db.WithContext(ctx).Raw(`
		SELECT scheduling_allowed, scheduling_enabled, scheduling_config, timezone FROM vendors WHERE id = ?
	`, vendorID).Row().Scan(&allowed, &enabled, &configRaw, &timezone)
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("scheduling: load vendor config: %w", err))
	}
	if !allowed || !enabled {
		return nil, apperror.Validation("scheduling is not available for this vendor")
	}

	var cfg schedulingConfig
	if err := json.Unmarshal(configRaw, &cfg); err != nil {
		return nil, apperror.Internal(fmt.Errorf("scheduling: parse scheduling_config: %w", err))
	}
	if cfg.SlotMinutes <= 0 {
		return nil, apperror.Internal(fmt.Errorf("scheduling: scheduling_config.slot_minutes must be positive"))
	}
	if cfg.MaxDaysAhead <= 0 {
		cfg.MaxDaysAhead = 7
	}
	if cfg.MaxPerSlot <= 0 {
		cfg.MaxPerSlot = 1
	}

	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("scheduling: invalid vendor timezone %q: %w", timezone, err))
	}

	now := time.Now().In(loc)
	earliestBookable := time.Now().Add(time.Duration(cfg.LeadMinutes) * time.Minute)
	windowStart := now.Truncate(24 * time.Hour)
	windowEnd := windowStart.AddDate(0, 0, cfg.MaxDaysAhead+1)

	weeklyHours, appErr := s.loadWeeklyHours(ctx, vendorID)
	if appErr != nil {
		return nil, appErr
	}
	overridesByDate, appErr := s.loadOverrides(ctx, vendorID, windowStart, windowEnd)
	if appErr != nil {
		return nil, appErr
	}

	slotDur := time.Duration(cfg.SlotMinutes) * time.Minute
	var windows []struct{ start, end time.Time }
	for day := now.Truncate(24 * time.Hour); day.Before(windowEnd); day = day.AddDate(0, 0, 1) {
		open, closeT, ok := resolveOpenWindow(day, weeklyHours, overridesByDate)
		if !ok {
			continue
		}
		for start := open; start.Add(slotDur).Compare(closeT) <= 0; start = start.Add(slotDur) {
			if start.Before(earliestBookable) {
				continue
			}
			windows = append(windows, struct{ start, end time.Time }{start, start.Add(slotDur)})
		}
	}
	if len(windows) == 0 {
		return nil, nil
	}

	bookedCounts, appErr := s.loadBookedCounts(ctx, vendorID, windows[0].start, windows[len(windows)-1].end)
	if appErr != nil {
		return nil, appErr
	}

	slots := make([]Slot, 0, len(windows))
	for _, w := range windows {
		remaining := cfg.MaxPerSlot - bookedCounts[w.start.UTC()]
		if remaining <= 0 {
			continue
		}
		slots = append(slots, Slot{StartAt: w.start, EndAt: w.end, RemainingCap: remaining})
	}
	return slots, nil
}

func (s *SchedulingService) loadWeeklyHours(ctx context.Context, vendorID string) (map[int]models.VendorHour, *apperror.AppError) {
	var rows []models.VendorHour
	if err := s.db.WithContext(ctx).Where("vendor_id = ?", vendorID).Find(&rows).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("scheduling: load weekly hours: %w", err))
	}
	byDay := make(map[int]models.VendorHour, len(rows))
	for _, r := range rows {
		byDay[r.DayOfWeek] = r
	}
	return byDay, nil
}

func (s *SchedulingService) loadOverrides(ctx context.Context, vendorID string, from, to time.Time) (map[string]models.VendorHourOverride, *apperror.AppError) {
	var rows []models.VendorHourOverride
	if err := s.db.WithContext(ctx).
		Where("vendor_id = ? AND date >= ? AND date < ?", vendorID, from.Format("2006-01-02"), to.Format("2006-01-02")).
		Find(&rows).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("scheduling: load overrides: %w", err))
	}
	byDate := make(map[string]models.VendorHourOverride, len(rows))
	for _, r := range rows {
		byDate[r.Date] = r
	}
	return byDate, nil
}

// loadBookedCounts returns, for every distinct slot-start timestamp with
// at least one non-cancelled scheduled order in [from, to), the count of
// such orders — one grouped query instead of one COUNT per slot.
func (s *SchedulingService) loadBookedCounts(ctx context.Context, vendorID string, from, to time.Time) (map[time.Time]int, *apperror.AppError) {
	type row struct {
		ScheduledFor time.Time
		Count        int
	}
	var rows []row
	err := s.db.WithContext(ctx).Raw(`
		SELECT scheduled_for AS scheduled_for, count(*) AS count
		FROM orders
		WHERE vendor_id = ? AND scheduled_for >= ? AND scheduled_for < ? AND status != 'cancelled'
		GROUP BY scheduled_for
	`, vendorID, from, to).Scan(&rows).Error
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("scheduling: load booked counts: %w", err))
	}
	counts := make(map[time.Time]int, len(rows))
	for _, r := range rows {
		counts[r.ScheduledFor.UTC()] = r.Count
	}
	return counts, nil
}

// resolveOpenWindow returns the vendor's open/close instants for the given
// calendar day using pre-loaded hours/overrides (override first, else
// weekly hours), or ok=false if closed all day.
func resolveOpenWindow(day time.Time, weeklyHours map[int]models.VendorHour, overridesByDate map[string]models.VendorHourOverride) (time.Time, time.Time, bool) {
	dateStr := day.Format("2006-01-02")

	if o, ok := overridesByDate[dateStr]; ok {
		if o.IsClosed || o.OpenTime == nil || o.CloseTime == nil {
			return time.Time{}, time.Time{}, false
		}
		return parseTimeWindow(day, *o.OpenTime, *o.CloseTime)
	}

	h, ok := weeklyHours[int(day.Weekday())]
	if !ok || h.IsClosed {
		return time.Time{}, time.Time{}, false
	}
	return parseTimeWindow(day, h.OpenTime, h.CloseTime)
}

// ValidateSlot confirms a requested scheduledFor instant falls on a valid,
// non-full slot boundary for vendorID (called at order-placement time to
// prevent booking outside generated slots or into a full slot).
func (s *SchedulingService) ValidateSlot(ctx context.Context, vendorID string, scheduledFor time.Time) *apperror.AppError {
	slots, appErr := s.AvailableSlots(ctx, vendorID)
	if appErr != nil {
		return appErr
	}
	for _, slot := range slots {
		if slot.StartAt.Equal(scheduledFor) {
			return nil
		}
	}
	return apperror.Validation("requested slot is not available")
}
