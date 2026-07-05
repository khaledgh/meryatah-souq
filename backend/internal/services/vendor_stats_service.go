package services

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/currency"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

// VendorStatsService computes read-only aggregates for the vendor dashboard
// (§11.B2) and earnings (§11.B11) from the orders table. All queries are
// scoped by vendor_id — the caller (route RBAC + ownership middleware)
// guarantees the vendorID belongs to the authenticated vendor, and every
// query here filters on it, so there is no cross-tenant leakage.
type VendorStatsService struct {
	db          *gorm.DB
	currencySvc *currency.Service
}

func NewVendorStatsService(db *gorm.DB, currencySvc *currency.Service) *VendorStatsService {
	return &VendorStatsService{db: db, currencySvc: currencySvc}
}

// statusCount is one row of the "orders by status" breakdown.
type statusCount struct {
	Status string `json:"status"`
	Count  int    `json:"count"`
}

// VendorDashboard is the §11.B2 KPI payload. Revenue/commission are reported
// in the vendor's display currency (converted from the canonical USD sums at
// the current rate — these are live dashboard figures, not historical order
// snapshots, so live conversion is correct here).
type VendorDashboard struct {
	TodayOrders       int           `json:"today_orders"`
	TodayRevenue      float64       `json:"today_revenue"`
	TodayCommission   float64       `json:"today_commission"`
	OpenOrders        int           `json:"open_orders"`
	DisplayCurrency   string        `json:"display_currency"`
	StatusBreakdown   []statusCount `json:"status_breakdown"`
	LifetimeDelivered int           `json:"lifetime_delivered"`
}

// Dashboard computes today's counts/revenue/commission plus a status
// breakdown for a vendor. "Today" is the server's local calendar day; a
// vendor-timezone-aware boundary is a possible refinement, but the dashboard
// is an at-a-glance figure, not an accounting close.
func (s *VendorStatsService) Dashboard(ctx context.Context, vendorID string) (*VendorDashboard, *apperror.AppError) {
	displayCurrency, appErr := s.displayCurrency(ctx, vendorID)
	if appErr != nil {
		return nil, appErr
	}

	startOfDay := time.Now().Truncate(24 * time.Hour)

	// Today's aggregates: exclude cancelled from revenue/commission but count
	// all placed orders. COALESCE guards the no-rows case (SUM → NULL).
	var todayAgg struct {
		Orders        int
		RevenueUSD    float64
		CommissionUSD float64
	}
	err := s.db.WithContext(ctx).Raw(`
		SELECT
			COUNT(*) FILTER (WHERE status <> 'cancelled')                                AS orders,
			COALESCE(SUM(subtotal_usd)   FILTER (WHERE status <> 'cancelled'), 0)        AS revenue_usd,
			COALESCE(SUM(commission_usd) FILTER (WHERE status <> 'cancelled'), 0)        AS commission_usd
		FROM orders
		WHERE vendor_id = ? AND placed_at >= ?
	`, vendorID, startOfDay).Scan(&todayAgg).Error
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("vendor_stats: today aggregates: %w", err))
	}

	var breakdown []statusCount
	if err := s.db.WithContext(ctx).Raw(`
		SELECT status, COUNT(*) AS count
		FROM orders WHERE vendor_id = ?
		GROUP BY status
	`, vendorID).Scan(&breakdown).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("vendor_stats: status breakdown: %w", err))
	}

	openOrders := 0
	lifetimeDelivered := 0
	for _, sc := range breakdown {
		switch models.OrderStatus(sc.Status) {
		case models.OrderStatusPending, models.OrderStatusAccepted, models.OrderStatusPreparing, models.OrderStatusOnTheWay:
			openOrders += sc.Count
		case models.OrderStatusDelivered:
			lifetimeDelivered += sc.Count
		}
	}

	revenue, appErr := s.currencySvc.Convert(todayAgg.RevenueUSD, displayCurrency)
	if appErr != nil {
		return nil, appErr
	}
	commission, appErr := s.currencySvc.Convert(todayAgg.CommissionUSD, displayCurrency)
	if appErr != nil {
		return nil, appErr
	}

	return &VendorDashboard{
		TodayOrders:       todayAgg.Orders,
		TodayRevenue:      revenue,
		TodayCommission:   commission,
		OpenOrders:        openOrders,
		DisplayCurrency:   displayCurrency,
		StatusBreakdown:   breakdown,
		LifetimeDelivered: lifetimeDelivered,
	}, nil
}

