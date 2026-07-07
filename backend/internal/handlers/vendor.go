package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	appmw "meryata-souq/backend/internal/middleware"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
)

type VendorHandler struct {
	vendors *services.VendorService
}

func NewVendorHandler(vendors *services.VendorService) *VendorHandler {
	return &VendorHandler{vendors: vendors}
}

type createVendorRequest struct {
	OwnerUserID     string          `json:"owner_user_id"`
	NameI18n        json.RawMessage `json:"name_i18n"`
	Category        string          `json:"category"`
	StoreCategoryID *string         `json:"store_category_id,omitempty"`
	Longitude       float64         `json:"longitude"`
	Latitude        float64         `json:"latitude"`
	Address         string          `json:"address"`
	Timezone        string          `json:"timezone"`
}

// Create handles POST /api/v1/admin/vendors (super_admin only, blueprint
// §11.A5 onboarding).
func (h *VendorHandler) Create(c echo.Context) error {
	var req createVendorRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if req.OwnerUserID == "" {
		return apperror.Validation("owner_user_id is required")
	}

	vendor, appErr := h.vendors.Create(c.Request().Context(), services.CreateVendorInput{
		OwnerUserID:     req.OwnerUserID,
		NameI18n:        req.NameI18n,
		Category:        req.Category,
		StoreCategoryID: req.StoreCategoryID,
		Longitude:       req.Longitude,
		Latitude:        req.Latitude,
		Address:         req.Address,
		Timezone:        req.Timezone,
	})
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusCreated, echo.Map{"data": vendor})
}

// Get handles GET /api/v1/vendors/:id — public read (a store page any user
// can view, blueprint §11.C6).
func (h *VendorHandler) Get(c echo.Context) error {
	vendor, appErr := h.vendors.GetByID(c.Request().Context(), c.Param("id"))
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": vendor})
}

// Me handles GET /api/v1/vendor/me — returns the vendor owned by the
// authenticated caller (blueprint §11.B: the vendor dashboard resolves
// "which vendor am I?" from the session, since a vendor owner only knows
// their user id, not their vendor id). Scoped to the caller: no id is taken
// from the request, so there's nothing to spoof.
func (h *VendorHandler) Me(c echo.Context) error {
	userID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("missing authenticated user")
	}
	vendor, appErr := h.vendors.GetByOwner(c.Request().Context(), userID)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": vendor})
}

// Nearby handles GET /api/v1/vendors/nearby?lon=&lat=&radius_m=&limit=
// (blueprint §11.C5 home screen nearby lookup, PostGIS-backed).
func (h *VendorHandler) Nearby(c echo.Context) error {
	lon, err := parseFloatQuery(c, "lon")
	if err != nil {
		return apperror.Validation("lon is required and must be numeric")
	}
	lat, err := parseFloatQuery(c, "lat")
	if err != nil {
		return apperror.Validation("lat is required and must be numeric")
	}
	radius, _ := parseFloatQuery(c, "radius_m")
	limit, _ := parseIntQuery(c, "limit")

	var storeCategoryID *string
	if v := c.QueryParam("store_category_id"); v != "" {
		storeCategoryID = &v
	}

	vendors, appErr := h.vendors.Nearby(c.Request().Context(), lon, lat, radius, limit, storeCategoryID)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": vendors})
}

type updateVendorRequest struct {
	NameI18n        *json.RawMessage `json:"name_i18n,omitempty"`
	Category        *string          `json:"category,omitempty"`
	StoreCategoryID *string          `json:"store_category_id,omitempty"`
	Address         *string          `json:"address,omitempty"`
	LogoURL         *string          `json:"logo_url,omitempty"`
	Timezone        *string          `json:"timezone,omitempty"`
	Longitude       *float64         `json:"longitude,omitempty"`
	Latitude        *float64         `json:"latitude,omitempty"`
	DisplayCurrency *string          `json:"display_currency,omitempty"`
}

// Update handles PATCH /api/v1/vendor/profile — the calling vendor's own
// profile (blueprint §11.B3). Ownership is enforced by middleware
// (RequireVendorOwnership) registered on this route in main.go.
func (h *VendorHandler) Update(c echo.Context) error {
	vendorID := c.Param("id")
	var req updateVendorRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}

	vendor, appErr := h.vendors.Update(c.Request().Context(), vendorID, services.UpdateVendorInput{
		NameI18n:        req.NameI18n,
		Category:        req.Category,
		StoreCategoryID: req.StoreCategoryID,
		Address:         req.Address,
		LogoURL:         req.LogoURL,
		Timezone:        req.Timezone,
		Longitude:       req.Longitude,
		Latitude:        req.Latitude,
		DisplayCurrency: req.DisplayCurrency,
	})
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": vendor})
}

type setCommissionRequest struct {
	CommissionPct *float64 `json:"commission_pct"`
}

// SetCommission handles PUT /api/v1/admin/vendors/:id/commission
// (super_admin only, blueprint §11.A4).
func (h *VendorHandler) SetCommission(c echo.Context) error {
	var req setCommissionRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.vendors.SetCommission(c.Request().Context(), c.Param("id"), req.CommissionPct); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

type grantSchedulingRequest struct {
	Allowed bool `json:"allowed"`
}

// GrantScheduling handles PUT /api/v1/admin/vendors/:id/scheduling-allowed
// (super_admin only, blueprint §8, §11.A4).
func (h *VendorHandler) GrantScheduling(c echo.Context) error {
	var req grantSchedulingRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.vendors.GrantScheduling(c.Request().Context(), c.Param("id"), req.Allowed); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

type setActiveRequest struct {
	Active bool `json:"active"`
}

// SetActive handles PUT /api/v1/admin/vendors/:id/active (super_admin
// only, blueprint §11.A3).
func (h *VendorHandler) SetActive(c echo.Context) error {
	var req setActiveRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.vendors.SetActive(c.Request().Context(), c.Param("id"), req.Active); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

type setSchedulingEnabledRequest struct {
	Enabled bool `json:"enabled"`
}

// SetSchedulingEnabled handles PUT /api/v1/vendor/:id/scheduling-enabled
// (vendor-owner only, blueprint §11.B5).
func (h *VendorHandler) SetSchedulingEnabled(c echo.Context) error {
	var req setSchedulingEnabledRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.vendors.SetSchedulingEnabled(c.Request().Context(), c.Param("id"), req.Enabled); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

func parseFloatQuery(c echo.Context, key string) (float64, error) {
	raw := c.QueryParam(key)
	if raw == "" {
		return 0, strconv.ErrSyntax
	}
	return strconv.ParseFloat(raw, 64)
}

func parseIntQuery(c echo.Context, key string) (int, error) {
	raw := c.QueryParam(key)
	if raw == "" {
		return 0, strconv.ErrSyntax
	}
	return strconv.Atoi(raw)
}
