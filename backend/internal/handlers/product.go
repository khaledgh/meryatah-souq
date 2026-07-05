package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
	"meryata-souq/backend/internal/storage"
)

type ProductHandler struct {
	products *services.ProductService
	images   *services.ProductImageService
}

func NewProductHandler(products *services.ProductService, images *services.ProductImageService) *ProductHandler {
	return &ProductHandler{products: products, images: images}
}

// List handles GET /api/v1/vendors/:id/products — public (product grid on
// the store page, blueprint §11.C6).
func (h *ProductHandler) List(c echo.Context) error {
	rows, appErr := h.products.List(c.Request().Context(), c.Param("id"))
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": rows})
}

// Get handles GET /api/v1/products/:productId — public (product detail
// page, blueprint §11.C7).
func (h *ProductHandler) Get(c echo.Context) error {
	product, appErr := h.products.GetByID(c.Request().Context(), c.Param("productId"))
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": product})
}

type createProductRequest struct {
	CategoryID      *string         `json:"category_id,omitempty"`
	NameI18n        json.RawMessage `json:"name_i18n"`
	DescriptionI18n json.RawMessage `json:"description_i18n"`
	PriceUSD        float64         `json:"price_usd"`
	Stock           int             `json:"stock"`
}

// Create handles POST /api/v1/vendor/:id/products (vendor-owner only,
// blueprint §11.B8).
func (h *ProductHandler) Create(c echo.Context) error {
	var req createProductRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if len(req.NameI18n) == 0 {
		return apperror.Validation("name_i18n is required")
	}

	product, appErr := h.products.Create(c.Request().Context(), services.CreateProductInput{
		VendorID:        c.Param("id"),
		CategoryID:      req.CategoryID,
		NameI18n:        req.NameI18n,
		DescriptionI18n: req.DescriptionI18n,
		PriceUSD:        req.PriceUSD,
		Stock:           req.Stock,
	})
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusCreated, echo.Map{"data": product})
}

type updateProductRequest struct {
	CategoryID      *string          `json:"category_id,omitempty"`
	NameI18n        *json.RawMessage `json:"name_i18n,omitempty"`
	DescriptionI18n *json.RawMessage `json:"description_i18n,omitempty"`
	PriceUSD        *float64         `json:"price_usd,omitempty"`
	Stock           *int             `json:"stock,omitempty"`
	IsActive        *bool            `json:"is_active,omitempty"`
}

// Update handles PATCH /api/v1/vendor/:id/products/:productId
// (vendor-owner only).
func (h *ProductHandler) Update(c echo.Context) error {
	var req updateProductRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	appErr := h.products.Update(c.Request().Context(), c.Param("id"), c.Param("productId"), services.UpdateProductInput{
		CategoryID:      req.CategoryID,
		NameI18n:        req.NameI18n,
		DescriptionI18n: req.DescriptionI18n,
		PriceUSD:        req.PriceUSD,
		Stock:           req.Stock,
		IsActive:        req.IsActive,
	})
	if appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// Delete handles DELETE /api/v1/vendor/:id/products/:productId
// (vendor-owner only).
func (h *ProductHandler) Delete(c echo.Context) error {
	if appErr := h.products.Delete(c.Request().Context(), c.Param("id"), c.Param("productId")); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// AddImage handles POST /api/v1/vendor/:id/products/:productId/images
// (vendor-owner only, multipart upload through the §5.9 pipeline,
// blueprint §11.B8).
func (h *ProductHandler) AddImage(c echo.Context) error {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		return apperror.BadRequest("file is required (multipart field \"file\")")
	}
	if storage.IsObviouslyDangerousFilename(fileHeader.Filename) {
		return apperror.Validation("file type not allowed")
	}
	if fileHeader.Size > storage.MaxUploadSizeBytes {
		return apperror.Validation("file exceeds maximum upload size")
	}

	src, err := fileHeader.Open()
	if err != nil {
		return apperror.Internal(err)
	}
	defer src.Close()

	data, err := io.ReadAll(io.LimitReader(src, storage.MaxUploadSizeBytes+1))
	if err != nil {
		return apperror.Internal(err)
	}

	sortOrder := 0
	if v := c.FormValue("sort_order"); v != "" {
		if parsed, parseErr := strconv.Atoi(v); parseErr == nil {
			sortOrder = parsed
		}
	}

	img, appErr := h.images.AddImage(c.Request().Context(), c.Param("id"), c.Param("productId"), data, sortOrder)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusCreated, echo.Map{"data": img})
}

// RemoveImage handles DELETE /api/v1/vendor/:id/products/:productId/images/:imageId
// (vendor-owner only).
func (h *ProductHandler) RemoveImage(c echo.Context) error {
	if appErr := h.images.RemoveImage(c.Request().Context(), c.Param("id"), c.Param("productId"), c.Param("imageId")); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

type reorderImagesRequest struct {
	ImageIDs []string `json:"image_ids"`
}

// ReorderImages handles PUT /api/v1/vendor/:id/products/:productId/images/order
// (vendor-owner only).
func (h *ProductHandler) ReorderImages(c echo.Context) error {
	var req reorderImagesRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.images.Reorder(c.Request().Context(), c.Param("id"), c.Param("productId"), req.ImageIDs); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}
