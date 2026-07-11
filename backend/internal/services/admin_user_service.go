package services

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/pkg/phone"
	"meryata-souq/backend/internal/pkg/security"
)

// minPasswordLength matches the self-registration rule (handlers/auth.go).
const minPasswordLength = 8

// AdminUserService implements super_admin-facing user/driver management
// reads (blueprint §11.A6 Drivers, §11.A7 Users).
type AdminUserService struct {
	db *gorm.DB
}

func NewAdminUserService(db *gorm.DB) *AdminUserService {
	return &AdminUserService{db: db}
}

// ListByRole returns users filtered by role, most recently created first
// (blueprint §11.A6/A7 list views). No password/secret fields are ever
// selected — models.User already excludes PasswordHash from JSON via its
// `json:"-"` tag.
func (s *AdminUserService) ListByRole(ctx context.Context, role models.UserRole) ([]models.User, *apperror.AppError) {
	users := make([]models.User, 0)
	if err := s.db.WithContext(ctx).Where("role = ?", role).Order("created_at DESC").Find(&users).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("admin_user: list by role: %w", err))
	}
	return users, nil
}

// CreateDriverInput carries the fields for admin driver provisioning.
type CreateDriverInput struct {
	Phone     string
	FirstName string
	LastName  string
}

// CreateDriver provisions a new driver account (blueprint §11.A6: admin
// creates/verifies/activates drivers — drivers do not self-register). The
// account is created active with the phone marked verified (an admin
// vouches for the number), and no password: drivers authenticate by
// phone+OTP, so their first OTP login finds this row and logs them in
// (same model as approval-created vendor owners). Rejects a phone already
// registered to any account.
func (s *AdminUserService) CreateDriver(ctx context.Context, in CreateDriverInput) (*models.User, *apperror.AppError) {
	normalized, ok := phone.Normalize(in.Phone)
	if !ok {
		return nil, apperror.Validation("invalid phone number")
	}
	if in.FirstName == "" || in.LastName == "" {
		return nil, apperror.Validation("first_name and last_name are required")
	}

	var existing models.User
	err := s.db.WithContext(ctx).Where("phone = ?", normalized).First(&existing).Error
	if err == nil {
		return nil, apperror.Validation("a user already exists for this phone")
	}
	if err != gorm.ErrRecordNotFound {
		return nil, apperror.Internal(fmt.Errorf("admin_user: check existing: %w", err))
	}

	now := time.Now()
	driver := models.User{
		ID:            newUUID(),
		Phone:         normalized,
		PhoneVerified: true,
		FirstName:     &in.FirstName,
		LastName:      &in.LastName,
		Role:          models.RoleDriver,
		IsActive:      true,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err := s.db.WithContext(ctx).Create(&driver).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("admin_user: create driver: %w", err))
	}
	return &driver, nil
}

// SetActive activates/deactivates any user (blueprint §11.A6/A7:
// activate/deactivate driver or user). super_admin-only, enforced by
// route RBAC.
func (s *AdminUserService) SetActive(ctx context.Context, userID string, active bool) *apperror.AppError {
	result := s.db.WithContext(ctx).Model(&models.User{}).Where("id = ?", userID).Update("is_active", active)
	if result.Error != nil {
		return apperror.Internal(fmt.Errorf("admin_user: set active: %w", result.Error))
	}
	if result.RowsAffected == 0 {
		return apperror.NotFound("user")
	}
	return nil
}

// ResetLockout clears failed_logins/locked_until (blueprint §11.A7:
// "reset lockout").
func (s *AdminUserService) ResetLockout(ctx context.Context, userID string) *apperror.AppError {
	result := s.db.WithContext(ctx).Model(&models.User{}).Where("id = ?", userID).
		Updates(map[string]any{"failed_logins": 0, "locked_until": nil})
	if result.Error != nil {
		return apperror.Internal(fmt.Errorf("admin_user: reset lockout: %w", result.Error))
	}
	if result.RowsAffected == 0 {
		return apperror.NotFound("user")
	}
	return nil
}

// CreateUserInput carries the fields for admin user provisioning.
type CreateUserInput struct {
	Phone     string
	FirstName string
	LastName  string
	Role      models.UserRole
}

// CreateUser provisions a new user account with a specific role (user, vendor, driver).
// The account is created active with the phone marked verified, and no password
// (authenticates via phone+OTP).
func (s *AdminUserService) CreateUser(ctx context.Context, in CreateUserInput) (*models.User, *apperror.AppError) {
	normalized, ok := phone.Normalize(in.Phone)
	if !ok {
		return nil, apperror.Validation("invalid phone number")
	}
	if in.FirstName == "" || in.LastName == "" {
		return nil, apperror.Validation("first_name and last_name are required")
	}
	if in.Role == "" {
		in.Role = models.RoleUser
	}

	var existing models.User
	err := s.db.WithContext(ctx).Where("phone = ?", normalized).First(&existing).Error
	if err == nil {
		return nil, apperror.Validation("a user already exists for this phone")
	}
	if err != gorm.ErrRecordNotFound {
		return nil, apperror.Internal(fmt.Errorf("admin_user: check existing: %w", err))
	}

	now := time.Now()
	user := models.User{
		ID:            newUUID(),
		Phone:         normalized,
		PhoneVerified: true,
		FirstName:     &in.FirstName,
		LastName:      &in.LastName,
		Role:          in.Role,
		IsActive:      true,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err := s.db.WithContext(ctx).Create(&user).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("admin_user: create user: %w", err))
	}
	return &user, nil
}

// SetPassword sets (or resets) a user's password (super_admin only). Used to
// give vendor-role accounts a password so they can use password login when
// the admin selects that vendor login method (blueprint §11.A10). The plain
// password is never logged. Returns the affected user's role so the caller
// can audit accurately.
func (s *AdminUserService) SetPassword(ctx context.Context, userID, password string) (models.UserRole, *apperror.AppError) {
	if len(password) < minPasswordLength {
		return "", apperror.Validation(fmt.Sprintf("password must be at least %d characters", minPasswordLength))
	}

	var user models.User
	if err := s.db.WithContext(ctx).Where("id = ?", userID).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return "", apperror.NotFound("user")
		}
		return "", apperror.Internal(fmt.Errorf("admin_user: load user for set password: %w", err))
	}

	hash, err := security.HashPassword(password)
	if err != nil {
		return "", apperror.Internal(fmt.Errorf("admin_user: hash password: %w", err))
	}

	if err := s.db.WithContext(ctx).Model(&models.User{}).Where("id = ?", userID).
		Update("password_hash", hash).Error; err != nil {
		return "", apperror.Internal(fmt.Errorf("admin_user: update password: %w", err))
	}
	return user.Role, nil
}
