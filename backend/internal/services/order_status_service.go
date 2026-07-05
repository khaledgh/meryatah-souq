package services

import (
	"context"
	"database/sql"
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
