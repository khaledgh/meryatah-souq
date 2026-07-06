package services

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/config"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/pkg/security"
)

const (
	// maxFailedLogins triggers a lockout (§5.2).
	maxFailedLogins = 5
	// lockoutDuration is the base lockout window; doubles are not
	// implemented here (a single fixed window keeps Phase 3 scope
	// tractable — exponential backoff can be layered on later without
	// changing the schema).
	lockoutDuration = 15 * time.Minute
)

// AuthTokens is the response payload for successful login/refresh
// (blueprint §9).
type AuthTokens struct {
	AccessToken  string
	RefreshToken string
	User         models.User
}

type AuthService struct {
	db         *gorm.DB
	cfg        *config.Config
	cache      *config.Cache
	otpService *OTPService
	audit      *AuditService
}

func NewAuthService(db *gorm.DB, cfg *config.Config, cache *config.Cache, otpService *OTPService, audit *AuditService) *AuthService {
	return &AuthService{db: db, cfg: cfg, cache: cache, otpService: otpService, audit: audit}
}

// VendorLoginMethod returns the admin-configured login method for vendors
// ("otp" or "password"), defaulting to "otp". Read live from the config cache
// so an admin change takes effect without restart (blueprint §11.A10). Safe
// to expose publicly — it only tells a client which login form to show.
func (s *AuthService) VendorLoginMethod() string {
	method, _ := s.cache.AppConfigString("vendor_login_method")
	if method == "password" {
		return "password"
	}
	return "otp"
}

// CompleteRegistration finishes step 2 of the auth flow for a brand-new
// phone: consumes the verification token, hashes the password, creates the
// user, and issues tokens.
func (s *AuthService) CompleteRegistration(ctx context.Context, verificationToken, firstName, lastName, password, preferredLocale, clientIP, userAgent string) (*AuthTokens, *apperror.AppError) {
	phone, appErr := s.otpService.ConsumeVerificationToken(ctx, verificationToken)
	if appErr != nil {
		return nil, appErr
	}

	var existing models.User
	err := s.db.WithContext(ctx).Where("phone = ?", phone).First(&existing).Error
	if err == nil {
		return nil, apperror.Validation("account already exists for this phone")
	}
	if err != gorm.ErrRecordNotFound {
		return nil, apperror.Internal(fmt.Errorf("auth: check existing user: %w", err))
	}

	passwordHash, err := security.HashPassword(password)
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("auth: hash password: %w", err))
	}

	locale := preferredLocale
	if locale == "" {
		locale = "en"
	}

	user := models.User{
		ID:              newUUID(),
		Phone:           phone,
		PhoneVerified:   true,
		FirstName:       &firstName,
		LastName:        &lastName,
		PasswordHash:    &passwordHash,
		Role:            models.RoleUser,
		PreferredLocale: &locale,
		IsActive:        true,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}
	if err := s.db.WithContext(ctx).Create(&user).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("auth: create user: %w", err))
	}

	s.audit.Log(ctx, &user.ID, &user.Role, "user.register", "users", &user.ID, clientIP, nil)

	return s.issueTokenPair(ctx, &user, clientIP, userAgent)
}

// IssueTokensForVerifiedUser issues a token pair for a user who has just
// completed OTP verification (blueprint §9 step 2: "Complete user → issue
// access+refresh"). Possession of the phone (proven by OTP) is the auth
// factor here — no password step in this path. Blocked if the account is
// locked or deactivated.
func (s *AuthService) IssueTokensForVerifiedUser(ctx context.Context, user *models.User, clientIP, userAgent string) (*AuthTokens, *apperror.AppError) {
	// When the admin has set vendors to password login, vendors must not be
	// able to sign in via OTP. The phone is already OTP-verified at this point
	// (so there's no enumeration concern), which lets us return a clear,
	// actionable message steering them to password login.
	if user.Role == models.RoleVendor && s.VendorLoginMethod() == "password" {
		return nil, apperror.New("VENDOR_PASSWORD_LOGIN_REQUIRED", 403,
			"vendor login method is password; OTP login disabled for vendors",
			"Please sign in with your password.")
	}

	if user.LockedUntil != nil && user.LockedUntil.After(time.Now()) {
		return nil, apperror.New("ACCOUNT_LOCKED", 423, "account locked", "Too many failed attempts. Try again later.")
	}
	if !user.IsActive {
		return nil, apperror.Forbidden("account is deactivated")
	}

	s.audit.Log(ctx, &user.ID, &user.Role, "user.login_otp", "users", &user.ID, clientIP, nil)

	return s.issueTokenPair(ctx, user, clientIP, userAgent)
}

