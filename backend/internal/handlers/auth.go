package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/pkg/phone"
	"meryata-souq/backend/internal/services"
)

// AuthHandler implements the two-step auth flow (blueprint §9).
type AuthHandler struct {
	otp  *services.OTPService
	auth *services.AuthService
}

func NewAuthHandler(otp *services.OTPService, auth *services.AuthService) *AuthHandler {
	return &AuthHandler{otp: otp, auth: auth}
}

type requestOTPRequest struct {
	Phone string `json:"phone"`
}

// RequestOTP handles POST /auth/request-otp. Always returns 204 regardless
// of whether the phone is registered — no enumeration (§5.2).
func (h *AuthHandler) RequestOTP(c echo.Context) error {
	var req requestOTPRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	normalized, ok := phone.Normalize(req.Phone)
	if !ok {
		return apperror.Validation("invalid phone number")
	}

	if appErr := h.otp.RequestOTP(c.Request().Context(), normalized, c.RealIP()); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

type verifyOTPRequest struct {
	Phone string `json:"phone"`
	Code  string `json:"code"`
}

type verifyOTPResponse struct {
	Status            string      `json:"status"`
	VerificationToken string      `json:"verification_token,omitempty"`
	AccessToken       string      `json:"access_token,omitempty"`
	RefreshToken      string      `json:"refresh_token,omitempty"`
	User              interface{} `json:"user,omitempty"`
}

// VerifyOTP handles POST /auth/verify-otp. Returns either a login payload
// (existing user) or a verification_token for complete-registration (new
// phone) — blueprint §9 step 2.
func (h *AuthHandler) VerifyOTP(c echo.Context) error {
	var req verifyOTPRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	normalized, ok := phone.Normalize(req.Phone)
	if !ok {
		return apperror.Validation("invalid phone number")
	}
	if req.Code == "" {
		return apperror.Validation("code is required")
	}

	result, appErr := h.otp.VerifyOTP(c.Request().Context(), normalized, req.Code)
	if appErr != nil {
		return appErr
	}

	if result.ExistingUser != nil {
		tokens, appErr := h.auth.IssueTokensForVerifiedUser(c.Request().Context(), result.ExistingUser, c.RealIP(), c.Request().UserAgent())
		if appErr != nil {
			return appErr
		}
		return c.JSON(http.StatusOK, verifyOTPResponse{
			Status:       "login",
			AccessToken:  tokens.AccessToken,
			RefreshToken: tokens.RefreshToken,
			User:         tokens.User,
		})
	}

	return c.JSON(http.StatusOK, verifyOTPResponse{
		Status:            "register_required",
		VerificationToken: result.VerificationToken,
	})
}

type completeRegistrationRequest struct {
	VerificationToken string `json:"verification_token"`
	FirstName         string `json:"first_name"`
	LastName          string `json:"last_name"`
	Password          string `json:"password"`
	PreferredLocale   string `json:"preferred_locale"`
}

// CompleteRegistration handles POST /auth/complete-registration (§9 step
// 3).
func (h *AuthHandler) CompleteRegistration(c echo.Context) error {
	var req completeRegistrationRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if req.VerificationToken == "" {
		return apperror.Validation("verification_token is required")
	}
	if len(req.Password) < 8 {
		return apperror.Validation("password must be at least 8 characters")
	}
	if req.FirstName == "" || req.LastName == "" {
		return apperror.Validation("first_name and last_name are required")
	}

	tokens, appErr := h.auth.CompleteRegistration(c.Request().Context(),
		req.VerificationToken, req.FirstName, req.LastName, req.Password, req.PreferredLocale,
		c.RealIP(), c.Request().UserAgent())
	if appErr != nil {
		return appErr
	}

	return c.JSON(http.StatusCreated, verifyOTPResponse{
		Status:       "login",
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		User:         tokens.User,
	})
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// Refresh handles POST /auth/refresh (§9 step 4, §5.1 rotation).
func (h *AuthHandler) Refresh(c echo.Context) error {
	var req refreshRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if req.RefreshToken == "" {
		return apperror.Validation("refresh_token is required")
	}

	tokens, appErr := h.auth.Refresh(c.Request().Context(), req.RefreshToken, c.RealIP(), c.Request().UserAgent())
	if appErr != nil {
		return appErr
	}

	return c.JSON(http.StatusOK, verifyOTPResponse{
		Status:       "login",
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		User:         tokens.User,
	})
}

type loginPasswordRequest struct {
	Phone    string `json:"phone"`
	Password string `json:"password"`
}

// LoginPassword handles POST /auth/login-password: credential login for
// roles that require it (super_admin, per §11.A1). Enforces lockout
// (§5.2).
func (h *AuthHandler) LoginPassword(c echo.Context) error {
	var req loginPasswordRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	normalized, ok := phone.Normalize(req.Phone)
	if !ok {
		return apperror.Unauthorized("invalid credentials")
	}
	if req.Password == "" {
		return apperror.Unauthorized("invalid credentials")
	}

	tokens, appErr := h.auth.LoginWithPassword(c.Request().Context(), normalized, req.Password, c.RealIP(), c.Request().UserAgent())
	if appErr != nil {
		return appErr
	}

	return c.JSON(http.StatusOK, verifyOTPResponse{
		Status:       "login",
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		User:         tokens.User,
	})
}

// Logout handles POST /auth/logout: revokes the given refresh token.
func (h *AuthHandler) Logout(c echo.Context) error {
	var req refreshRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if req.RefreshToken == "" {
		return apperror.Validation("refresh_token is required")
	}
	if appErr := h.auth.Logout(c.Request().Context(), req.RefreshToken); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}
