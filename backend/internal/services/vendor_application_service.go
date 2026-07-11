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

// VendorApplicationService implements the vendor onboarding queue (blueprint
// §11.A5): OTP-verified submission (no account yet, just a proven phone),
// then super_admin approve/reject. Approval creates the Vendor + owner User
// rows in one transaction so the queue can never produce a Vendor without
// an owner or vice versa.
type VendorApplicationService struct {
	db    *gorm.DB
	audit *AuditService
	otp   *OTPService
}

func NewVendorApplicationService(db *gorm.DB, audit *AuditService, otp *OTPService) *VendorApplicationService {
	return &VendorApplicationService{db: db, audit: audit, otp: otp}
}

const (
	maxBusinessNameI18nBytes = 4 * 1024
	maxNotesLength           = 2000
	maxAddressLength         = 500
)

type SubmitApplicationInput struct {
	// VerificationToken proves the applicant controls ContactPhone: it must
	// be a token just issued by the OTP verify-otp flow for a *new* phone
	// (otp_service.go only issues one when no User exists yet for that
	// phone — see VerifyOTP's "register_required" branch). This closes the
	// account-hijack race where anyone could self-report someone else's
	// number as contact_phone and later race them to claim the resulting
	// account: the phone must be proven before the application even exists.
	VerificationToken string
	BusinessNameI18n  json.RawMessage
	Category          string
	ContactFirstName  string
	ContactLastName   string
	Address           string
	Timezone          string
	Longitude         float64
	Latitude          float64
	Notes             string
}

// Submit records a new pending application. Requires a fresh OTP
// verification token for the contact phone (see SubmitApplicationInput) —
// this is the only auth this endpoint needs, since it proves phone
// ownership without requiring a full account yet (blueprint §11.A5 "pending
// applications queue").
func (s *VendorApplicationService) Submit(ctx context.Context, in SubmitApplicationInput) (*models.VendorApplication, *apperror.AppError) {
	if in.Category == "" {
		return nil, apperror.Validation("category is required")
	}
	if in.ContactFirstName == "" || in.ContactLastName == "" {
		return nil, apperror.Validation("contact_first_name and contact_last_name are required")
	}
	if in.Timezone == "" {
		in.Timezone = "Asia/Beirut"
	}
	if !validLongitude(in.Longitude) || !validLatitude(in.Latitude) {
		return nil, apperror.Validation("invalid location coordinates")
	}
	if len(in.BusinessNameI18n) == 0 || !json.Valid(in.BusinessNameI18n) {
		return nil, apperror.Validation("business_name_i18n must be valid JSON")
	}
	if len(in.BusinessNameI18n) > maxBusinessNameI18nBytes {
		return nil, apperror.Validation("business_name_i18n is too large")
	}
	var nameShape map[string]any
	if err := json.Unmarshal(in.BusinessNameI18n, &nameShape); err != nil || len(nameShape) == 0 {
		return nil, apperror.Validation("business_name_i18n must be a non-empty object of locale to name")
	}
	if len(in.Notes) > maxNotesLength {
		return nil, apperror.Validation("notes is too long")
	}
	if len(in.Address) > maxAddressLength {
		return nil, apperror.Validation("address is too long")
	}

	contactPhone, appErr := s.otp.ConsumeVerificationToken(ctx, in.VerificationToken)
	if appErr != nil {
		return nil, appErr
	}

	id := newUUID()
	err := s.db.WithContext(ctx).Exec(`
		INSERT INTO vendor_applications
			(id, status, business_name_i18n, category, contact_phone, contact_first_name,
			 contact_last_name, address, timezone, location, notes, submitted_at)
		VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?, ?)
	`, id, in.BusinessNameI18n, in.Category, contactPhone, in.ContactFirstName,
		in.ContactLastName, in.Address, in.Timezone, in.Longitude, in.Latitude, in.Notes, time.Now()).Error
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("vendor_application: submit: %w", err))
	}

	return s.GetByID(ctx, id)
}

// GetByID loads an application by ID, including its lon/lat.
func (s *VendorApplicationService) GetByID(ctx context.Context, id string) (*models.VendorApplication, *apperror.AppError) {
	var a models.VendorApplication
	err := s.db.WithContext(ctx).Raw(`
		SELECT id, status, business_name_i18n, category, contact_phone, contact_first_name,
		       contact_last_name, address, timezone, notes, reject_reason, reviewed_by,
		       reviewed_at, created_vendor_id, created_user_id, submitted_at,
		       ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude
		FROM vendor_applications WHERE id = ?
	`, id).Scan(&a).Error
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("vendor_application: load: %w", err))
	}
	if a.ID == "" {
		return nil, apperror.NotFound("vendor application")
	}
	return &a, nil
}

// List returns applications, optionally filtered by status (pending by
// default for the admin queue — blueprint §11.A5), newest first.
func (s *VendorApplicationService) List(ctx context.Context, status models.VendorApplicationStatus) ([]models.VendorApplication, *apperror.AppError) {
	q := s.db.WithContext(ctx).Raw(`
		SELECT id, status, business_name_i18n, category, contact_phone, contact_first_name,
		       contact_last_name, address, timezone, notes, reject_reason, reviewed_by,
		       reviewed_at, created_vendor_id, created_user_id, submitted_at,
		       ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude
		FROM vendor_applications
		WHERE (? = '' OR status = ?)
		ORDER BY submitted_at DESC
	`, string(status), string(status))

	apps := make([]models.VendorApplication, 0)
	if err := q.Scan(&apps).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("vendor_application: list: %w", err))
	}
	return apps, nil
}

