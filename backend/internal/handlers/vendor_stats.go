package handlers

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/services"
)

type VendorStatsHandler struct {
	stats *services.VendorStatsService
}

func NewVendorStatsHandler(stats *services.VendorStatsService) *VendorStatsHandler {
	return &VendorStatsHandler{stats: stats}
}

// Dashboard handles GET /api/v1/vendor/:id/dashboard (vendor-owner only,
// blueprint §11.B2). Ownership is enforced by the vendorOwn route group.
func (h *VendorStatsHandler) Dashboard(c echo.Context) error {
	dashboard, appErr := h.stats.Dashboard(c.Request().Context(), c.Param("id"))
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": dashboard})
}

// Earnings handles GET /api/v1/vendor/:id/earnings?days=30 (vendor-owner
// only, blueprint §11.B11).
func (h *VendorStatsHandler) Earnings(c echo.Context) error {
	days := 0
	if v := c.QueryParam("days"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil {
			days = parsed
		}
	}
	report, appErr := h.stats.Earnings(c.Request().Context(), c.Param("id"), days)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": report})
}
