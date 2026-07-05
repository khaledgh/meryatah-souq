package middleware

import (
	"strings"

	"github.com/labstack/echo/v4"
)

// SecurityHeaders applies the response headers required by blueprint §5.4:
// HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and
// Permissions-Policy. Applied globally so every response — success or error
// — carries them.
func SecurityHeaders() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			h := c.Response().Header()

			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("X-Frame-Options", "DENY")
			h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
			h.Set("Permissions-Policy", "geolocation=(self), camera=(), microphone=()")
			// This is a JSON API — no inline scripts/styles are ever served,
			// so a strict default-src 'none' is safe and tightest.
			h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")

			if isRequestSecure(c) {
				h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
			}

			return next(c)
		}
	}
}

// isRequestSecure reports whether the original client request was HTTPS.
// TLS is typically terminated at a reverse proxy/load balancer in front of
// this service, so c.Request().TLS is nil even for HTTPS traffic — the
// proxy signals the original scheme via X-Forwarded-Proto instead.
func isRequestSecure(c echo.Context) bool {
	if c.Request().TLS != nil {
		return true
	}
	return strings.EqualFold(c.Request().Header.Get("X-Forwarded-Proto"), "https")
}
