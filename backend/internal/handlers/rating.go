package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	appmw "meryata-souq/backend/internal/middleware"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
)

type RatingHandler struct {
	ratings *services.RatingService
}

func NewRatingHandler(ratings *services.RatingService) *RatingHandler {
	return &RatingHandler{ratings: ratings}
}

type createRatingRequest struct {
	Score   int     `json:"score"`
	Comment *string `json:"comment,omitempty"`
}

// Create handles POST /api/v1/user/orders/:orderId/rating (blueprint
// §11.C12: "after delivered: 1-5 stars + comment... once per order").
func (h *RatingHandler) Create(c echo.Context) error {
	userID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("authentication required")
	}
	var req createRatingRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}

	rating, appErr := h.ratings.Create(c.Request().Context(), userID, c.Param("orderId"), req.Score, req.Comment)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusCreated, echo.Map{"data": rating})
}

// ListMyRatings handles GET /api/v1/driver/ratings (blueprint §11.D5
// history/earnings).
func (h *RatingHandler) ListMyRatings(c echo.Context) error {
	driverID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("authentication required")
	}
	ratings, appErr := h.ratings.ListForDriver(c.Request().Context(), driverID)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": ratings})
}
