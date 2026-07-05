package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
)

type LocalizationAdminHandler struct {
	localization *services.LocalizationAdminService
}

func NewLocalizationAdminHandler(localization *services.LocalizationAdminService) *LocalizationAdminHandler {
	return &LocalizationAdminHandler{localization: localization}
}

// ListLocales handles GET /api/v1/admin/locales (blueprint §11.A12).
func (h *LocalizationAdminHandler) ListLocales(c echo.Context) error {
	locales, appErr := h.localization.ListLocales(c.Request().Context())
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": locales})
}

type createLocaleRequest struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	IsRTL     bool   `json:"is_rtl"`
	SortOrder int    `json:"sort_order"`
}

// CreateLocale handles POST /api/v1/admin/locales (blueprint §11.A12:
// "add locale").
func (h *LocalizationAdminHandler) CreateLocale(c echo.Context) error {
	var req createLocaleRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if req.Code == "" || req.Name == "" {
		return apperror.Validation("code and name are required")
	}
	if appErr := h.localization.CreateLocale(c.Request().Context(), services.CreateLocaleInput{
		Code: req.Code, Name: req.Name, IsRTL: req.IsRTL, SortOrder: req.SortOrder,
	}); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusCreated)
}

type setLocaleActiveRequest struct {
	Active bool `json:"active"`
}

// SetActive handles PUT /api/v1/admin/locales/:code/active.
func (h *LocalizationAdminHandler) SetActive(c echo.Context) error {
	var req setLocaleActiveRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.localization.SetLocaleActive(c.Request().Context(), c.Param("code"), req.Active); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// SetDefault handles PUT /api/v1/admin/locales/:code/default (blueprint
// §11.A12: "set default").
func (h *LocalizationAdminHandler) SetDefault(c echo.Context) error {
	if appErr := h.localization.SetDefaultLocale(c.Request().Context(), c.Param("code")); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

type setLocaleRTLRequest struct {
	IsRTL bool `json:"is_rtl"`
}

// SetRTL handles PUT /api/v1/admin/locales/:code/rtl (blueprint §11.A12:
// "toggle RTL").
func (h *LocalizationAdminHandler) SetRTL(c echo.Context) error {
	var req setLocaleRTLRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.localization.SetLocaleRTL(c.Request().Context(), c.Param("code"), req.IsRTL); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// ListTranslations handles GET /api/v1/admin/translations?locale=xx
// (blueprint §11.A12's ui_translations editor).
func (h *LocalizationAdminHandler) ListTranslations(c echo.Context) error {
	var locale *string
	if v := c.QueryParam("locale"); v != "" {
		locale = &v
	}
	rows, appErr := h.localization.ListTranslations(c.Request().Context(), locale)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": rows})
}

type upsertTranslationRequest struct {
	Locale    string `json:"locale"`
	Namespace string `json:"namespace"`
	Key       string `json:"key"`
	Value     string `json:"value"`
}

// UpsertTranslation handles PUT /api/v1/admin/translations (blueprint
// §11.A12: "edit strings").
func (h *LocalizationAdminHandler) UpsertTranslation(c echo.Context) error {
	var req upsertTranslationRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if req.Locale == "" || req.Namespace == "" || req.Key == "" {
		return apperror.Validation("locale, namespace, and key are required")
	}
	if appErr := h.localization.UpsertTranslation(c.Request().Context(), req.Locale, req.Namespace, req.Key, req.Value); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// MissingKeyReport handles GET /api/v1/admin/translations/missing
// (blueprint §11.A12: "missing-key report").
func (h *LocalizationAdminHandler) MissingKeyReport(c echo.Context) error {
	missing, appErr := h.localization.MissingKeyReport(c.Request().Context())
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": missing})
}
