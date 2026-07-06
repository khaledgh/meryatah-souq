package handlers

import (
	"io"
	"log"
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
		log.Printf("banner_ad: create handler: no multipart \"file\" field received: %v", err)
		return apperror.BadRequest("file is required (multipart field \"file\")")
	}
	log.Printf("banner_ad: create handler: received file %q (%d bytes, header content-type=%q)", fileHeader.Filename, fileHeader.Size, fileHeader.Header.Get("Content-Type"))
	if storage.IsObviouslyDangerousFilename(fileHeader.Filename) {
		log.Printf("banner_ad: create handler: rejected dangerous filename %q", fileHeader.Filename)
		return apperror.Validation("file type not allowed")
	}
	if fileHeader.Size > storage.MaxUploadSizeBytes {
		log.Printf("banner_ad: create handler: file too large (%d > %d)", fileHeader.Size, storage.MaxUploadSizeBytes)
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

	priceUSD, appErr := parseOptionalPriceForm(c.FormValue("price_usd"))
	if appErr != nil {
		return appErr
	}

	priority := 0
	if v := c.FormValue("priority"); v != "" {
		parsed, err := strconv.Atoi(v)
		if err != nil {
			return apperror.Validation("priority must be a valid integer")
		}
		priority = parsed
	}

	startsAt, endsAt, appErr := parseBannerScheduleForm(c)
	if appErr != nil {
		return appErr
	}

	ad, appErr := h.ads.Create(c.Request().Context(), services.CreateBannerAdInput{
		VendorID:  vendorID,
		ImageData: data,
		TargetURL: targetURL,
		IsPaid:    isPaid,
		PriceUSD:  priceUSD,
		Priority:  priority,
		StartsAt:  startsAt,
		EndsAt:    endsAt,
	})
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusCreated, echo.Map{"data": ad})
}

// parseOptionalPriceForm parses an optional non-negative monetary form value.
func parseOptionalPriceForm(v string) (*float64, *apperror.AppError) {
	if v == "" {
		return nil, nil
	}
	parsed, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return nil, apperror.Validation("price_usd must be a valid number")
	}
	if parsed < 0 {
		return nil, apperror.Validation("price_usd must not be negative")
	}
	return &parsed, nil
}

// parseBannerScheduleForm parses the optional starts_at/ends_at RFC3339
// window and enforces start <= end when both are present.
func parseBannerScheduleForm(c echo.Context) (*time.Time, *time.Time, *apperror.AppError) {
	var startsAt, endsAt *time.Time
	if v := c.FormValue("starts_at"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return nil, nil, apperror.Validation("starts_at must be a valid RFC3339 timestamp")
		}
		startsAt = &t
	}
	if v := c.FormValue("ends_at"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return nil, nil, apperror.Validation("ends_at must be a valid RFC3339 timestamp")
		}
		endsAt = &t
	}
	if startsAt != nil && endsAt != nil && endsAt.Before(*startsAt) {
		return nil, nil, apperror.Validation("ends_at must not be before starts_at")
	}
	return startsAt, endsAt, nil
}

// Update handles PUT /api/v1/admin/banner-ads/:id (super_admin only,
// blueprint §11.A8 editor). Accepts multipart form; the image file is
// optional — when omitted, the stored image is kept.
func (h *BannerAdHandler) Update(c echo.Context) error {
	var imageData []byte
	if fileHeader, err := c.FormFile("file"); err == nil {
		if storage.IsObviouslyDangerousFilename(fileHeader.Filename) {
			return apperror.Validation("file type not allowed")
		}
		if fileHeader.Size > storage.MaxUploadSizeBytes {
			return apperror.Validation("file exceeds maximum upload size")
		}
		src, openErr := fileHeader.Open()
		if openErr != nil {
			return apperror.Internal(openErr)
		}
		defer src.Close()
		data, readErr := io.ReadAll(io.LimitReader(src, storage.MaxUploadSizeBytes+1))
		if readErr != nil {
			return apperror.Internal(readErr)
		}
		imageData = data
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

	priceUSD, appErr := parseOptionalPriceForm(c.FormValue("price_usd"))
	if appErr != nil {
		return appErr
	}

	priority := 0
	if v := c.FormValue("priority"); v != "" {
		parsed, err := strconv.Atoi(v)
		if err != nil {
			return apperror.Validation("priority must be a valid integer")
		}
		priority = parsed
	}

	startsAt, endsAt, appErr := parseBannerScheduleForm(c)
	if appErr != nil {
		return appErr
	}

	ad, appErr := h.ads.Update(c.Request().Context(), c.Param("id"), services.UpdateBannerAdInput{
		VendorID:  vendorID,
		ImageData: imageData,
		TargetURL: targetURL,
		IsPaid:    isPaid,
		PriceUSD:  priceUSD,
		Priority:  priority,
		StartsAt:  startsAt,
		EndsAt:    endsAt,
	})
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": ad})
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
