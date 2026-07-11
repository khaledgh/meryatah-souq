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

// VendorService implements vendor CRUD with tenant isolation (blueprint
// §3.3, §5.3): a vendor owner may only read/write their own vendor row(s);
// super_admin may act on any vendor. Location is PostGIS GEOGRAPHY, handled
// via raw SQL since GORM has no native geography scan type.
type VendorService struct {
	db *gorm.DB
}

func NewVendorService(db *gorm.DB) *VendorService {
	return &VendorService{db: db}
}

type CreateVendorInput struct {
	OwnerUserID     string
	NameI18n        json.RawMessage
	Category        string
	StoreCategoryID *string
	Longitude       float64
	Latitude        float64
	Address         string
	Timezone        string
}

// Create inserts a new vendor. Only callable by super_admin (enforced by
// route RBAC, not here) — vendor onboarding (§11.A5) creates the vendor +
// owner user together; this is the vendor half. StoreCategoryID is the
// admin-managed marketplace-section FK (blueprint marketplace taxonomy);
// Category is kept in parallel only through the migration transition.
func (s *VendorService) Create(ctx context.Context, in CreateVendorInput) (*models.Vendor, *apperror.AppError) {
	if in.Category == "" {
		return nil, apperror.Validation("category is required")
	}
	if in.Timezone == "" {
		in.Timezone = "Asia/Beirut"
	}
	if !validLongitude(in.Longitude) || !validLatitude(in.Latitude) {
		return nil, apperror.Validation("invalid location coordinates")
	}

	id := newUUID()
	err := s.db.WithContext(ctx).Exec(`
		INSERT INTO vendors (id, owner_user_id, name_i18n, category, store_category_id, location, address, timezone, created_at)
		VALUES (?, ?, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?, ?, ?)
	`, id, in.OwnerUserID, in.NameI18n, in.Category, in.StoreCategoryID, in.Longitude, in.Latitude, in.Address, in.Timezone, time.Now()).Error
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("vendor: create: %w", err))
	}

	return s.GetByID(ctx, id)
}

// GetByID loads a vendor by ID, including its lon/lat extracted from the
// geography column.
func (s *VendorService) GetByID(ctx context.Context, id string) (*models.Vendor, *apperror.AppError) {
	var v models.Vendor
	err := s.db.WithContext(ctx).Raw(`
		SELECT id, owner_user_id, name_i18n, category, store_category_id, address, logo_url, timezone,
		       commission_pct, display_currency, scheduling_allowed, scheduling_enabled,
		       scheduling_config, features, is_active, created_at,
		       ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude
		FROM vendors WHERE id = ?
	`, id).Scan(&v).Error
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("vendor: load: %w", err))
	}
	if v.ID == "" {
		return nil, apperror.NotFound("vendor")
	}
	return &v, nil
}

// GetByOwner loads the vendor owned by ownerUserID. Used by the vendor
// dashboard's "which vendor am I?" lookup (GET /vendor/me): a vendor owner
// authenticates by phone+OTP and only knows their own user id, not their
// vendor id, so this resolves it server-side scoped to the caller. One
// owner maps to at most one vendor in the current model (approval creates
// exactly one), so LIMIT 1 is safe.
func (s *VendorService) GetByOwner(ctx context.Context, ownerUserID string) (*models.Vendor, *apperror.AppError) {
	var v models.Vendor
	err := s.db.WithContext(ctx).Raw(`
		SELECT id, owner_user_id, name_i18n, category, store_category_id, address, logo_url, timezone,
		       commission_pct, display_currency, scheduling_allowed, scheduling_enabled,
		       scheduling_config, features, is_active, created_at,
		       ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude
		FROM vendors WHERE owner_user_id = ?
		ORDER BY created_at ASC
		LIMIT 1
	`, ownerUserID).Scan(&v).Error
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("vendor: load by owner: %w", err))
	}
	if v.ID == "" {
		return nil, apperror.NotFound("vendor")
	}
	return &v, nil
}

