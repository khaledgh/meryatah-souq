package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

// validTransitions enumerates the allowed order_status state machine
// (blueprint §3.4's order_status enum + §11.B9/D4's transition buttons).
// Cancellation is allowed from any non-terminal state.
var validTransitions = map[models.OrderStatus][]models.OrderStatus{
	models.OrderStatusPending:   {models.OrderStatusAccepted, models.OrderStatusCancelled},
	models.OrderStatusAccepted:  {models.OrderStatusPreparing, models.OrderStatusCancelled},
	models.OrderStatusPreparing: {models.OrderStatusOnTheWay, models.OrderStatusCancelled},
	models.OrderStatusOnTheWay:  {models.OrderStatusDelivered, models.OrderStatusCancelled},
}

// UpdateStatus transitions an order to newStatus, scoped by vendorID (the
// vendor may only transition its own orders, blueprint §5.3) and validated
// against validTransitions. Setting to "delivered" also stamps
// delivered_at. Returns apperror.Validation on an illegal transition
// rather than silently no-op'ing, so the vendor dashboard can show a clear
// error. Transitioning to on_the_way requires a driver already be assigned
// (via AssignDriver) — an order should never reach the delivery leg with
// no driver in the loop.
func (s *OrderService) UpdateStatus(ctx context.Context, vendorID, orderID string, newStatus models.OrderStatus) *apperror.AppError {
	var current models.OrderStatus
	var driverID *string
	row := s.db.WithContext(ctx).Raw(`SELECT status, driver_id FROM orders WHERE id = ? AND vendor_id = ?`, orderID, vendorID).Row()
	if err := row.Scan(&current, &driverID); err != nil {
		if err == sql.ErrNoRows {
			return apperror.NotFound("order")
		}
		return apperror.Internal(fmt.Errorf("order: load status: %w", err))
	}

	if !isValidTransition(current, newStatus) {
		return apperror.Validation(fmt.Sprintf("cannot transition order from %q to %q", current, newStatus))
	}
	if newStatus == models.OrderStatusOnTheWay && driverID == nil {
		return apperror.Validation("cannot mark on_the_way before a driver has accepted this order")
	}

	updates := map[string]any{"status": newStatus}
	if newStatus == models.OrderStatusDelivered {
		updates["delivered_at"] = time.Now()
	}

	if err := s.db.WithContext(ctx).Table("orders").Where("id = ? AND vendor_id = ?", orderID, vendorID).
		Updates(updates).Error; err != nil {
		return apperror.Internal(fmt.Errorf("order: update status: %w", err))
	}

	if s.notifications != nil {
		if order, appErr := s.loadOrder(ctx, orderID); appErr == nil {
			s.notifications.NotifyOrderStatusChanged(ctx, order)
		}
	}
	return nil
}

func isValidTransition(from, to models.OrderStatus) bool {
	for _, allowed := range validTransitions[from] {
		if allowed == to {
			return true
		}
	}
	return false
}

// driverTransitions restricts which transitions a driver (as opposed to a
// vendor) may perform (blueprint §11.D4: driver moves an order to
// on_the_way/delivered from the Active Order screen; accept/preparing and
// cancellation stay vendor-only).
var driverTransitions = map[models.OrderStatus]bool{
	models.OrderStatusOnTheWay:  true,
	models.OrderStatusDelivered: true,
}

