package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/labstack/echo/v4"

	appmw "meryata-souq/backend/internal/middleware"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
)

type VendorApplicationHandler struct {
	applications *services.VendorApplicationService
}

func NewVendorApplicationHandler(applications *services.VendorApplicationService) *VendorApplicationHandler {
	return &VendorApplicationHandler{applications: applications}
}

type submitVendorApplicationRequest struct {
	// VerificationToken must come from a just-completed POST
	// /auth/verify-otp call for the applicant's phone (the
	// "register_required" response shape, i.e. a brand-new phone) — proves
	// phone ownership before any application row (let alone an account) is
	// created. See VendorApplicationService.Submit for why.
	VerificationToken string          `json:"verification_token"`
	BusinessNameI18n  json.RawMessage `json:"business_name_i18n"`
	Category          string          `json:"category"`
	ContactFirstName  string          `json:"contact_first_name"`
	ContactLastName   string          `json:"contact_last_name"`
	Address           string          `json:"address"`
	Timezone          string          `json:"timezone"`
	Longitude         float64         `json:"longitude"`
	Latitude          float64         `json:"latitude"`
	Notes             string          `json:"notes"`
}

// Submit handles POST /api/v1/vendor-applications — public onboarding
// intake (blueprint §11.A5). Rate-limited per-IP (see main.go route
// registration) since, unlike other public writes in this codebase, it has
// no OTP-request step of its own to naturally cap volume.
func (h *VendorApplicationHandler) Submit(c echo.Context) error {
	var req submitVendorApplicationRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if req.VerificationToken == "" {
		return apperror.Validation("verification_token is required")
	}

	app, appErr := h.applications.Submit(c.Request().Context(), services.SubmitApplicationInput{
		VerificationToken: req.VerificationToken,
		BusinessNameI18n:  req.BusinessNameI18n,
		Category:          req.Category,
		ContactFirstName:  req.ContactFirstName,
		ContactLastName:   req.ContactLastName,
		Address:           req.Address,
		Timezone:          req.Timezone,
		Longitude:         req.Longitude,
		Latitude:          req.Latitude,
		Notes:             req.Notes,
	})
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusCreated, echo.Map{"data": app})
}

// List handles GET /api/v1/admin/vendor-applications?status=pending
// (super_admin only, blueprint §11.A5 queue). Defaults to pending.
func (h *VendorApplicationHandler) List(c echo.Context) error {
	status := models.VendorApplicationStatus(c.QueryParam("status"))
	if status == "" {
		status = models.VendorApplicationPending
	}

	apps, appErr := h.applications.List(c.Request().Context(), status)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": apps})
}

// Approve handles POST /api/v1/admin/vendor-applications/:id/approve
// (super_admin only). Creates the vendor + owner user.
func (h *VendorApplicationHandler) Approve(c echo.Context) error {
	reviewerID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("missing authenticated user")
	}
	vendor, appErr := h.applications.Approve(c.Request().Context(), c.Param("id"), reviewerID, c.RealIP())
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": vendor})
}

type rejectVendorApplicationRequest struct {
	Reason string `json:"reason"`
}

// Reject handles POST /api/v1/admin/vendor-applications/:id/reject
// (super_admin only, blueprint §11.A5 "reject with reason").
func (h *VendorApplicationHandler) Reject(c echo.Context) error {
	var req rejectVendorApplicationRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	reviewerID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("missing authenticated user")
	}
	if appErr := h.applications.Reject(c.Request().Context(), c.Param("id"), req.Reason, reviewerID, c.RealIP()); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}