// LoginWithPassword authenticates an already-verified user with
// phone+password (used by roles that require credential login, e.g.
// super_admin per §11.A1), enforcing lockout (§5.2).
func (s *AuthService) LoginWithPassword(ctx context.Context, phoneE164, password, clientIP, userAgent string) (*AuthTokens, *apperror.AppError) {
	var user models.User
	if err := s.db.WithContext(ctx).Where("phone = ?", phoneE164).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			// Same error as a wrong password: no enumeration.
			return nil, apperror.Unauthorized("invalid credentials")
		}
		return nil, apperror.Internal(fmt.Errorf("auth: load user: %w", err))
	}

	// Vendors may only use password login when the admin has selected it as
	// the global vendor login method; otherwise reject with the same generic
	// credentials error (no enumeration, identical shape to a wrong password).
	if user.Role == models.RoleVendor && s.VendorLoginMethod() != "password" {
		return nil, apperror.Unauthorized("invalid credentials")
	}

	if user.LockedUntil != nil && user.LockedUntil.After(time.Now()) {
		return nil, apperror.New("ACCOUNT_LOCKED", 423, "account locked", "Too many failed attempts. Try again later.")
	}

	if user.PasswordHash == nil {
		return nil, apperror.Unauthorized("invalid credentials")
	}
	valid, err := security.VerifyPassword(password, *user.PasswordHash)
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("auth: verify password: %w", err))
	}
	if !valid {
		s.recordFailedLogin(ctx, &user)
		return nil, apperror.Unauthorized("invalid credentials")
	}

	// Correct password proves legitimate access, but a deactivated account
	// must never have its lockout state cleared or reach token issuance —
	// check before any write.
	if !user.IsActive {
		return nil, apperror.Forbidden("account is deactivated")
	}

	if user.FailedLogins > 0 || user.LockedUntil != nil {
		s.db.WithContext(ctx).Model(&user).Updates(map[string]any{"failed_logins": 0, "locked_until": nil})
	}

	s.audit.Log(ctx, &user.ID, &user.Role, "user.login", "users", &user.ID, clientIP, nil)

	return s.issueTokenPair(ctx, &user, clientIP, userAgent)
}

// recordFailedLogin atomically increments failed_logins in the DB (via a
// SQL expression, not a read-modify-write of the in-memory value), then
// re-reads the post-increment count to decide whether to lock the account.
// This avoids a stale-read bug where the lockout threshold would never
// trigger under concurrent failed attempts, since each request would
// otherwise compute newCount from the same pre-increment in-memory value
// instead of the DB's true current count.
func (s *AuthService) recordFailedLogin(ctx context.Context, user *models.User) {
	if err := s.db.WithContext(ctx).Model(&models.User{}).
		Where("id = ?", user.ID).
		Update("failed_logins", gorm.Expr("failed_logins + 1")).Error; err != nil {
		return
	}

	var updated models.User
	if err := s.db.WithContext(ctx).Select("failed_logins").Where("id = ?", user.ID).First(&updated).Error; err != nil {
		return
	}
	if updated.FailedLogins >= maxFailedLogins {
		s.db.WithContext(ctx).Model(&models.User{}).
			Where("id = ?", user.ID).
			Update("locked_until", time.Now().Add(lockoutDuration))
	}
}