// UpdateStatusAsDriver transitions an order to newStatus, scoped by
// driverID: only the driver already assigned to the order (via
// AssignDriver) may transition it, and only to on_the_way/delivered
// (blueprint §5.3, §11.D4). This is the counterpart to UpdateStatus, which
// is vendor-scoped and covers accepted/preparing/cancelled.
func (s *OrderService) UpdateStatusAsDriver(ctx context.Context, driverID, orderID string, newStatus models.OrderStatus) *apperror.AppError {
	if !driverTransitions[newStatus] {
		return apperror.Validation(fmt.Sprintf("drivers may not set status to %q", newStatus))
	}

	var current models.OrderStatus
	if err := s.db.WithContext(ctx).Raw(`SELECT status FROM orders WHERE id = ? AND driver_id = ?`, orderID, driverID).
		Scan(&current).Error; err != nil {
		return apperror.Internal(fmt.Errorf("order: load status: %w", err))
	}
	if current == "" {
		return apperror.NotFound("order")
	}
	if !isValidTransition(current, newStatus) {
		return apperror.Validation(fmt.Sprintf("cannot transition order from %q to %q", current, newStatus))
	}

	updates := map[string]any{"status": newStatus}
	if newStatus == models.OrderStatusDelivered {
		updates["delivered_at"] = time.Now()
	}
	if err := s.db.WithContext(ctx).Table("orders").Where("id = ? AND driver_id = ?", orderID, driverID).
		Updates(updates).Error; err != nil {
		return apperror.Internal(fmt.Errorf("order: update status as driver: %w", err))
	}

	if s.notifications != nil {
		if order, appErr := s.loadOrder(ctx, orderID); appErr == nil {
			s.notifications.NotifyOrderStatusChanged(ctx, order)
		}
	}
	return nil
}

// AssignDriver sets driver_id on an order (blueprint §11.D3 "first-accept
// wins; concurrency-safe" — implemented as a conditional UPDATE that only
// succeeds if driver_id is still NULL, so two drivers accepting
// concurrently can't both win). On failure, distinguishes "already taken"
// from "not yet accepted by the vendor" / "doesn't exist" so the driver
// app can show an accurate message rather than one conflated string.
func (s *OrderService) AssignDriver(ctx context.Context, orderID, driverID string) *apperror.AppError {
	result := s.db.WithContext(ctx).Exec(`
		UPDATE orders SET driver_id = ? WHERE id = ? AND driver_id IS NULL AND status = 'accepted'
	`, driverID, orderID)
	if result.Error != nil {
		return apperror.Internal(fmt.Errorf("order: assign driver: %w", result.Error))
	}
	if result.RowsAffected > 0 {
		return nil
	}

	var status models.OrderStatus
	var hasDriver bool
	err := s.db.WithContext(ctx).Raw(`SELECT status, driver_id IS NOT NULL FROM orders WHERE id = ?`, orderID).
		Row().Scan(&status, &hasDriver)
	if err != nil {
		if err == sql.ErrNoRows {
			return apperror.NotFound("order")
		}
		return apperror.Internal(fmt.Errorf("order: check assign-driver failure reason: %w", err))
	}
	if hasDriver {
		return apperror.New("ORDER_ALREADY_ASSIGNED", 409, "order already has a driver",
			"This order has already been taken by another driver.")
	}
	return apperror.New("ORDER_NOT_ACCEPTED", 409, fmt.Sprintf("order status is %q, not accepted", status),
		"This order is not yet available for pickup.")
}

// ListForVendor returns a vendor's orders, optionally filtered by status,
// most recent first (blueprint §11.B9). Uses the shared raw-SQL column
// list (orderSelectColumns) so delivery_longitude/delivery_latitude are
// populated the same way loadOrderTx populates them for a freshly placed
// order — a plain GORM Find here would silently leave those fields zero.
func (s *OrderService) ListForVendor(ctx context.Context, vendorID string, status *models.OrderStatus) ([]models.Order, *apperror.AppError) {
	query := orderSelectColumns + ` WHERE vendor_id = ?`
	args := []any{vendorID}
	if status != nil {
		query += ` AND status = ?`
		args = append(args, *status)
	}
	query += ` ORDER BY placed_at DESC`

	var orders []models.Order
	if err := s.db.WithContext(ctx).Raw(query, args...).Scan(&orders).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("order: list for vendor: %w", err))
	}
	s.populateOrderItems(ctx, orders)
	return orders, nil
}

// AdminOrderFilter narrows AdminListAll's results (blueprint §11.A13:
// filters vendor, status, scheduled, date). All fields optional.
type AdminOrderFilter struct {
	VendorID      *string
	Status        *models.OrderStatus
	ScheduledOnly bool
	PlacedAfter   *time.Time
	PlacedBefore  *time.Time
}

