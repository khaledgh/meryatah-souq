package middleware

import (
	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
)

// RequireVendorOwnership enforces blueprint §5.3's tenant-isolation rule
// for vendor-scoped routes: a vendor-role caller may only act on the
// vendor_id they own; super_admin may act on any vendor. Must run after
// RequireAuth. idParam names the path parameter holding the vendor ID
// (":id" or ":vendorId" depending on the route).
func RequireVendorOwnership(vendors *services.VendorService, idParam string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			userID, ok := UserID(c)
			if !ok {
				return apperror.Unauthorized("authentication required")
			}
			role, _ := Role(c)

			vendorID := c.Param(idParam)
			if vendorID == "" {
				return apperror.BadRequest("vendor id is required")
			}

			if appErr := vendors.AssertOwnership(c.Request().Context(), vendorID, userID, role); appErr != nil {
				return appErr
			}
			return next(c)
		}
	}
}
