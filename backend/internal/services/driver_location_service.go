package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/pkg/apperror"
)

// DriverLocationService upserts driver_locations (blueprint §3.4, §4.9).
type DriverLocationService struct {
	db *gorm.DB
}

func NewDriverLocationService(db *gorm.DB) *DriverLocationService {
	return &DriverLocationService{db: db}
}

// Upsert writes a driver's current position, validated by the caller
// (blueprint §5.5: server-side validation) before this is called.
func (s *DriverLocationService) Upsert(ctx context.Context, driverID string, longitude, latitude, heading float64) *apperror.AppError {
	err := s.db.WithContext(ctx).Exec(`
		INSERT INTO driver_locations (driver_id, location, heading, updated_at)
		VALUES (?, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?, now())
		ON CONFLICT (driver_id) DO UPDATE
		SET location = EXCLUDED.location, heading = EXCLUDED.heading, updated_at = now()
	`, driverID, longitude, latitude, heading).Error
	if err != nil {
		return apperror.Internal(fmt.Errorf("driver_location: upsert: %w", err))
	}
	return nil
}

// GetCurrent returns a driver's last known position, or ok=false if none has
// ever been recorded. A real query failure is returned as an error rather
// than reported as ok=false — otherwise a broken database would be
// indistinguishable from "this driver has never sent a position", and the
// tracking map would quietly show nothing instead of surfacing the fault.
func (s *DriverLocationService) GetCurrent(ctx context.Context, driverID string) (longitude, latitude, heading float64, ok bool, appErr *apperror.AppError) {
	row := s.db.WithContext(ctx).Raw(`
		SELECT ST_X(location::geometry), ST_Y(location::geometry), COALESCE(heading, 0)
		FROM driver_locations WHERE driver_id = ?
	`, driverID).Row()
	if err := row.Scan(&longitude, &latitude, &heading); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, 0, 0, false, nil
		}
		return 0, 0, 0, false, apperror.Internal(fmt.Errorf("driver_location: get current: %w", err))
	}
	return longitude, latitude, heading, true, nil
}

// ActiveOrderForDriver returns the order a driver is currently delivering,
// or "" if they have none in flight (a normal state, not an error). This is
// how the background-location endpoint resolves which tracking room to
// broadcast into WITHOUT trusting an order ID supplied by the client — a
// driver can only ever publish into a room they're actually assigned to
// (blueprint §5.3).
func (s *DriverLocationService) ActiveOrderForDriver(ctx context.Context, driverID string) (string, *apperror.AppError) {
	var orderID string
	err := s.db.WithContext(ctx).Raw(`
		SELECT id FROM orders
		WHERE driver_id = ? AND status IN ('accepted', 'preparing', 'on_the_way')
		ORDER BY placed_at DESC LIMIT 1
	`, driverID).Scan(&orderID).Error
	if err != nil {
		return "", apperror.Internal(fmt.Errorf("driver_location: active order for driver: %w", err))
	}
	return orderID, nil
}

// DriverForOrder returns the driver assigned to an order, or "" if none has
// accepted it yet (a normal state, not an error). Callers must have already
// authorized access to the order via AssertOrderAccess.
func (s *DriverLocationService) DriverForOrder(ctx context.Context, orderID string) (string, *apperror.AppError) {
	var driverID *string
	err := s.db.WithContext(ctx).Raw(`SELECT driver_id FROM orders WHERE id = ?`, orderID).
		Row().Scan(&driverID)
	if err != nil {
		return "", apperror.NotFound("order")
	}
	if driverID == nil {
		return "", nil
	}
	return *driverID, nil
}

// AssertOrderAccess confirms userID (as the given role: "user" or
// "driver") is a legitimate participant in orderID's tracking room
// (blueprint §5.3: never trust a client-asserted room membership) —
// either the order's own customer, or its assigned driver.
func (s *DriverLocationService) AssertOrderAccess(ctx context.Context, orderID, userID, role string) *apperror.AppError {
	var ownerUserID string
	var driverID *string
	var vendorID string
	err := s.db.WithContext(ctx).Raw(`SELECT user_id, driver_id, vendor_id FROM orders WHERE id = ?`, orderID).
		Row().Scan(&ownerUserID, &driverID, &vendorID)
	if err != nil {
		return apperror.NotFound("order")
	}

	switch role {
	case "driver":
		isCustomer := ownerUserID == userID
		isDriver := driverID != nil && *driverID == userID
		if !isCustomer && !isDriver {
			return apperror.Forbidden("not the assigned driver or customer for this order")
		}
	case "vendor_owner":
		var vendorOwnerUserID string
		err := s.db.WithContext(ctx).Raw(`SELECT owner_user_id FROM vendors WHERE id = ?`, vendorID).Scan(&vendorOwnerUserID).Error
		if err != nil || vendorOwnerUserID != userID {
			return apperror.Forbidden("not the owner of the vendor for this order")
		}
	default:
		if ownerUserID != userID {
			return apperror.Forbidden("not the customer for this order")
		}
	}
	return nil
}

// LogHistory appends a coordinate to the order_tracking_history table.
func (s *DriverLocationService) LogHistory(ctx context.Context, orderID, driverID string, longitude, latitude, heading float64) *apperror.AppError {
	err := s.db.WithContext(ctx).Exec(`
		INSERT INTO order_tracking_history (order_id, driver_id, latitude, longitude, heading, recorded_at)
		VALUES (?, ?, ?, ?, ?, now())
	`, orderID, driverID, latitude, longitude, heading).Error
	if err != nil {
		return apperror.Internal(fmt.Errorf("driver_location: log history: %w", err))
	}
	return nil
}