// AdminListAll returns orders across every vendor for the super_admin
// global orders view (blueprint §11.A13), most recent first. super_admin
// route RBAC (not per-vendor ownership) gates this — unlike ListForVendor,
// there is no tenant-isolation filter here by design, since this endpoint
// IS the cross-tenant admin view.
func (s *OrderService) AdminListAll(ctx context.Context, filter AdminOrderFilter) ([]models.Order, *apperror.AppError) {
	query := orderSelectColumns + ` WHERE 1=1`
	var args []any
	if filter.VendorID != nil {
		query += ` AND vendor_id = ?`
		args = append(args, *filter.VendorID)
	}
	if filter.Status != nil {
		query += ` AND status = ?`
		args = append(args, *filter.Status)
	}
	if filter.ScheduledOnly {
		query += ` AND scheduled_for IS NOT NULL`
	}
	if filter.PlacedAfter != nil {
		query += ` AND placed_at >= ?`
		args = append(args, *filter.PlacedAfter)
	}
	if filter.PlacedBefore != nil {
		query += ` AND placed_at <= ?`
		args = append(args, *filter.PlacedBefore)
	}
	query += ` ORDER BY placed_at DESC LIMIT 200`

	var orders []models.Order
	if err := s.db.WithContext(ctx).Raw(query, args...).Scan(&orders).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("order: admin list all: %w", err))
	}
	s.populateOrderItems(ctx, orders)
	return orders, nil
}

// ListForUser returns a user's own order history (blueprint §11.C11).
func (s *OrderService) ListForUser(ctx context.Context, userID string) ([]models.Order, *apperror.AppError) {
	var orders []models.Order
	if err := s.db.WithContext(ctx).Raw(orderSelectColumns+` WHERE user_id = ? ORDER BY placed_at DESC`, userID).
		Scan(&orders).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("order: list for user: %w", err))
	}
	s.populateOrderItems(ctx, orders)
	return orders, nil
}

// GetForUser returns a single order, scoped to userID (blueprint §5.3: a
// user may only read their own orders).
func (s *OrderService) GetForUser(ctx context.Context, userID, orderID string) (*models.Order, *apperror.AppError) {
	var o models.Order
	err := s.db.WithContext(ctx).Raw(orderSelectColumns+` WHERE id = ? AND user_id = ?`, orderID, userID).Scan(&o).Error
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("order: get for user: %w", err))
	}
	if o.ID == "" {
		return nil, apperror.NotFound("order")
	}
	var items []models.OrderItem
	if err := s.db.WithContext(ctx).Where("order_id = ?", o.ID).Find(&items).Error; err == nil {
		o.Items = items
	}
	return &o, nil
}

// SetDriverOnline flips the authenticated driver's availability (blueprint
// §11.D2). Going offline intentionally does not touch driver_locations —
// the last known position is retained (admin/history view), it's just
// excluded from ListAvailableForDrivers' matching pool while offline.
func (s *OrderService) SetDriverOnline(ctx context.Context, driverID string, isOnline bool) *apperror.AppError {
	if err := s.db.WithContext(ctx).Table("users").Where("id = ? AND role = 'driver'", driverID).
		Update("is_online", isOnline).Error; err != nil {
		return apperror.Internal(fmt.Errorf("order: set driver online: %w", err))
	}
	return nil
}

// AvailableOrder is a lighter projection than models.Order for the driver's
// incoming-requests list (blueprint §11.D3: "pickup vendor, drop-off,
// distance, payout"), since a driver deciding whether to accept needs
// vendor identity, not the full order/currency/commission snapshot.
type AvailableOrder struct {
	ID                string  `json:"id"`
	VendorID          string  `json:"vendor_id"`
	VendorName        string  `json:"vendor_name"`
	VendorLongitude   float64 `json:"vendor_longitude"`
	VendorLatitude    float64 `json:"vendor_latitude"`
	DeliveryLongitude float64 `json:"delivery_longitude"`
	DeliveryLatitude  float64 `json:"delivery_latitude"`
	SubtotalUSD       float64 `json:"subtotal_usd"`
	PlacedAt          string  `json:"placed_at"`

	// PickupDistanceMeters is the road-agnostic geodesic distance from the
	// driver's last known position to the pickup. Populated only when the
	// driver has reported a position (see ListAvailableForDrivers) — not a
	// real column, computed by ST_Distance at read time, so it must carry an
	// ordinary column tag, never gorm:"-" (which silently breaks GORM's
	// raw-SQL Scan mapping).
	PickupDistanceMeters float64 `gorm:"column:pickup_distance_meters" json:"pickup_distance_meters"`
}

