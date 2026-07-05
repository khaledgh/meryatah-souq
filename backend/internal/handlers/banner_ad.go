package handlers

import (
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
	"meryata-souq/backend/internal/storage"
)

type BannerAdHandler struct {
	ads *services.BannerAdService
}

func NewBannerAdHandler(ads *services.BannerAdService) *BannerAdHandler {
	return &BannerAdHandler{ads: ads}
}

// ListActive handles GET /api/v1/banner-ads — public (blueprint §11.C5
// carousel).
func (h *BannerAdHandler) ListActive(c echo.Context) error {
	ads, appErr := h.ads.ListActive(c.Request().Context())
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": ads})
}

// List handles GET /api/v1/admin/banner-ads (super_admin only, blueprint
// §11.A8 management list).
func (h *BannerAdHandler) List(c echo.Context) error {
	ads, appErr := h.ads.List(c.Request().Context())
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": ads})
}

// Create handles POST /api/v1/admin/banner-ads (super_admin only,
// multipart upload through the §5.9 pipeline, blueprint §11.A8).
func (h *BannerAdHandler) Create(c echo.Context) error {
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

	var vendorID *string
	if v := c.FormValue("vendor_id"); v != "" {
		vendorID = &v
	}
	var targetURL *string
	if v := c.FormValue("target_url"); v != "" {
		targetURL = &v
	}
	isPaid := false
	if v := c.FormValue("is_paid"); v != "" {
		parsed, err := strconv.ParseBool(v)
		if err != nil {
			return apperror.Validation("is_paid must be a valid boolean")
		}
		isPaid = parsed
	}

	priority := 0
	if v := c.FormValue("priority"); v != "" {
		parsed, err := strconv.Atoi(v)
		if err != nil {
			return apperror.Validation("priority must be a valid integer")
		}
		priority = parsed
	}

	var startsAt, endsAt *time.Time
	if v := c.FormValue("starts_at"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return apperror.Validation("starts_at must be a valid RFC3339 timestamp")
		}
		startsAt = &t
	}
	if v := c.FormValue("ends_at"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return apperror.Validation("ends_at must be a valid RFC3339 timestamp")
		}
		endsAt = &t
	}

	ad, appErr := h.ads.Create(c.Request().Context(), services.CreateBannerAdInput{
		VendorID:  vendorID,
		ImageData: data,
		TargetURL: targetURL,
		IsPaid:    isPaid,
		Priority:  priority,
		StartsAt:  startsAt,
		EndsAt:    endsAt,
	})
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusCreated, echo.Map{"data": ad})
}

type setBannerAdActiveRequest struct {
	Active bool `json:"active"`
}

// SetActive handles PUT /api/v1/admin/banner-ads/:id/active (super_admin
// only).
func (h *BannerAdHandler) SetActive(c echo.Context) error {
	var req setBannerAdActiveRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.ads.SetActive(c.Request().Context(), c.Param("id"), req.Active); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// Delete handles DELETE /api/v1/admin/banner-ads/:id (super_admin only).
func (h *BannerAdHandler) Delete(c echo.Context) error {
	if appErr := h.ads.Delete(c.Request().Context(), c.Param("id")); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}