// AssertOwnership returns an error unless callerUserID owns vendorID or
// callerRole is super_admin (blueprint §5.3: never trust a vendor_id from
// the client without an ownership check).
func (s *VendorService) AssertOwnership(ctx context.Context, vendorID, callerUserID, callerRole string) *apperror.AppError {
	if callerRole == string(models.RoleSuperAdmin) {
		return nil
	}
	var ownerID string
	err := s.db.WithContext(ctx).Raw(`SELECT owner_user_id FROM vendors WHERE id = ?`, vendorID).Scan(&ownerID).Error
	if err != nil {
		return apperror.Internal(fmt.Errorf("vendor: load owner: %w", err))
	}
	if ownerID == "" {
		return apperror.NotFound("vendor")
	}
	if ownerID != callerUserID {
		return apperror.Forbidden("not the owner of this vendor")
	}
	return nil
}

type UpdateVendorInput struct {
	NameI18n        *json.RawMessage
	Category        *string
	StoreCategoryID *string
	Address         *string
	LogoURL         *string
	Timezone        *string
	Longitude       *float64
	Latitude        *float64
	CommissionPct   *float64
	DisplayCurrency *string
}

// Update applies a partial update to a vendor's own profile fields
// (blueprint §11.B3). Commission is deliberately NOT settable here — only
// super_admin sets it, via a separate admin-only method, since it's a
// platform-controlled financial term (§11.A4).
func (s *VendorService) Update(ctx context.Context, vendorID string, in UpdateVendorInput) (*models.Vendor, *apperror.AppError) {
	updates := map[string]any{}
	if in.NameI18n != nil {
		updates["name_i18n"] = *in.NameI18n
	}
	if in.Category != nil {
		updates["category"] = *in.Category
	}
	if in.StoreCategoryID != nil {
		updates["store_category_id"] = *in.StoreCategoryID
	}
	if in.Address != nil {
		updates["address"] = *in.Address
	}
	if in.LogoURL != nil {
		updates["logo_url"] = *in.LogoURL
	}
	if in.Timezone != nil {
		updates["timezone"] = *in.Timezone
	}
	if in.DisplayCurrency != nil {
		updates["display_currency"] = *in.DisplayCurrency
	}

	if len(updates) > 0 {
		if err := s.db.WithContext(ctx).Table("vendors").Where("id = ?", vendorID).Updates(updates).Error; err != nil {
			return nil, apperror.Internal(fmt.Errorf("vendor: update: %w", err))
		}
	}

	if in.Longitude != nil && in.Latitude != nil {
		if !validLongitude(*in.Longitude) || !validLatitude(*in.Latitude) {
			return nil, apperror.Validation("invalid location coordinates")
		}
		err := s.db.WithContext(ctx).Exec(`
			UPDATE vendors SET location = ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography WHERE id = ?
		`, *in.Longitude, *in.Latitude, vendorID).Error
		if err != nil {
			return nil, apperror.Internal(fmt.Errorf("vendor: update location: %w", err))
		}
	}

	return s.GetByID(ctx, vendorID)
}

// SetCommission is super_admin-only (route RBAC enforces this): overrides
// the default commission_pct for a vendor, or clears it (nil -> app
// default), per blueprint §11.A4.
func (s *VendorService) SetCommission(ctx context.Context, vendorID string, pct *float64) *apperror.AppError {
	if err := s.db.WithContext(ctx).Table("vendors").Where("id = ?", vendorID).
		Update("commission_pct", pct).Error; err != nil {
		return apperror.Internal(fmt.Errorf("vendor: set commission: %w", err))
	}
	return nil
}

// GrantScheduling is super_admin-only: sets scheduling_allowed (blueprint
// §8, §11.A4). Revoking also force-disables the vendor's own
// scheduling_enabled, since it must never be true when not allowed.
func (s *VendorService) GrantScheduling(ctx context.Context, vendorID string, allowed bool) *apperror.AppError {
	updates := map[string]any{"scheduling_allowed": allowed}
	if !allowed {
		updates["scheduling_enabled"] = false
	}
	if err := s.db.WithContext(ctx).Table("vendors").Where("id = ?", vendorID).Updates(updates).Error; err != nil {
		return apperror.Internal(fmt.Errorf("vendor: grant scheduling: %w", err))
	}
	return nil
}