// availableOrderRadiusMeters bounds how far from a driver an offerable
// pickup can be. Without it, every online driver is shown every unassigned
// order in the country — noise for them, and an unbounded result set for us.
const availableOrderRadiusMeters = 15000

// availableOrderLimit caps the result set regardless of radius.
const availableOrderLimit = 50

// ListAvailableForDrivers returns orders a driver could accept — vendor has
// confirmed (accepted/preparing) but no driver assigned yet — restricted to
// callers who are online, active, and phone-verified (blueprint: "only
// active+verified drivers receive requests"), and to pickups within
// availableOrderRadiusMeters of the driver's last known position, nearest
// first. Read-only: accepting still goes through AssignDriver's
// concurrency-safe conditional UPDATE.
//
// A driver who has never reported a position (just came online, GPS not yet
// fixed) gets the unfiltered list rather than an empty one — showing them
// nothing would be a worse failure than showing them a distant order.
func (s *OrderService) ListAvailableForDrivers(ctx context.Context, driverID string) ([]AvailableOrder, *apperror.AppError) {
	var eligible bool
	err := s.db.WithContext(ctx).Raw(`
		SELECT is_active AND phone_verified AND is_online FROM users WHERE id = ? AND role = 'driver'
	`, driverID).Scan(&eligible).Error
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("order: check driver eligibility: %w", err))
	}
	if !eligible {
		return []AvailableOrder{}, nil
	}

	const selectCols = `
		SELECT o.id, o.vendor_id,
		       COALESCE(v.name_i18n->>'en', '') AS vendor_name,
		       ST_X(v.location::geometry) AS vendor_longitude, ST_Y(v.location::geometry) AS vendor_latitude,
		       ST_X(o.delivery_point::geometry) AS delivery_longitude, ST_Y(o.delivery_point::geometry) AS delivery_latitude,
		       o.subtotal_usd, o.placed_at`

	var orders []AvailableOrder

	lon, lat, _, hasPosition, appErr := s.driverPosition(ctx, driverID)
	if appErr != nil {
		return nil, appErr
	}

	if hasPosition {
		err = s.db.WithContext(ctx).Raw(selectCols+`,
			       ST_Distance(v.location, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography) AS pickup_distance_meters
			FROM orders o
			JOIN vendors v ON v.id = o.vendor_id
			WHERE o.status IN ('accepted', 'preparing') AND o.driver_id IS NULL
			  AND ST_DWithin(v.location, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?)
			ORDER BY pickup_distance_meters ASC
			LIMIT ?
		`, lon, lat, lon, lat, availableOrderRadiusMeters, availableOrderLimit).Scan(&orders).Error
	} else {
		err = s.db.WithContext(ctx).Raw(selectCols+`
			FROM orders o
			JOIN vendors v ON v.id = o.vendor_id
			WHERE o.status IN ('accepted', 'preparing') AND o.driver_id IS NULL
			ORDER BY o.placed_at ASC
			LIMIT ?
		`, availableOrderLimit).Scan(&orders).Error
	}
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("order: list available for drivers: %w", err))
	}
	return orders, nil
}

// driverPosition reads a driver's last known position from driver_locations.
// found=false means they've never reported one — distinguished from a real
// query failure, which is returned as an error. Conflating the two would make
// a broken database silently fall back to the unfiltered, nationwide order
// list: exactly the thing the radius filter exists to prevent, failing open.
func (s *OrderService) driverPosition(ctx context.Context, driverID string) (lon, lat, heading float64, found bool, appErr *apperror.AppError) {
	row := s.db.WithContext(ctx).Raw(`
		SELECT ST_X(location::geometry), ST_Y(location::geometry), COALESCE(heading, 0)
		FROM driver_locations WHERE driver_id = ?
	`, driverID).Row()
	if err := row.Scan(&lon, &lat, &heading); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, 0, 0, false, nil
		}
		return 0, 0, 0, false, apperror.Internal(fmt.Errorf("order: driver position: %w", err))
	}
	return lon, lat, heading, true, nil
}

