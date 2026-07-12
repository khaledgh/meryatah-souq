package services

import (
	"context"
	"encoding/json"
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

type DriverOrderDetail struct {
	ID              string               `json:"id"`
	Status          models.OrderStatus   `json:"status"`
	PlacedAt        time.Time            `json:"placed_at"`
	DeliveredAt     *time.Time           `json:"delivered_at,omitempty"`
	SubtotalDisplay float64              `json:"subtotal_display"`
	CurrencyCode    string               `json:"currency_code"`
	Vendor          DriverOrderVendor    `json:"vendor"`
	Customer        DriverOrderCustomer  `json:"customer"`
	Rating          *DriverOrderRating   `json:"rating,omitempty"`
	TrackingHistory []DriverOrderTracking `json:"tracking_history,omitempty"`
}

type DriverOrderVendor struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type DriverOrderCustomer struct {
	ID        string `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Phone     string `json:"phone"`
}

type DriverOrderRating struct {
	Score   int    `json:"score"`
	Comment string `json:"comment"`
}

type DriverOrderTracking struct {
	Latitude   float64   `json:"latitude"`
	Longitude  float64   `json:"longitude"`
	Heading    float64   `json:"heading"`
	RecordedAt time.Time `json:"recorded_at"`
}

type DriverDetail struct {
	User   models.User         `json:"user"`
	Orders []DriverOrderDetail `json:"orders"`
}

type queryOrderRow struct {
	ID              string             `gorm:"column:id"`
	Status          models.OrderStatus `gorm:"column:status"`
	PlacedAt        time.Time          `gorm:"column:placed_at"`
	DeliveredAt     *time.Time         `gorm:"column:delivered_at"`
	SubtotalDisplay float64            `gorm:"column:subtotal_display"`
	CurrencyCode    string             `gorm:"column:currency_code"`
	VendorID        string             `gorm:"column:vendor_id"`
	VendorNameI18n  json.RawMessage    `gorm:"column:vendor_name_i18n"`
	UserID          string             `gorm:"column:user_id"`
	UserFirstName   *string            `gorm:"column:user_first_name"`
	UserLastName    *string            `gorm:"column:user_last_name"`
	UserPhone       string             `gorm:"column:user_phone"`
	RatingScore     *int               `gorm:"column:rating_score"`
	RatingComment   *string            `gorm:"column:rating_comment"`
}

func (s *AdminUserService) GetDriverDetail(ctx context.Context, driverID string) (*DriverDetail, *apperror.AppError) {
	var driver models.User
	if err := s.db.WithContext(ctx).Where("id = ? AND role = ?", driverID, models.RoleDriver).First(&driver).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperror.NotFound("driver not found")
		}
		return nil, apperror.Internal(fmt.Errorf("admin_user: get driver: %w", err))
	}

	var rows []queryOrderRow
	err := s.db.WithContext(ctx).Raw(`
		SELECT o.id, o.status, o.placed_at, o.delivered_at, o.subtotal_display, o.currency_code,
		       v.id as vendor_id, v.name_i18n as vendor_name_i18n,
		       u.id as user_id, u.first_name as user_first_name, u.last_name as user_last_name, u.phone as user_phone,
		       r.score as rating_score, r.comment as rating_comment
		FROM orders o
		JOIN vendors v ON o.vendor_id = v.id
		JOIN users u ON o.user_id = u.id
		LEFT JOIN ratings r ON o.id = r.order_id
		WHERE o.driver_id = ?
		ORDER BY o.placed_at DESC
	`, driverID).Scan(&rows).Error
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("admin_user: get driver orders: %w", err))
	}

	ordersDetail := make([]DriverOrderDetail, 0, len(rows))
	for _, row := range rows {
		// Resolve vendor name from name_i18n JSON
		var nameMap map[string]string
		vendorName := ""
		if err := json.Unmarshal(row.VendorNameI18n, &nameMap); err == nil {
			if n, ok := nameMap["en"]; ok {
				vendorName = n
			} else if n, ok := nameMap["ar"]; ok {
				vendorName = n
			}
		}
		if vendorName == "" {
			vendorName = "Vendor " + row.VendorID[:8]
		}

		custFN := ""
		if row.UserFirstName != nil {
			custFN = *row.UserFirstName
		}
		custLN := ""
		if row.UserLastName != nil {
			custLN = *row.UserLastName
		}

		var rating *DriverOrderRating
		if row.RatingScore != nil {
			rating = &DriverOrderRating{
				Score:   *row.RatingScore,
				Comment: "",
			}
			if row.RatingComment != nil {
				rating.Comment = *row.RatingComment
			}
		}

		// Load tracking history
		var trackingRows []models.OrderTrackingHistory
		if err := s.db.WithContext(ctx).Where("order_id = ?", row.ID).Order("recorded_at ASC").Find(&trackingRows).Error; err != nil {
			return nil, apperror.Internal(fmt.Errorf("admin_user: get order tracking: %w", err))
		}

		tracking := make([]DriverOrderTracking, len(trackingRows))
		for i, tRow := range trackingRows {
			tracking[i] = DriverOrderTracking{
				Latitude:   tRow.Latitude,
				Longitude:  tRow.Longitude,
				Heading:    tRow.Heading,
				RecordedAt: tRow.RecordedAt,
			}
		}

		ordersDetail = append(ordersDetail, DriverOrderDetail{
			ID:              row.ID,
			Status:          row.Status,
			PlacedAt:        row.PlacedAt,
			DeliveredAt:     row.DeliveredAt,
			SubtotalDisplay: row.SubtotalDisplay,
			CurrencyCode:    row.CurrencyCode,
			Vendor: DriverOrderVendor{
				ID:   row.VendorID,
				Name: vendorName,
			},
			Customer: DriverOrderCustomer{
				ID:        row.UserID,
				FirstName: custFN,
				LastName:  custLN,
				Phone:     row.UserPhone,
			},
			Rating:          rating,
			TrackingHistory: tracking,
		})
	}

	return &DriverDetail{
		User:   driver,
		Orders: ordersDetail,
	}, nil
}
