package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
)

type CurrencyAdminHandler struct {
	currencies *services.CurrencyAdminService
}

func NewCurrencyAdminHandler(currencies *services.CurrencyAdminService) *CurrencyAdminHandler {
	return &CurrencyAdminHandler{currencies: currencies}
}

// List handles GET /api/v1/admin/currencies (blueprint §11.A11).
func (h *CurrencyAdminHandler) List(c echo.Context) error {
	currencies, appErr := h.currencies.List(c.Request().Context())
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": currencies})
}

type createCurrencyRequest struct {
	Code     string `json:"code"`
	Symbol   string `json:"symbol"`
	Name     string `json:"name"`
	Decimals int    `json:"decimals"`
}

// Create handles POST /api/v1/admin/currencies (blueprint §11.A11:
// "add/activate currency").
func (h *CurrencyAdminHandler) Create(c echo.Context) error {
	var req createCurrencyRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if req.Code == "" || req.Symbol == "" || req.Name == "" {
		return apperror.Validation("code, symbol, and name are required")
	}
	if appErr := h.currencies.CreateCurrency(c.Request().Context(), req.Code, req.Symbol, req.Name, req.Decimals); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusCreated)
}

type setCurrencyActiveRequest struct {
	Active bool `json:"active"`
}

// SetActive handles PUT /api/v1/admin/currencies/:code/active (blueprint
// §11.A11: "activate currency"). The base currency cannot be deactivated.
func (h *CurrencyAdminHandler) SetActive(c echo.Context) error {
	var req setCurrencyActiveRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.currencies.SetActive(c.Request().Context(), c.Param("code"), req.Active); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}