// ActiveDriverOrder extends models.Order with the vendor identity/pickup
// coordinates the D4 Active Order screen needs for its map (pickup→dropoff)
// and vendor info card — models.Order itself carries no vendor name or
// location, only vendor_id, so a plain orderSelectColumns query leaves the
// driver app unable to show anything but a raw UUID (the same gap
// ListAvailableForDrivers already solves for D3 via its own join).
type ActiveDriverOrder struct {
	models.Order
	VendorName      string  `json:"vendor_name"`
	VendorLongitude float64 `json:"vendor_longitude"`
	VendorLatitude  float64 `json:"vendor_latitude"`
}

// GetActiveForDriver returns the driver's single in-flight order, or
// (nil, nil) if the driver has none (blueprint §11.D4). Having no active
// order is a normal, expected state for an idle driver — not an error —
// unlike GetForUser/loadOrderTx's NotFound, which represents a genuinely
// missing order; the handler returns 200 with data: null so the mobile
// client can render an empty state without special-casing a 404.
func (s *OrderService) GetActiveForDriver(ctx context.Context, driverID string) (*ActiveDriverOrder, *apperror.AppError) {
	var o ActiveDriverOrder
	err := s.db.WithContext(ctx).Raw(`
		SELECT o.id, o.user_id, o.vendor_id, o.driver_id, o.status, o.subtotal_usd, o.currency_code,
		       o.exchange_rate, o.subtotal_display, o.commission_pct, o.commission_usd, o.coupon_id,
		       o.scheduled_for, o.placed_at, o.delivered_at,
		       ST_X(o.delivery_point::geometry) AS delivery_longitude,
		       ST_Y(o.delivery_point::geometry) AS delivery_latitude,
		       COALESCE(v.name_i18n->>'en', '') AS vendor_name,
		       ST_X(v.location::geometry) AS vendor_longitude, ST_Y(v.location::geometry) AS vendor_latitude
		FROM orders o
		JOIN vendors v ON v.id = o.vendor_id
		WHERE o.driver_id = ? AND o.status IN ('accepted', 'preparing', 'on_the_way')
		ORDER BY o.placed_at DESC LIMIT 1
	`, driverID).Scan(&o).Error
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("order: get active for driver: %w", err))
	}
	if o.ID == "" {
		return nil, nil
	}
	var items []models.OrderItem
	if err := s.db.WithContext(ctx).Where("order_id = ?", o.ID).Find(&items).Error; err == nil {
		o.Items = items
	}
	return &o, nil
}

// ListHistoryForDriver returns a driver's completed/cancelled deliveries,
// most recent first (blueprint §11.D5).
func (s *OrderService) ListHistoryForDriver(ctx context.Context, driverID string) ([]models.Order, *apperror.AppError) {
	var orders []models.Order
	err := s.db.WithContext(ctx).Raw(
		orderSelectColumns+` WHERE driver_id = ? AND status IN ('delivered', 'cancelled') ORDER BY placed_at DESC`,
		driverID,
	).Scan(&orders).Error
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("order: list history for driver: %w", err))
	}
	s.populateOrderItems(ctx, orders)
	return orders, nil
}

// Helper to batch populate order items to prevent N+1 queries.
func (s *OrderService) populateOrderItems(ctx context.Context, orders []models.Order) {
	if len(orders) == 0 {
		return
	}
	orderIDs := make([]string, len(orders))
	for i, o := range orders {
		orderIDs[i] = o.ID
	}
	var allItems []models.OrderItem
	if err := s.db.WithContext(ctx).Where("order_id IN ?", orderIDs).Find(&allItems).Error; err == nil {
		itemsByOrder := make(map[string][]models.OrderItem)
		for _, item := range allItems {
			itemsByOrder[item.OrderID] = append(itemsByOrder[item.OrderID], item)
		}
		for i := range orders {
			orders[i].Items = itemsByOrder[orders[i].ID]
		}
	}
}
