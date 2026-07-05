// Package middleware holds cross-cutting Echo middleware: error mapping,
// security headers, and (in later phases) auth, RBAC, tenant resolution,
// locale resolution, and rate limiting.
package middleware

import (
	"errors"
	"log"
	"net/http"

	"github.com/labstack/echo/v4"

	"meryata-souq/backend/internal/pkg/apperror"
)

// ErrorHandler replaces Echo's default HTTPErrorHandler so every non-2xx
// response — whether from an *apperror.AppError returned by a handler, an
// Echo framework error, or a recovered panic — is rendered in the
// standardized error contract (blueprint §4.2). No raw error ever reaches
// the client.
func ErrorHandler(err error, c echo.Context) {
	if c.Response().Committed {
		return
	}

	appErr := toAppError(err)

	// Never log secrets/PII (§5.10); log only developer-facing detail.
	log.Printf("request error: method=%s path=%s code=%s status=%d detail=%s",
		c.Request().Method, c.Request().URL.Path, appErr.Code, appErr.Status, appErr.DeveloperMessage)

	if respErr := c.JSON(appErr.Status, appErr.Response()); respErr != nil {
		log.Printf("failed to write error response: %v", respErr)
	}
}

func toAppError(err error) *apperror.AppError {
	var appErr *apperror.AppError
	if errors.As(err, &appErr) {
		return appErr
	}

	var httpErr *echo.HTTPError
	if errors.As(err, &httpErr) {
		return apperror.New(
			httpStatusCode(httpErr.Code),
			httpErr.Code,
			echoMessage(httpErr),
			"The request could not be processed.",
		)
	}

	return apperror.Internal(err)
}

// httpStatusCode maps an Echo HTTPError status to a stable machine-readable
// code when the error didn't originate as an *apperror.AppError.
func httpStatusCode(status int) string {
	switch status {
	case http.StatusNotFound:
		return "NOT_FOUND"
	case http.StatusUnauthorized:
		return "UNAUTHORIZED"
	case http.StatusForbidden:
		return "FORBIDDEN"
	case http.StatusMethodNotAllowed:
		return "METHOD_NOT_ALLOWED"
	case http.StatusTooManyRequests:
		return "RATE_LIMITED"
	default:
		return "BAD_REQUEST"
	}
}

func echoMessage(httpErr *echo.HTTPError) string {
	if msg, ok := httpErr.Message.(string); ok {
		return msg
	}
	return http.StatusText(httpErr.Code)
}
