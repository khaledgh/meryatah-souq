package handlers

import (
	"net/http"

	"github.com/labstack/echo/v4"

	appmw "meryata-souq/backend/internal/middleware"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/services"
)

type AdminUserHandler struct {
	users *services.AdminUserService
	audit *services.AuditService
}

func NewAdminUserHandler(users *services.AdminUserService, audit *services.AuditService) *AdminUserHandler {
	return &AdminUserHandler{users: users, audit: audit}
}

// ListUsers handles GET /api/v1/admin/users (blueprint §11.A7).
func (h *AdminUserHandler) ListUsers(c echo.Context) error {
	users, appErr := h.users.ListByRole(c.Request().Context(), models.RoleUser)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": users})
}

// ListDrivers handles GET /api/v1/admin/drivers (blueprint §11.A6).
func (h *AdminUserHandler) ListDrivers(c echo.Context) error {
	drivers, appErr := h.users.ListByRole(c.Request().Context(), models.RoleDriver)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": drivers})
}

type createDriverRequest struct {
	Phone     string `json:"phone"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

// CreateDriver handles POST /api/v1/admin/drivers (super_admin only,
// blueprint §11.A6: "create/verify/activate driver"). Provisions a new
// driver account and audits it, since it creates an auth-bearing account.
func (h *AdminUserHandler) CreateDriver(c echo.Context) error {
	var req createDriverRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}

	driver, appErr := h.users.CreateDriver(c.Request().Context(), services.CreateDriverInput{
		Phone:     req.Phone,
		FirstName: req.FirstName,
		LastName:  req.LastName,
	})
	if appErr != nil {
		return appErr
	}

	if actorID, ok := appmw.UserID(c); ok {
		actorRole := models.RoleSuperAdmin
		h.audit.Log(c.Request().Context(), &actorID, &actorRole, "driver.create", "users", &driver.ID, c.RealIP(), nil)
	}

	return c.JSON(http.StatusCreated, echo.Map{"data": driver})
}

type setUserActiveRequest struct {
	Active bool `json:"active"`
}

// SetActive handles PUT /api/v1/admin/users/:userId/active (blueprint
// §11.A6/A7: activate/deactivate).
func (h *AdminUserHandler) SetActive(c echo.Context) error {
	var req setUserActiveRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if appErr := h.users.SetActive(c.Request().Context(), c.Param("userId"), req.Active); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

// ResetLockout handles POST /api/v1/admin/users/:userId/reset-lockout
// (blueprint §11.A7: "reset lockout").
func (h *AdminUserHandler) ResetLockout(c echo.Context) error {
	if appErr := h.users.ResetLockout(c.Request().Context(), c.Param("userId")); appErr != nil {
		return appErr
	}
	return c.NoContent(http.StatusNoContent)
}

type createUserRequest struct {
	Phone     string          `json:"phone"`
	FirstName string          `json:"first_name"`
	LastName  string          `json:"last_name"`
	Role      models.UserRole `json:"role"`
}

// CreateUser handles POST /api/v1/admin/users (super_admin only).
// Provisions a new user account with specified role (user, vendor, driver) and records an audit log.
func (h *AdminUserHandler) CreateUser(c echo.Context) error {
	var req createUserRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}

	user, appErr := h.users.CreateUser(c.Request().Context(), services.CreateUserInput{
		Phone:     req.Phone,
		FirstName: req.FirstName,
		LastName:  req.LastName,
		Role:      req.Role,
	})
	if appErr != nil {
		return appErr
	}

	if actorID, ok := appmw.UserID(c); ok {
		actorRole := models.RoleSuperAdmin
		h.audit.Log(c.Request().Context(), &actorID, &actorRole, "user.create", "users", &user.ID, c.RealIP(), nil)
	}

	return c.JSON(http.StatusCreated, echo.Map{"data": user})
}

type setUserPasswordRequest struct {
	Password string `json:"password"`
}

// SetPassword handles PUT /api/v1/admin/users/:userId/password (super_admin
// only). Sets/resets a user's password — used to give vendor accounts a
// password for password-based login (blueprint §11.A10). The password is
// never logged; the action is audited.
func (h *AdminUserHandler) SetPassword(c echo.Context) error {
	var req setUserPasswordRequest
	if err := c.Bind(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}

	userID := c.Param("userId")
	role, appErr := h.users.SetPassword(c.Request().Context(), userID, req.Password)
	if appErr != nil {
		return appErr
	}

	if actorID, ok := appmw.UserID(c); ok {
		actorRole := models.RoleSuperAdmin
		// Record the target user's role in the audit metadata (never the password).
		h.audit.Log(c.Request().Context(), &actorID, &actorRole, "user.set_password", "users", &userID,
			c.RealIP(), map[string]any{"target_role": string(role)})
	}

	return c.NoContent(http.StatusNoContent)
}

// ListVendorUsers handles GET /api/v1/admin/vendor-owners (super_admin only).
// Lists all users who have the "vendor" role.
func (h *AdminUserHandler) ListVendorUsers(c echo.Context) error {
	users, appErr := h.users.ListByRole(c.Request().Context(), models.RoleVendor)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": users})
}

// GetDriverDetail handles GET /api/v1/admin/drivers/:driverId/details (super_admin only).
func (h *AdminUserHandler) GetDriverDetail(c echo.Context) error {
	driverID := c.Param("driverId")
	detail, appErr := h.users.GetDriverDetail(c.Request().Context(), driverID)
	if appErr != nil {
		return appErr
	}
	return c.JSON(http.StatusOK, echo.Map{"data": detail})
}

