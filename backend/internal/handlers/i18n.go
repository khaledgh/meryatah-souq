package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/i18n"
)

type I18nHandler struct {
	service *i18n.Service
}

func NewI18nHandler(service *i18n.Service) *I18nHandler {
	return &I18nHandler{service: service}
}

// GetTranslations serves GET /api/v1/i18n/:locale — all ui_translations for
// the locale, namespaced (blueprint §6.1).
func (h *I18nHandler) GetTranslations(c echo.Context) error {
	locale := c.Param("locale")
	translations, appErr := h.service.Translations(c.Request().Context(), locale)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": translations})
}

// ListLocales serves GET /api/v1/locales — active locales for a language
// switcher.
func (h *I18nHandler) ListLocales(c echo.Context) error {
	return c.JSON(http.StatusOK, echo.Map{"data": h.service.ActiveLocales()})
}
