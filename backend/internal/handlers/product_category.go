package handlers

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
)

type ProductCategoryHandler struct {
	categories *services.ProductCategoryService
}

func NewProductCategoryHandler(categories *services.ProductCategoryService) *ProductCategoryHandler {
	return &ProductCategoryHandler{categories: categories}
}

// ListActive handles GET /api/v1/store-categories/:id/product-categories —
// public. Also reachable without a store category filter via
// GET /api/v1/product-categories for a full active list.
func (h *ProductCategoryHandler) ListActive(c echo.Context) error {
	categories, appErr := h.categories.ListActive(c.Request().Context(), c.Param("id"))
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": categories})
}

// List handles GET /api/v1/admin/product-categories (super_admin only).
func (h *ProductCategoryHandler) List(c echo.Context) error {
	categories, appErr := h.categories.List(c.Request().Context())
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": categories})
}

func parseProductCategoryForm(c echo.Context) (name, slug string, parentID, storeCategoryID *string, sortOrder int, appErr *apperror.AppError) {
	name = c.FormValue("name_i18n")
	slug = c.FormValue("slug")
	if v := c.FormValue("parent_id"); v != "" {
		parentID = &v
	}
	if v := c.FormValue("store_category_id"); v != "" {
		storeCategoryID = &v
	}
	if v := c.FormValue("sort_order"); v != "" {
		parsed, err := strconv.Atoi(v)
		if err != nil {
			return "", "", nil, nil, 0, apperror.Validation("sort_order must be a valid integer")
		}
		sortOrder = parsed
	}
	return name, slug, parentID, storeCategoryID, sortOrder, nil
}

// Create handles POST /api/v1/admin/product-categories (super_admin only,
// multipart; icon file optional).
func (h *ProductCategoryHandler) Create(c echo.Context) error {
	name, slug, parentID, storeCategoryID, sortOrder, appErr := parseProductCategoryForm(c)
	if appErr != nil {
		return appErr
	}
	iconData, appErr := readOptionalIcon(c)
	if appErr != nil {
		return appErr
	}

	category, appErr := h.categories.Create(c.Request().Context(), services.CreateProductCategoryInput{
		NameI18n:        []byte(name),
		Slug:            slug,
		ParentID:        parentID,
		StoreCategoryID: storeCategoryID,
		SortOrder:       sortOrder,
		IconData:        iconData,
	})
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusCreated, echo.Map{"data": category})
}

// Update handles PUT /api/v1/admin/product-categories/:id (super_admin
// only, multipart; icon file optional — omitted keeps the existing icon).
func (h *ProductCategoryHandler) Update(c echo.Context) error {
	name, slug, parentID, storeCategoryID, sortOrder, appErr := parseProductCategoryForm(c)
	if appErr != nil {
		return appErr
	}
	iconData, appErr := readOptionalIcon(c)
	if appErr != nil {
		return appErr
	}

	category, appErr := h.categories.Update(c.Request().Context(), c.Param("id"), services.UpdateProductCategoryInput{
		NameI18n:        []byte(name),
		Slug:            slug,
		ParentID:        parentID,
		StoreCategoryID: storeCategoryID,
		SortOrder:       sortOrder,
		IconData:        iconData,
	})
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": category})
}

type setProductCategoryActiveRequest struct {
	Active bool `json:"active"`
}

// SetActive handles PUT /api/v1/admin/product-categories/:id/active
// (super_admin only).
func (h *ProductCategoryHandler) SetActive(c echo.Context) error {
	var req setProductCategoryActiveRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.categories.SetActive(c.Request().Context(), c.Param("id"), req.Active); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// Delete handles DELETE /api/v1/admin/product-categories/:id (super_admin only).
func (h *ProductCategoryHandler) Delete(c echo.Context) error {
	if appErr := h.categories.Delete(c.Request().Context(), c.Param("id")); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}
