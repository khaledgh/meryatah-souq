package middleware

import (
	"strings"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/pkg/security"
)

const (
	contextKeyUserID = "user_id"
	contextKeyRole   = "role"
)

// RequireAuth validates the Bearer access JWT and populates "user_id" and
// "role" on the Echo context for downstream handlers/RBAC checks
// (blueprint §5.1, §5.3). Deny-by-default: any route using this middleware
// rejects requests with no/invalid/expired token.
func RequireAuth(jwtSecret []byte) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			header := c.Request().Header.Get("Authorization")
			const prefix = "Bearer "
			if !strings.HasPrefix(header, prefix) {
				return apperror.Unauthorized("missing or malformed Authorization header")
			}
			tokenString := strings.TrimPrefix(header, prefix)

			claims, err := security.ParseAccessToken(jwtSecret, tokenString)
			if err != nil {
				return apperror.Unauthorized("invalid or expired access token")
			}

			c.Set(contextKeyUserID, claims.Subject)
			c.Set(contextKeyRole, claims.Role)
			return next(c)
		}
	}
}

// RequireRole restricts a route to specific roles. Must run after
// RequireAuth. Deny-by-default: a role not in the allowlist is rejected
// (blueprint §5.3).
func RequireRole(roles ...string) echo.MiddlewareFunc {
	allowed := make(map[string]struct{}, len(roles))
	for _, r := range roles {
		allowed[r] = struct{}{}
	}
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			role, _ := c.Get(contextKeyRole).(string)
			if _, ok := allowed[role]; !ok {
				return apperror.Forbidden("role not permitted for this action")
			}
			return next(c)
		}
	}
}

// UserID reads the authenticated user's ID from context, set by
// RequireAuth.
func UserID(c echo.Context) (string, bool) {
	v, ok := c.Get(contextKeyUserID).(string)
	return v, ok && v != ""
}

// Role reads the authenticated user's role from context, set by
// RequireAuth.
func Role(c echo.Context) (string, bool) {
	v, ok := c.Get(contextKeyRole).(string)
	return v, ok && v != ""
}
