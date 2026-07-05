package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
)

type CategoryHandler struct {
	categories *services.CategoryService
}

func NewCategoryHandler(categories *services.CategoryService) *CategoryHandler {
	return &CategoryHandler{categories: categories}
}

// List handles GET /api/v1/vendors/:id/categories — public (a store page
// shows category tabs to any visitor, blueprint §11.C6).
func (h *CategoryHandler) List(c echo.Context) error {
	rows, appErr := h.categories.List(c.Request().Context(), c.Param("id"))
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": rows})
}

type createCategoryRequest struct {
	NameI18n  json.RawMessage `json:"name_i18n"`
	SortOrder int             `json:"sort_order"`
}

// Create handles POST /api/v1/vendor/:id/categories (vendor-owner only).
func (h *CategoryHandler) Create(c echo.Context) error {
	var req createCategoryRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if len(req.NameI18n) == 0 {
		return apperror.Validation("name_i18n is required")
	}

	category, appErr := h.categories.Create(c.Request().Context(), c.Param("id"), req.NameI18n, req.SortOrder)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusCreated, echo.Map{"data": category})
}

type updateCategoryRequest struct {
	NameI18n  *json.RawMessage `json:"name_i18n,omitempty"`
	SortOrder *int             `json:"sort_order,omitempty"`
}

// Update handles PATCH /api/v1/vendor/:id/categories/:categoryId
// (vendor-owner only).
func (h *CategoryHandler) Update(c echo.Context) error {
	var req updateCategoryRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.categories.Update(c.Request().Context(), c.Param("id"), c.Param("categoryId"), req.NameI18n, req.SortOrder); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// Delete handles DELETE /api/v1/vendor/:id/categories/:categoryId
// (vendor-owner only).
func (h *CategoryHandler) Delete(c echo.Context) error {
	if appErr := h.categories.Delete(c.Request().Context(), c.Param("id"), c.Param("categoryId")); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}
