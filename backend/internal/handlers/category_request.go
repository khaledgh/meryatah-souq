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

type CategoryRequestHandler struct {
	requests *services.CategoryRequestService
}

func NewCategoryRequestHandler(requests *services.CategoryRequestService) *CategoryRequestHandler {
	return &CategoryRequestHandler{requests: requests}
}

type submitCategoryRequestRequest struct {
	Kind     models.CategoryRequestKind `json:"kind"`
	NameI18n json.RawMessage            `json:"name_i18n"`
	ParentID *string                    `json:"parent_id,omitempty"`
	Notes    string                     `json:"notes"`
}

// Submit handles POST /api/v1/vendor/:id/category-requests (vendor-owner
// only, ownership enforced by route middleware). Vendors can only REQUEST a
// new store/product category — never create one directly.
func (h *CategoryRequestHandler) Submit(c echo.Context) error {
	var req submitCategoryRequestRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	userID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("missing authenticated user")
	}

	request, appErr := h.requests.Submit(c.Request().Context(), services.SubmitCategoryRequestInput{
		RequestedByUserID: userID,
		VendorID:          c.Param("id"),
		Kind:              req.Kind,
		NameI18n:          req.NameI18n,
		ParentID:          req.ParentID,
		Notes:             req.Notes,
	})
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusCreated, echo.Map{"data": request})
}

// ListOwn handles GET /api/v1/vendor/:id/category-requests (vendor-owner
// only) — the vendor's own request history + status.
func (h *CategoryRequestHandler) ListOwn(c echo.Context) error {
	requests, appErr := h.requests.ListForVendor(c.Request().Context(), c.Param("id"))
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": requests})
}

// List handles GET /api/v1/admin/category-requests?status=pending
// (super_admin only). Defaults to pending.
func (h *CategoryRequestHandler) List(c echo.Context) error {
	status := models.CategoryRequestStatus(c.QueryParam("status"))
	if status == "" {
		status = models.CategoryRequestPending
	}
	requests, appErr := h.requests.List(c.Request().Context(), status)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": requests})
}

// Approve handles POST /api/v1/admin/category-requests/:id/approve
// (super_admin only). Creates the requested store/product category.
func (h *CategoryRequestHandler) Approve(c echo.Context) error {
	reviewerID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("missing authenticated user")
	}
	request, appErr := h.requests.Approve(c.Request().Context(), c.Param("id"), reviewerID, c.RealIP())
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": request})
}

type rejectCategoryRequestRequest struct {
	Reason string `json:"reason"`
}

// Reject handles POST /api/v1/admin/category-requests/:id/reject
// (super_admin only, reason required).
func (h *CategoryRequestHandler) Reject(c echo.Context) error {
	var req rejectCategoryRequestRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	reviewerID, ok := appmw.UserID(c)
	if !ok {
		return apperror.Unauthorized("missing authenticated user")
	}
	if appErr := h.requests.Reject(c.Request().Context(), c.Param("id"), req.Reason, reviewerID, c.RealIP()); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}
