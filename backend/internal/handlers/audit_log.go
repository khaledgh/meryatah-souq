package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/services"
)

type AuditLogHandler struct {
	audit *services.AuditReadService
}

func NewAuditLogHandler(audit *services.AuditReadService) *AuditLogHandler {
	return &AuditLogHandler{audit: audit}
}

// List handles GET /api/v1/admin/audit-log (blueprint §11.A15).
func (h *AuditLogHandler) List(c echo.Context) error {
	filter := services.AuditLogFilter{}
	if v := c.QueryParam("actor_id"); v != "" {
		filter.ActorID = &v
	}
	if v := c.QueryParam("action"); v != "" {
		filter.Action = &v
	}
	if v := c.QueryParam("entity"); v != "" {
		filter.Entity = &v
	}

	page, appErr := h.audit.List(c.Request().Context(), filter)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": page.Logs, "total": page.Total})
}
