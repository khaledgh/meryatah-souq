package handlers

import (
	"io"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
	"meryata-souq/backend/internal/storage"
)

type StoreCategoryHandler struct {
	categories *services.StoreCategoryService
}

func NewStoreCategoryHandler(categories *services.StoreCategoryService) *StoreCategoryHandler {
	return &StoreCategoryHandler{categories: categories}
}

// ListActive handles GET /api/v1/store-categories — public (mobile home
// screen section tiles).
func (h *StoreCategoryHandler) ListActive(c echo.Context) error {
	categories, appErr := h.categories.ListActive(c.Request().Context())
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": categories})
}

// List handles GET /api/v1/admin/store-categories (super_admin only).
func (h *StoreCategoryHandler) List(c echo.Context) error {
	categories, appErr := h.categories.List(c.Request().Context())
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": categories})
}

// readOptionalIcon reads the optional multipart "file" field, validating
// it the same way banner ads do. Returns (nil, nil) when no file is present.
func readOptionalIcon(c echo.Context) ([]byte, *apperror.AppError) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		return nil, nil
	}
	if storage.IsObviouslyDangerousFilename(fileHeader.Filename) {
		return nil, apperror.Validation("file type not allowed")
	}
	if fileHeader.Size > storage.MaxUploadSizeBytes {
		return nil, apperror.Validation("file exceeds maximum upload size")
	}
	src, openErr := fileHeader.Open()
	if openErr != nil {
		return nil, apperror.Internal(openErr)
	}
	defer src.Close()
	data, readErr := io.ReadAll(io.LimitReader(src, storage.MaxUploadSizeBytes+1))
	if readErr != nil {
		return nil, apperror.Internal(readErr)
	}
	return data, nil
}

// parseStoreCategoryForm reads the shared multipart fields for create/update.
func parseStoreCategoryForm(c echo.Context) (name string, slug string, templateKind string, accentColor *string, sortOrder int, appErr *apperror.AppError) {
	name = c.FormValue("name_i18n")
	slug = c.FormValue("slug")
	templateKind = c.FormValue("template_kind")
	if v := c.FormValue("accent_color"); v != "" {
		accentColor = &v
	}
	if v := c.FormValue("sort_order"); v != "" {
		parsed, err := strconv.Atoi(v)
		if err != nil {
			return "", "", "", nil, 0, apperror.Validation("sort_order must be a valid integer")
		}
		sortOrder = parsed
	}
	return name, slug, templateKind, accentColor, sortOrder, nil
}

// Create handles POST /api/v1/admin/store-categories (super_admin only,
// multipart; icon file optional).
func (h *StoreCategoryHandler) Create(c echo.Context) error {
	name, slug, templateKind, accentColor, sortOrder, appErr := parseStoreCategoryForm(c)
	if appErr != nil {
		return appErr
	}
	iconData, appErr := readOptionalIcon(c)
	if appErr != nil {
		return appErr
	}

	category, appErr := h.categories.Create(c.Request().Context(), services.CreateStoreCategoryInput{
		NameI18n:     []byte(name),
		Slug:         slug,
		TemplateKind: templateKind,
		AccentColor:  accentColor,
		SortOrder:    sortOrder,
		IconData:     iconData,
	})
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusCreated, echo.Map{"data": category})
}

// Update handles PUT /api/v1/admin/store-categories/:id (super_admin only,
// multipart; icon file optional — omitted keeps the existing icon).
func (h *StoreCategoryHandler) Update(c echo.Context) error {
	name, slug, templateKind, accentColor, sortOrder, appErr := parseStoreCategoryForm(c)
	if appErr != nil {
		return appErr
	}
	iconData, appErr := readOptionalIcon(c)
	if appErr != nil {
		return appErr
	}

	category, appErr := h.categories.Update(c.Request().Context(), c.Param("id"), services.UpdateStoreCategoryInput{
		NameI18n:     []byte(name),
		Slug:         slug,
		TemplateKind: templateKind,
		AccentColor:  accentColor,
		SortOrder:    sortOrder,
		IconData:     iconData,
	})
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": category})
}

type setStoreCategoryActiveRequest struct {
	Active bool `json:"active"`
}

// SetActive handles PUT /api/v1/admin/store-categories/:id/active
// (super_admin only).
func (h *StoreCategoryHandler) SetActive(c echo.Context) error {
	var req setStoreCategoryActiveRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.categories.SetActive(c.Request().Context(), c.Param("id"), req.Active); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// Delete handles DELETE /api/v1/admin/store-categories/:id (super_admin only).
func (h *StoreCategoryHandler) Delete(c echo.Context) error {
	if appErr := h.categories.Delete(c.Request().Context(), c.Param("id")); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}
