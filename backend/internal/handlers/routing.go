package handlers

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
)

type RoutingHandler struct {
	routing *services.RoutingService
}

func NewRoutingHandler(routing *services.RoutingService) *RoutingHandler {
	return &RoutingHandler{routing: routing}
}

// Route handles GET /api/v1/route?from_lon=&from_lat=&to_lon=&to_lat=
// (authed). Returns the road geometry + duration/distance used to draw the
// route line and show an ETA on the tracking and active-delivery maps.
func (h *RoutingHandler) Route(c echo.Context) error {
	fromLon, appErr := parseCoord(c.QueryParam("from_lon"), "from_lon", 180)
	if appErr != nil {
		return appErr
	}
	fromLat, appErr := parseCoord(c.QueryParam("from_lat"), "from_lat", 90)
	if appErr != nil {
		return appErr
	}
	toLon, appErr := parseCoord(c.QueryParam("to_lon"), "to_lon", 180)
	if appErr != nil {
		return appErr
	}
	toLat, appErr := parseCoord(c.QueryParam("to_lat"), "to_lat", 90)
	if appErr != nil {
		return appErr
	}

	route, appErr := h.routing.Route(c.Request().Context(), fromLon, fromLat, toLon, toLat)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": route})
}

// parseCoord validates one coordinate query param, bounded by max (180 for
// longitude, 90 for latitude) — server-side validation of every input, per
// the security checklist. Rejects an absent/garbage value rather than
// defaulting it to 0,0 (a real point in the Atlantic).
func parseCoord(raw, name string, max float64) (float64, *apperror.AppError) {
	if raw == "" {
		return 0, apperror.Validation(name + " is required")
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, apperror.Validation(name + " must be a number")
	}
	if v < -max || v > max {
		return 0, apperror.Validation(name + " is out of range")
	}
	return v, nil
}