// Refresh rotates a refresh token: validates it, detects reuse of an
// already-revoked token (revoking the whole chain if so), and issues a new
// pair (blueprint §5.1). The old token's revocation and the new token's
// creation happen inside a single DB transaction, so a crash or error
// mid-rotation can never leave both the old and new tokens simultaneously
// valid — either the whole rotation commits, or none of it does and the
// original token remains valid for a subsequent retry.
func (s *AuthService) Refresh(ctx context.Context, rawToken, clientIP, userAgent string) (*AuthTokens, *apperror.AppError) {
	tokenHash := security.HashRefreshToken(rawToken)

	var stored models.RefreshToken
	err := s.db.WithContext(ctx).Where("token_hash = ?", tokenHash).First(&stored).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, apperror.Unauthorized("invalid refresh token")
		}
		return nil, apperror.Internal(fmt.Errorf("auth: load refresh token: %w", err))
	}

	if stored.RevokedAt != nil {
		// Reuse of a revoked token: someone may have stolen it. Revoke the
		// whole chain and force re-auth (§5.1).
		s.revokeChainFrom(ctx, stored.UserID)
		return nil, apperror.Unauthorized("refresh token reuse detected; all sessions revoked")
	}

	if stored.ExpiresAt.Before(time.Now()) {
		return nil, apperror.Unauthorized("refresh token expired")
	}

	var user models.User
	if err := s.db.WithContext(ctx).Where("id = ?", stored.UserID).First(&user).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("auth: load user for refresh: %w", err))
	}
	if !user.IsActive {
		return nil, apperror.Forbidden("account is deactivated")
	}

	accessToken, rawRefresh, newRefreshRow, err := s.buildTokenPair(&user, clientIP, userAgent)
	if err != nil {
		return nil, apperror.Internal(err)
	}

	txErr := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(newRefreshRow).Error; err != nil {
			return fmt.Errorf("store new refresh token: %w", err)
		}
		now := time.Now()
		if err := tx.Model(&stored).Updates(map[string]any{
			"revoked_at":  now,
			"replaced_by": newRefreshRow.ID,
		}).Error; err != nil {
			return fmt.Errorf("revoke old refresh token: %w", err)
		}
		return nil
	})
	if txErr != nil {
		return nil, apperror.Internal(fmt.Errorf("auth: rotate refresh token: %w", txErr))
	}

	return &AuthTokens{AccessToken: accessToken, RefreshToken: rawRefresh, User: user}, nil
}

// revokeChainFrom revokes every non-revoked refresh token for a user, used
// when reuse of a revoked token is detected (possible theft).
func (s *AuthService) revokeChainFrom(ctx context.Context, userID string) {
	now := time.Now()
	s.db.WithContext(ctx).Model(&models.RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", now)
}

// Logout revokes a single refresh token.
func (s *AuthService) Logout(ctx context.Context, rawToken string) *apperror.AppError {
	tokenHash := security.HashRefreshToken(rawToken)
	now := time.Now()
	if err := s.db.WithContext(ctx).Model(&models.RefreshToken{}).
		Where("token_hash = ? AND revoked_at IS NULL", tokenHash).
		Update("revoked_at", now).Error; err != nil {
		return apperror.Internal(fmt.Errorf("auth: revoke refresh token: %w", err))
	}
	return nil
}

// buildTokenPair generates an access token and a not-yet-persisted refresh
// token row, without touching the DB. Callers decide how to persist the
// row (a plain Create for fresh logins, or inside a transaction alongside
// revoking an old token for rotation).
func (s *AuthService) buildTokenPair(user *models.User, clientIP, userAgent string) (accessToken, rawRefresh string, refreshRow *models.RefreshToken, err error) {
	jti := newUUID()
	accessToken, err = security.IssueAccessToken([]byte(s.cfg.JWTSecret), user.ID, string(user.Role), s.cfg.JWTAccessTTL, jti)
	if err != nil {
		return "", "", nil, err
	}

	rawRefresh, err = security.GenerateRefreshToken()
	if err != nil {
		return "", "", nil, err
	}

	refreshRow = &models.RefreshToken{
		ID:        newUUID(),
		UserID:    user.ID,
		TokenHash: security.HashRefreshToken(rawRefresh),
		ExpiresAt: time.Now().Add(s.cfg.JWTRefreshTTL),
		CreatedIP: &clientIP,
		UserAgent: &userAgent,
		CreatedAt: time.Now(),
	}
	return accessToken, rawRefresh, refreshRow, nil
}

func (s *AuthService) issueTokenPair(ctx context.Context, user *models.User, clientIP, userAgent string) (*AuthTokens, *apperror.AppError) {
	accessToken, rawRefresh, refreshRow, err := s.buildTokenPair(user, clientIP, userAgent)
	if err != nil {
		return nil, apperror.Internal(err)
	}
	if err := s.db.WithContext(ctx).Create(refreshRow).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("auth: store refresh token: %w", err))
	}
	return &AuthTokens{AccessToken: accessToken, RefreshToken: rawRefresh, User: *user}, nil
}
