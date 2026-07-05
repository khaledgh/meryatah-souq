package handlers

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/services"
)

type AdminOrderHandler struct {
	orders *services.OrderService
}

func NewAdminOrderHandler(orders *services.OrderService) *AdminOrderHandler {
	return &AdminOrderHandler{orders: orders}
}

// ListAll handles GET /api/v1/admin/orders (blueprint §11.A13: "global
// orders table with filters (vendor, status, scheduled, date)").
func (h *AdminOrderHandler) ListAll(c echo.Context) error {
	filter := services.AdminOrderFilter{}
	if v := c.QueryParam("vendor_id"); v != "" {
		filter.VendorID = &v
	}
	if v := c.QueryParam("status"); v != "" {
		st := models.OrderStatus(v)
		filter.Status = &st
	}
	if v := c.QueryParam("scheduled_only"); v == "true" {
		filter.ScheduledOnly = true
	}
	if v := c.QueryParam("placed_after"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			filter.PlacedAfter = &t
		}
	}
	if v := c.QueryParam("placed_before"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			filter.PlacedBefore = &t
		}
	}

	orders, appErr := h.orders.AdminListAll(c.Request().Context(), filter)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": orders})
}