// EarningsRow is one day's earnings summary (§11.B11).
type EarningsRow struct {
	Day               string  `json:"day"` // "YYYY-MM-DD"
	Orders            int     `json:"orders"`
	GrossUSD          float64 `json:"gross_usd"`
	CommissionUSD     float64 `json:"commission_usd"`
	NetUSD            float64 `json:"net_usd"`
	GrossDisplay      float64 `json:"gross_display"`
	CommissionDisplay float64 `json:"commission_display"`
	NetDisplay        float64 `json:"net_display"`
}

// EarningsReport is the §11.B11 payload: per-day rows plus totals, in the
// vendor's display currency.
type EarningsReport struct {
	DisplayCurrency string        `json:"display_currency"`
	Rows            []EarningsRow `json:"rows"`
	TotalOrders     int           `json:"total_orders"`
	TotalGross      float64       `json:"total_gross"`
	TotalCommission float64       `json:"total_commission"`
	TotalNet        float64       `json:"total_net"`
}

// Earnings aggregates delivered orders by day over the last `days` days
// (default 30, capped 365). Only delivered orders count toward earnings.
// Gross/commission are summed from each order's snapshot (commission_usd is
// the snapshot taken at order time per §7), so historical rows are stable;
// the display-currency figures are a live convenience conversion for the UI.
func (s *VendorStatsService) Earnings(ctx context.Context, vendorID string, days int) (*EarningsReport, *apperror.AppError) {
	if days <= 0 {
		days = 30
	}
	if days > 365 {
		days = 365
	}
	displayCurrency, appErr := s.displayCurrency(ctx, vendorID)
	if appErr != nil {
		return nil, appErr
	}

	since := time.Now().AddDate(0, 0, -days).Truncate(24 * time.Hour)

	type dayAgg struct {
		Day           time.Time
		Orders        int
		GrossUSD      float64
		CommissionUSD float64
	}
	var rows []dayAgg
	err := s.db.WithContext(ctx).Raw(`
		SELECT date_trunc('day', delivered_at) AS day,
		       COUNT(*)                        AS orders,
		       COALESCE(SUM(subtotal_usd), 0)  AS gross_usd,
		       COALESCE(SUM(commission_usd), 0) AS commission_usd
		FROM orders
		WHERE vendor_id = ? AND status = 'delivered' AND delivered_at IS NOT NULL AND delivered_at >= ?
		GROUP BY date_trunc('day', delivered_at)
		ORDER BY day DESC
	`, vendorID, since).Scan(&rows).Error
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("vendor_stats: earnings: %w", err))
	}

	report := &EarningsReport{DisplayCurrency: displayCurrency, Rows: make([]EarningsRow, 0, len(rows))}
	for _, r := range rows {
		netUSD := r.GrossUSD - r.CommissionUSD
		grossDisplay, appErr := s.currencySvc.Convert(r.GrossUSD, displayCurrency)
		if appErr != nil {
			return nil, appErr
		}
		commissionDisplay, appErr := s.currencySvc.Convert(r.CommissionUSD, displayCurrency)
		if appErr != nil {
			return nil, appErr
		}
		netDisplay, appErr := s.currencySvc.Convert(netUSD, displayCurrency)
		if appErr != nil {
			return nil, appErr
		}

		report.Rows = append(report.Rows, EarningsRow{
			Day:               r.Day.Format("2006-01-02"),
			Orders:            r.Orders,
			GrossUSD:          r.GrossUSD,
			CommissionUSD:     r.CommissionUSD,
			NetUSD:            netUSD,
			GrossDisplay:      grossDisplay,
			CommissionDisplay: commissionDisplay,
			NetDisplay:        netDisplay,
		})
		report.TotalOrders += r.Orders
		report.TotalGross += grossDisplay
		report.TotalCommission += commissionDisplay
		report.TotalNet += netDisplay
	}

	return report, nil
}

// displayCurrency resolves the vendor's display currency, defaulting to USD.
func (s *VendorStatsService) displayCurrency(ctx context.Context, vendorID string) (string, *apperror.AppError) {
	var dc *string
	if err := s.db.WithContext(ctx).Raw(`SELECT display_currency FROM vendors WHERE id = ?`, vendorID).Scan(&dc).Error; err != nil {
		return "", apperror.Internal(fmt.Errorf("vendor_stats: display currency: %w", err))
	}
	if dc == nil || *dc == "" {
		return "USD", nil
	}
	return *dc, nil
}
