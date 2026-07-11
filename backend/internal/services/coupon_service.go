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
	StartsAt       *time.Time
	ExpiresAt      *time.Time
}

// validateCouponFields enforces the shared rules for create and update.
// forCreate=true additionally rejects a past expiry (editing an already-
// expired coupon to keep the same expiry should not be blocked).
func validateCouponFields(code, discountType string, discountVal float64, startsAt, expiresAt *time.Time, forCreate bool) *apperror.AppError {
	if code == "" {
		return apperror.Validation("code is required")
	}
	if discountType != "percent" && discountType != "fixed" {
		return apperror.Validation("discount_type must be \"percent\" or \"fixed\"")
	}
	if discountType == "percent" && discountVal > 100 {
		return apperror.Validation("percent discount_val must not exceed 100")
	}
	if discountVal <= 0 {
		return apperror.Validation("discount_val must be positive")
	}
	if startsAt != nil && expiresAt != nil && expiresAt.Before(*startsAt) {
		return apperror.Validation("expires_at must not be before starts_at")
	}
	if forCreate && expiresAt != nil && expiresAt.Before(time.Now()) {
		return apperror.Validation("expires_at must be in the future")
	}
	return nil
}

func (s *CouponService) Create(ctx context.Context, in CreateCouponInput) (*models.Coupon, *apperror.AppError) {
	if appErr := validateCouponFields(in.Code, in.DiscountType, in.DiscountVal, in.StartsAt, in.ExpiresAt, true); appErr != nil {
		return nil, appErr
	}

	coupon := models.Coupon{
		ID:             newUUID(),
		VendorID:       in.VendorID,
		Code:           in.Code,
		DiscountType:   in.DiscountType,
		DiscountVal:    in.DiscountVal,
		MaxRedemptions: in.MaxRedemptions,
		StartsAt:       in.StartsAt,
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

type UpdateCouponInput struct {
	Code           string
	DiscountType   string
	DiscountVal    float64
	MaxRedemptions *int
	StartsAt       *time.Time
	ExpiresAt      *time.Time
}

// Update edits a coupon's fields, scoped to vendorID if non-empty (a vendor
// may only edit its own coupons; empty vendorID = super_admin editing any
// coupon, blueprint §11.A9). redeemed_count and is_active are not editable
// here (is_active is managed via SetActive).
func (s *CouponService) Update(ctx context.Context, vendorID, couponID string, in UpdateCouponInput) (*models.Coupon, *apperror.AppError) {
	if appErr := validateCouponFields(in.Code, in.DiscountType, in.DiscountVal, in.StartsAt, in.ExpiresAt, false); appErr != nil {
		return nil, appErr
	}

	query := s.db.WithContext(ctx).Model(&models.Coupon{}).Where("id = ?", couponID)
	if vendorID != "" {
		query = query.Where("vendor_id = ?", vendorID)
	}
	result := query.Updates(map[string]any{
		"code":            in.Code,
		"discount_type":   in.DiscountType,
		"discount_val":    in.DiscountVal,
		"max_redemptions": in.MaxRedemptions,
		"starts_at":       in.StartsAt,
		"expires_at":      in.ExpiresAt,
	})
	if result.Error != nil {
		var pgErr *pgconn.PgError
		if errors.As(result.Error, &pgErr) && pgErr.Code == postgresUniqueViolation {
			return nil, apperror.Validation(fmt.Sprintf("coupon code %q already exists", in.Code))
		}
		return nil, apperror.Internal(fmt.Errorf("coupon: update: %w", result.Error))
	}
	if result.RowsAffected == 0 {
		return nil, apperror.NotFound("coupon")
	}

	var coupon models.Coupon
	if err := s.db.WithContext(ctx).Where("id = ?", couponID).First(&coupon).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("coupon: reload after update: %w", err))
	}
	return &coupon, nil
}

// Delete removes a coupon, scoped to vendorID if non-empty.
func (s *CouponService) Delete(ctx context.Context, vendorID, couponID string) *apperror.AppError {
	query := s.db.WithContext(ctx).Where("id = ?", couponID)
	if vendorID != "" {
		query = query.Where("vendor_id = ?", vendorID)
	}
	result := query.Delete(&models.Coupon{})
	if result.Error != nil {
		return apperror.Internal(fmt.Errorf("coupon: delete: %w", result.Error))
	}
	if result.RowsAffected == 0 {
		return apperror.NotFound("coupon")
	}
	return nil
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
	coupons := make([]models.Coupon, 0)
	if err := query.Order("code ASC").Find(&coupons).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("coupon: list: %w", err))
	}
	return coupons, nil
}
