package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	appmw "meryata-souq/backend/internal/middleware"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
)

type NotificationHandler struct {
	notifications *services.NotificationService
}

func NewNotificationHandler(notifications *services.NotificationService) *NotificationHandler {
	return &NotificationHandler{notifications: notifications}
}

type registerPushTokenRequest struct {
	PlayerID string `json:"player_id"`
	Platform string `json:"platform"`
}

// RegisterPushToken handles POST /api/v1/push-tokens (any authenticated
// role — user/vendor/driver all register device tokens the same way,
// blueprint §3.2 push_tokens).
func (h *NotificationHandler) RegisterPushToken(c echo.Context) error {
	userID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("authentication required")
	}
	role, _ := appmw.Role(c)

	var req registerPushTokenRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if req.PlayerID == "" {
		return apperror.Validation("player_id is required")
	}

	if appErr := h.notifications.RegisterPushToken(c.Request().Context(), userID, req.PlayerID, models.UserRole(role), req.Platform); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}