// SetSchedulingEnabled is vendor-owner-only (ownership checked by caller):
// toggles scheduling_enabled, but only takes effect if scheduling_allowed
// is already true (blueprint §8's two-gate rule) — attempting to enable
// when not allowed is rejected rather than silently no-op'd, so the vendor
// dashboard can show a clear error.
func (s *VendorService) SetSchedulingEnabled(ctx context.Context, vendorID string, enabled bool) *apperror.AppError {
	if enabled {
		var allowed bool
		if err := s.db.WithContext(ctx).Raw(`SELECT scheduling_allowed FROM vendors WHERE id = ?`, vendorID).Scan(&allowed).Error; err != nil {
			return apperror.Internal(fmt.Errorf("vendor: check scheduling_allowed: %w", err))
		}
		if !allowed {
			return apperror.Forbidden("scheduling has not been granted by the admin for this vendor")
		}
	}
	if err := s.db.WithContext(ctx).Table("vendors").Where("id = ?", vendorID).
		Update("scheduling_enabled", enabled).Error; err != nil {
		return apperror.Internal(fmt.Errorf("vendor: set scheduling_enabled: %w", err))
	}
	return nil
}

// SetActive is super_admin-only: activate/deactivate a vendor (hides the
// store from users when inactive, blueprint §11.A3).
func (s *VendorService) SetActive(ctx context.Context, vendorID string, active bool) *apperror.AppError {
	if err := s.db.WithContext(ctx).Table("vendors").Where("id = ?", vendorID).
		Update("is_active", active).Error; err != nil {
		return apperror.Internal(fmt.Errorf("vendor: set active: %w", err))
	}
	return nil
}

// Nearby returns active vendors within radiusMeters of (lon, lat), nearest
// first, using PostGIS's geography distance operator (blueprint §5, §11.C5
// nearby-vendor lookup on the User App home screen). storeCategoryID
// optionally restricts results to a single marketplace section (mobile
// section-landing filter); nil/empty means no filter.
func (s *VendorService) Nearby(ctx context.Context, longitude, latitude float64, radiusMeters float64, limit int, storeCategoryID *string) ([]models.Vendor, *apperror.AppError) {
	if !validLongitude(longitude) || !validLatitude(latitude) {
		return nil, apperror.Validation("invalid location coordinates")
	}
	if radiusMeters <= 0 {
		radiusMeters = 5000
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	// Built conditionally (rather than a "?::uuid IS NULL OR ..." inline
	// clause) to keep the same param-binding style as the rest of this
	// service and avoid any ambiguity from binding a nil *string as ::uuid.
	query := `
		SELECT id, owner_user_id, name_i18n, category, store_category_id, address, logo_url, timezone,
		       commission_pct, display_currency, scheduling_allowed, scheduling_enabled,
		       scheduling_config, features, is_active, created_at,
		       ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude,
		       ST_Distance(location, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography) AS distance_meters
		FROM vendors
		WHERE is_active = true
		  AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?)`
	args := []any{longitude, latitude, longitude, latitude, radiusMeters}
	if storeCategoryID != nil && *storeCategoryID != "" {
		query += ` AND store_category_id = ?`
		args = append(args, *storeCategoryID)
	}
	query += ` ORDER BY distance_meters ASC LIMIT ?`
	args = append(args, limit)

	vendors := make([]models.Vendor, 0)
	if err := s.db.WithContext(ctx).Raw(query, args...).Scan(&vendors).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("vendor: nearby search: %w", err))
	}
	return vendors, nil
}

func validLongitude(lon float64) bool { return lon >= -180 && lon <= 180 }
func validLatitude(lat float64) bool  { return lat >= -90 && lat <= 90 }
