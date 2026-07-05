package services

import (
	"context"
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

// GetCurrent returns a driver's last known position, or ok=false if none
// has ever been recorded.
func (s *DriverLocationService) GetCurrent(ctx context.Context, driverID string) (longitude, latitude, heading float64, ok bool, appErr *apperror.AppError) {
	var found bool
	row := s.db.WithContext(ctx).Raw(`
		SELECT ST_X(location::geometry), ST_Y(location::geometry), COALESCE(heading, 0)
		FROM driver_locations WHERE driver_id = ?
	`, driverID).Row()
	if err := row.Scan(&longitude, &latitude, &heading); err == nil {
		found = true
	}
	return longitude, latitude, heading, found, nil
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
		if driverID == nil || *driverID != userID {
			return apperror.Forbidden("not the assigned driver for this order")
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
