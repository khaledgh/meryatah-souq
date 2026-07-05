package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"

	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

// CouponService implements coupon CRUD and atomic redemption (blueprint
// §11.A9/B10: "enforce max_redemptions").
type CouponService struct {
	db *gorm.DB
}

func NewCouponService(db *gorm.DB) *CouponService {
	return &CouponService{db: db}
}

type CreateCouponInput struct {
	VendorID       *string
	Code           string
	DiscountType   string
	DiscountVal    float64
	MaxRedemptions *int
	ExpiresAt      *time.Time
}

func (s *CouponService) Create(ctx context.Context, in CreateCouponInput) (*models.Coupon, *apperror.AppError) {
	if in.Code == "" {
		return nil, apperror.Validation("code is required")
	}
	if in.DiscountType != "percent" && in.DiscountType != "fixed" {
		return nil, apperror.Validation("discount_type must be \"percent\" or \"fixed\"")
	}
	if in.DiscountVal <= 0 {
		return nil, apperror.Validation("discount_val must be positive")
	}
	if in.ExpiresAt != nil && in.ExpiresAt.Before(time.Now()) {
		return nil, apperror.Validation("expires_at must be in the future")
	}

	coupon := models.Coupon{
		ID:             newUUID(),
		VendorID:       in.VendorID,
		Code:           in.Code,
		DiscountType:   in.DiscountType,
		DiscountVal:    in.DiscountVal,
		MaxRedemptions: in.MaxRedemptions,
		ExpiresAt:      in.ExpiresAt,
		IsActive:       true,
	}
	if err := s.db.WithContext(ctx).Create(&coupon).Error; err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == postgresUniqueViolation {
			return nil, apperror.Validation(fmt.Sprintf("coupon code %q already exists", in.Code))
		}
		return nil, apperror.Internal(fmt.Errorf("coupon: create: %w", err))
	}
	return &coupon, nil
}

// SetActive toggles a coupon on/off, scoped to vendorID if non-empty (a
// vendor may only manage its own coupons; empty vendorID means the caller
// is super_admin managing any coupon, per blueprint §11.A9's global scope).
func (s *CouponService) SetActive(ctx context.Context, vendorID, couponID string, active bool) *apperror.AppError {
	query := s.db.WithContext(ctx).Model(&models.Coupon{}).Where("id = ?", couponID)
	if vendorID != "" {
		query = query.Where("vendor_id = ?", vendorID)
	}
	result := query.Update("is_active", active)
	if result.Error != nil {
		return apperror.Internal(fmt.Errorf("coupon: set active: %w", result.Error))
	}
	if result.RowsAffected == 0 {
		return apperror.NotFound("coupon")
	}
	return nil
}

// Validate looks up an active, unexpired, not-yet-exhausted coupon by
// code, scoped to vendorID (a vendor-scoped coupon per §3.4 only applies
// at that vendor's checkout; a platform-wide coupon has vendor_id NULL and
// applies anywhere). Does not redeem it — see Redeem.
func (s *CouponService) Validate(ctx context.Context, code, vendorID string) (*models.Coupon, *apperror.AppError) {
	var coupon models.Coupon
	err := s.db.WithContext(ctx).
		Where("code = ? AND is_active = true", code).
		Where("vendor_id IS NULL OR vendor_id = ?", vendorID).
		First(&coupon).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperror.New("COUPON_INVALID", 422, "coupon not found, inactive, or not valid for this vendor", "This coupon code is not valid.")
		}
		return nil, apperror.Internal(fmt.Errorf("coupon: validate: %w", err))
	}
	if coupon.ExpiresAt != nil && coupon.ExpiresAt.Before(time.Now()) {
		return nil, apperror.New("COUPON_EXPIRED", 422, "coupon expired", "This coupon has expired.")
	}
	if coupon.MaxRedemptions != nil && coupon.RedeemedCount >= *coupon.MaxRedemptions {
		return nil, apperror.New("COUPON_EXHAUSTED", 422, "coupon redemption limit reached", "This coupon has reached its redemption limit.")
	}
	return &coupon, nil
}

// Redeem atomically increments redeemed_count, guarded by the same
// max_redemptions check in the UPDATE's WHERE clause (not a separate
// read-then-write) — the same race-closing pattern as Phase 7's stock
// decrement: two concurrent redemptions of the last available use can't
// both succeed, since only one UPDATE will match "redeemed_count <
// max_redemptions OR max_redemptions IS NULL".
func (s *CouponService) Redeem(ctx context.Context, tx *gorm.DB, couponID string) *apperror.AppError {
	db := tx
	if db == nil {
		db = s.db
	}
	result := db.WithContext(ctx).Exec(`
		UPDATE coupons SET redeemed_count = redeemed_count + 1
		WHERE id = ? AND (max_redemptions IS NULL OR redeemed_count < max_redemptions)
	`, couponID)
	if result.Error != nil {
		return apperror.Internal(fmt.Errorf("coupon: redeem: %w", result.Error))
	}
	if result.RowsAffected == 0 {
		return apperror.New("COUPON_EXHAUSTED", 422, "coupon redemption limit reached between validation and redemption",
			"This coupon just reached its redemption limit.")
	}
	return nil
}

// List returns coupons scoped to vendorID (or all, if vendorID is empty —
// super_admin's global view per §11.A9).
func (s *CouponService) List(ctx context.Context, vendorID string) ([]models.Coupon, *apperror.AppError) {
	query := s.db.WithContext(ctx)
	if vendorID != "" {
		query = query.Where("vendor_id = ?", vendorID)
	}
	var coupons []models.Coupon
	if err := query.Order("code ASC").Find(&coupons).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("coupon: list: %w", err))
	}
	return coupons, nil
}
