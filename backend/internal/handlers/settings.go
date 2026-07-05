package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
)

// SettingsHandler exposes admin-facing live config writes (blueprint §10
// A10/A11): otp_provider, storage_driver, feature flags, exchange rates.
// Routes are gated to super_admin via RequireAuth+RequireRole in main.go.
type SettingsHandler struct {
	settings *services.SettingsService
}

func NewSettingsHandler(settings *services.SettingsService) *SettingsHandler {
	return &SettingsHandler{settings: settings}
}

// ListAll handles GET /api/v1/admin/settings (blueprint §11.A10).
func (h *SettingsHandler) ListAll(c echo.Context) error {
	snapshot, appErr := h.settings.ListAll(c.Request().Context())
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": snapshot})
}

type setAppConfigRequest struct {
	Value json.RawMessage `json:"value"`
}

func (h *SettingsHandler) SetAppConfig(c echo.Context) error {
	key := c.Param("key")
	var req setAppConfigRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if len(req.Value) == 0 {
		return apperror.Validation("value is required")
	}
	if appErr := h.settings.SetAppConfig(c.Request().Context(), key, req.Value, actorID(c)); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

type setFeatureFlagRequest struct {
	Enabled bool            `json:"enabled"`
	Config  json.RawMessage `json:"config"`
}

func (h *SettingsHandler) SetFeatureFlag(c echo.Context) error {
	key := c.Param("key")
	var req setFeatureFlagRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	cfg := req.Config
	if len(cfg) == 0 {
		cfg = json.RawMessage("{}")
	}
	if appErr := h.settings.SetFeatureFlag(c.Request().Context(), key, req.Enabled, cfg); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

type setExchangeRateRequest struct {
	Rate float64 `json:"rate"`
}

func (h *SettingsHandler) SetExchangeRate(c echo.Context) error {
	code := c.Param("code")
	var req setExchangeRateRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if req.Rate <= 0 {
		return apperror.Validation("rate must be positive")
	}
	if appErr := h.settings.SetExchangeRate(c.Request().Context(), code, req.Rate, actorID(c)); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// actorID returns the authenticated user's ID for the updated_by audit
// column, or nil if unauthenticated. updated_by is a nullable UUID column
// (blueprint §3.1) — it cannot hold a placeholder string like "system".
// Until Phase 3 auth middleware populates "user_id" on the request context,
// every write here is attributed to no one (nil).
func actorID(c echo.Context) *string {
	if v, ok := c.Get("user_id").(string); ok && v != "" {
		return &v
	}
	return nil
}