// Approve creates the Vendor + owner User (role=vendor, phone already
// verified at submission time — see Submit's VerificationToken requirement
// — no password; the owner completes auth via the normal phone+OTP login
// flow, same as any other role) in a single transaction, then marks the
// application approved and links both new rows back to it. Rejects if the
// application isn't pending, or (a rare race, since Submit already proved
// the phone was unregistered) if a user now exists for the contact phone —
// that case returns the same generic error as any other failure, since
// disclosing account existence here would contradict this codebase's
// no-enumeration policy (see otp_service.go).
func (s *VendorApplicationService) Approve(ctx context.Context, applicationID, reviewerID, reviewerIP string) (*models.Vendor, *apperror.AppError) {
	app, appErr := s.GetByID(ctx, applicationID)
	if appErr != nil {
		return nil, appErr
	}
	if app.Status != models.VendorApplicationPending {
		return nil, apperror.Validation("application is not pending")
	}

	var existing models.User
	err := s.db.WithContext(ctx).Where("phone = ?", app.ContactPhone).First(&existing).Error
	if err == nil {
		return nil, apperror.Validation("unable to approve this application")
	}
	if err != gorm.ErrRecordNotFound {
		return nil, apperror.Internal(fmt.Errorf("vendor_application: check existing user: %w", err))
	}

	userID := newUUID()
	vendorID := newUUID()
	now := time.Now()

	// Resolve the application's free-text category to an admin-managed
	// store_categories row by slug (same lower/trim rule as the 000009
	// backfill migration), falling back to "other" so approval never blocks
	// on an unrecognized category value.
	var storeCategoryID string
	slugErr := s.db.WithContext(ctx).Raw(`
		SELECT id FROM store_categories WHERE slug = lower(trim(?))
	`, app.Category).Scan(&storeCategoryID).Error
	if slugErr != nil {
		return nil, apperror.Internal(fmt.Errorf("vendor_application: resolve store category: %w", slugErr))
	}
	if storeCategoryID == "" {
		if fallbackErr := s.db.WithContext(ctx).Raw(`
			SELECT id FROM store_categories WHERE slug = 'other'
		`).Scan(&storeCategoryID).Error; fallbackErr != nil {
			return nil, apperror.Internal(fmt.Errorf("vendor_application: resolve fallback store category: %w", fallbackErr))
		}
	}

	txErr := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		user := models.User{
			ID:            userID,
			Phone:         app.ContactPhone,
			PhoneVerified: true,
			FirstName:     &app.ContactFirstName,
			LastName:      &app.ContactLastName,
			Role:          models.RoleVendor,
			IsActive:      true,
			CreatedAt:     now,
			UpdatedAt:     now,
		}
		if err := tx.Create(&user).Error; err != nil {
			return fmt.Errorf("create owner user: %w", err)
		}

		if err := tx.Exec(`
			INSERT INTO vendors (id, owner_user_id, name_i18n, category, store_category_id, location, address, timezone, created_at)
			VALUES (?, ?, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?, ?, ?)
		`, vendorID, userID, app.BusinessNameI18n, app.Category, storeCategoryID, app.Longitude, app.Latitude,
			app.Address, app.Timezone, now).Error; err != nil {
			return fmt.Errorf("create vendor: %w", err)
		}

		if err := tx.Exec(`
			UPDATE vendor_applications
			SET status = 'approved', reviewed_by = ?, reviewed_at = ?,
			    created_vendor_id = ?, created_user_id = ?
			WHERE id = ?
		`, reviewerID, now, vendorID, userID, applicationID).Error; err != nil {
			return fmt.Errorf("mark approved: %w", err)
		}

		return nil
	})
	if txErr != nil {
		return nil, apperror.Internal(fmt.Errorf("vendor_application: approve: %w", txErr))
	}

	reviewerRole := models.RoleSuperAdmin
	s.audit.Log(ctx, &reviewerID, &reviewerRole, "vendor_application.approve", "vendor_applications", &applicationID, reviewerIP, map[string]any{
		"created_vendor_id": vendorID,
		"created_user_id":   userID,
	})

	return &models.Vendor{ID: vendorID}, nil
}

// Reject marks a pending application rejected with a reason (blueprint
// §11.A5: "approve/reject with reason").
func (s *VendorApplicationService) Reject(ctx context.Context, applicationID, reason, reviewerID, reviewerIP string) *apperror.AppError {
	if reason == "" {
		return apperror.Validation("reject reason is required")
	}
	app, appErr := s.GetByID(ctx, applicationID)
	if appErr != nil {
		return appErr
	}
	if app.Status != models.VendorApplicationPending {
		return apperror.Validation("application is not pending")
	}

	now := time.Now()
	if err := s.db.WithContext(ctx).Exec(`
		UPDATE vendor_applications
		SET status = 'rejected', reject_reason = ?, reviewed_by = ?, reviewed_at = ?
		WHERE id = ?
	`, reason, reviewerID, now, applicationID).Error; err != nil {
		return apperror.Internal(fmt.Errorf("vendor_application: reject: %w", err))
	}

	reviewerRole := models.RoleSuperAdmin
	s.audit.Log(ctx, &reviewerID, &reviewerRole, "vendor_application.reject", "vendor_applications", &applicationID, reviewerIP, map[string]any{
		"reason": reason,
	})

	return nil
}
