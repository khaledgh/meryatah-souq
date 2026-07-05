package handlers

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
)

type VendorHoursHandler struct {
	hours *services.VendorHoursService
}

func NewVendorHoursHandler(hours *services.VendorHoursService) *VendorHoursHandler {
	return &VendorHoursHandler{hours: hours}
}

// OpenStatus handles GET /api/v1/vendors/:id/open-status — public (used by
// the store page and home screen Open/Closed badge, blueprint §11.C5/C6).
func (h *VendorHoursHandler) OpenStatus(c echo.Context) error {
	status, appErr := h.hours.IsOpenNow(c.Request().Context(), c.Param("id"), time.Now())
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": status})
}

type vendorHourInput struct {
	DayOfWeek int    `json:"day_of_week"`
	OpenTime  string `json:"open_time"`
	CloseTime string `json:"close_time"`
	IsClosed  bool   `json:"is_closed"`
}

type setWeeklyHoursRequest struct {
	Hours []vendorHourInput `json:"hours"`
}

// SetWeeklyHours handles PUT /api/v1/vendor/:id/hours (vendor-owner only,
// blueprint §11.B4).
func (h *VendorHoursHandler) SetWeeklyHours(c echo.Context) error {
	var req setWeeklyHoursRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}

	vendorID := c.Param("id")
	rows := make([]models.VendorHour, 0, len(req.Hours))
	for _, in := range req.Hours {
		rows = append(rows, models.VendorHour{
			VendorID:  vendorID,
			DayOfWeek: in.DayOfWeek,
			OpenTime:  in.OpenTime,
			CloseTime: in.CloseTime,
			IsClosed:  in.IsClosed,
		})
	}

	if appErr := h.hours.SetWeeklyHours(c.Request().Context(), vendorID, rows); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// ListWeeklyHours handles GET /api/v1/vendors/:id/hours — public (a store
// page can show hours even to guests).
func (h *VendorHoursHandler) ListWeeklyHours(c echo.Context) error {
	rows, appErr := h.hours.ListWeeklyHours(c.Request().Context(), c.Param("id"))
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": rows})
}

type upsertOverrideRequest struct {
	Date      string  `json:"date"`
	IsClosed  bool    `json:"is_closed"`
	OpenTime  *string `json:"open_time,omitempty"`
	CloseTime *string `json:"close_time,omitempty"`
	Note      *string `json:"note,omitempty"`
}

// UpsertOverride handles POST /api/v1/vendor/:id/hours/overrides
// (vendor-owner only, blueprint §11.B4).
func (h *VendorHoursHandler) UpsertOverride(c echo.Context) error {
	var req upsertOverrideRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if req.Date == "" {
		return apperror.Validation("date is required")
	}

	override := models.VendorHourOverride{
		VendorID:  c.Param("id"),
		Date:      req.Date,
		IsClosed:  req.IsClosed,
		OpenTime:  req.OpenTime,
		CloseTime: req.CloseTime,
		Note:      req.Note,
	}
	if appErr := h.hours.UpsertOverride(c.Request().Context(), override); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// ListOverrides handles GET /api/v1/vendor/:id/hours/overrides
// (vendor-owner only).
func (h *VendorHoursHandler) ListOverrides(c echo.Context) error {
	rows, appErr := h.hours.ListOverrides(c.Request().Context(), c.Param("id"))
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": rows})
}

// DeleteOverride handles DELETE /api/v1/vendor/:id/hours/overrides/:overrideId
// (vendor-owner only).
func (h *VendorHoursHandler) DeleteOverride(c echo.Context) error {
	if appErr := h.hours.DeleteOverride(c.Request().Context(), c.Param("id"), c.Param("overrideId")); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}
