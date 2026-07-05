package handlers

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
)

type CouponHandler struct {
	coupons *services.CouponService
}

func NewCouponHandler(coupons *services.CouponService) *CouponHandler {
	return &CouponHandler{coupons: coupons}
}

type createCouponRequest struct {
	VendorID       *string    `json:"vendor_id,omitempty"`
	Code           string     `json:"code"`
	DiscountType   string     `json:"discount_type"`
	DiscountVal    float64    `json:"discount_val"`
	MaxRedemptions *int       `json:"max_redemptions,omitempty"`
	StartsAt       *time.Time `json:"starts_at,omitempty"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty"`
}

// Create handles POST /api/v1/admin/coupons (super_admin, global coupons,
// blueprint §11.A9) and POST /api/v1/vendor/:id/coupons (vendor-owner,
// vendor-scoped coupons, blueprint §11.B10) — the vendor route sets
// VendorID from the URL param, ignoring any client-supplied value.
func (h *CouponHandler) Create(c echo.Context) error {
	var req createCouponRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if vendorID := c.Param("id"); vendorID != "" {
		req.VendorID = &vendorID
	}

	coupon, appErr := h.coupons.Create(c.Request().Context(), services.CreateCouponInput{
		VendorID:       req.VendorID,
		Code:           req.Code,
		DiscountType:   req.DiscountType,
		DiscountVal:    req.DiscountVal,
		MaxRedemptions: req.MaxRedemptions,
		StartsAt:       req.StartsAt,
		ExpiresAt:      req.ExpiresAt,
	})
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusCreated, echo.Map{"data": coupon})
}

type updateCouponRequest struct {
	Code           string     `json:"code"`
	DiscountType   string     `json:"discount_type"`
	DiscountVal    float64    `json:"discount_val"`
	MaxRedemptions *int       `json:"max_redemptions,omitempty"`
	StartsAt       *time.Time `json:"starts_at,omitempty"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty"`
}

// UpdateGlobal handles PUT /api/v1/admin/coupons/:couponId (super_admin, any
// coupon, blueprint §11.A9 editor).
func (h *CouponHandler) UpdateGlobal(c echo.Context) error {
	var req updateCouponRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	coupon, appErr := h.coupons.Update(c.Request().Context(), "", c.Param("couponId"), services.UpdateCouponInput{
		Code:           req.Code,
		DiscountType:   req.DiscountType,
		DiscountVal:    req.DiscountVal,
		MaxRedemptions: req.MaxRedemptions,
		StartsAt:       req.StartsAt,
		ExpiresAt:      req.ExpiresAt,
	})
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": coupon})
}

// DeleteGlobal handles DELETE /api/v1/admin/coupons/:couponId (super_admin).
func (h *CouponHandler) DeleteGlobal(c echo.Context) error {
	if appErr := h.coupons.Delete(c.Request().Context(), "", c.Param("couponId")); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// ListGlobal handles GET /api/v1/admin/coupons (super_admin, all coupons).
func (h *CouponHandler) ListGlobal(c echo.Context) error {
	coupons, appErr := h.coupons.List(c.Request().Context(), "")
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": coupons})
}

// ListForVendor handles GET /api/v1/vendor/:id/coupons (vendor-owner,
// vendor-scoped list).
func (h *CouponHandler) ListForVendor(c echo.Context) error {
	coupons, appErr := h.coupons.List(c.Request().Context(), c.Param("id"))
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": coupons})
}

type setCouponActiveRequest struct {
	Active bool `json:"active"`
}

// SetActiveGlobal handles PUT /api/v1/admin/coupons/:couponId/active
// (super_admin, any coupon).
func (h *CouponHandler) SetActiveGlobal(c echo.Context) error {
	var req setCouponActiveRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.coupons.SetActive(c.Request().Context(), "", c.Param("couponId"), req.Active); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// SetActiveForVendor handles PUT /api/v1/vendor/:id/coupons/:couponId/active
// (vendor-owner, own coupons only).
func (h *CouponHandler) SetActiveForVendor(c echo.Context) error {
	var req setCouponActiveRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.coupons.SetActive(c.Request().Context(), c.Param("id"), c.Param("couponId"), req.Active); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}
