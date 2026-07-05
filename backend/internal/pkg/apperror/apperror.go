// Package apperror defines the standardized application error type and the
// JSON error contract described in docs/BLUEPRINT.md §4.2. Every non-2xx API
// response is shaped from an *AppError.
package apperror

import "net/http"

// AppError is the single error type services/handlers return up the stack.
// MessageKey is resolved against ui_translations (§6.1) to localize
// UserMessage once the i18n service exists (Phase 2+); until then
// UserMessage is used verbatim.
type AppError struct {
	Code             string `json:"code"`
	Status           int    `json:"status"`
	DeveloperMessage string `json:"developer_message"`
	UserMessage      string `json:"user_message"`
	MessageKey       string `json:"-"`

	// cause is the wrapped underlying error, if any. Never serialized —
	// it may contain details not safe to expose to clients.
	cause error
}

func (e *AppError) Error() string {
	if e.DeveloperMessage != "" {
		return e.DeveloperMessage
	}
	return e.Code
}

func (e *AppError) Unwrap() error {
	return e.cause
}

// WithCause attaches an underlying error for logging, without changing the
// serialized response.
func (e *AppError) WithCause(err error) *AppError {
	clone := *e
	clone.cause = err
	return &clone
}

// New builds an AppError with an explicit HTTP status.
func New(code string, status int, developerMessage, userMessage string) *AppError {
	return &AppError{
		Code:             code,
		Status:           status,
		DeveloperMessage: developerMessage,
		UserMessage:      userMessage,
	}
}

// NewWithKey builds an AppError whose UserMessage will be resolved from
// ui_translations via MessageKey once the i18n service is wired (Phase 2+).
func NewWithKey(code string, status int, developerMessage, messageKey, fallbackUserMessage string) *AppError {
	return &AppError{
		Code:             code,
		Status:           status,
		DeveloperMessage: developerMessage,
		UserMessage:      fallbackUserMessage,
		MessageKey:       messageKey,
	}
}

// Response is the top-level JSON envelope for error responses (§4.2):
//
//	{ "error": { "code":"OTP_INVALID","status":400, ... } }
type Response struct {
	Error *AppError `json:"error"`
}

func (e *AppError) Response() Response {
	return Response{Error: e}
}

// Common, reusable constructors for errors expected in every phase.

func Internal(cause error) *AppError {
	return New(
		"INTERNAL_ERROR",
		http.StatusInternalServerError,
		"internal server error",
		"Something went wrong. Please try again.",
	).WithCause(cause)
}

func NotFound(entity string) *AppError {
	return New(
		"NOT_FOUND",
		http.StatusNotFound,
		entity+" not found",
		"The requested resource was not found.",
	)
}

func Unauthorized(developerMessage string) *AppError {
	return New(
		"UNAUTHORIZED",
		http.StatusUnauthorized,
		developerMessage,
		"You are not authorized to perform this action.",
	)
}

func Forbidden(developerMessage string) *AppError {
	return New(
		"FORBIDDEN",
		http.StatusForbidden,
		developerMessage,
		"You do not have permission to perform this action.",
	)
}

func BadRequest(developerMessage string) *AppError {
	return New(
		"BAD_REQUEST",
		http.StatusBadRequest,
		developerMessage,
		"The request could not be processed.",
	)
}

func Validation(developerMessage string) *AppError {
	return New(
		"VALIDATION_ERROR",
		http.StatusUnprocessableEntity,
		developerMessage,
		"Please check your input and try again.",
	)
}

func TooManyRequests(developerMessage string) *AppError {
	return New(
		"RATE_LIMITED",
		http.StatusTooManyRequests,
		developerMessage,
		"Too many requests. Please try again later.",
	)
}

// As extracts an *AppError from err, or wraps it as an internal error if it
// is not already one. Handlers/middleware use this so no raw error ever
// reaches a client response unshaped.
func As(err error) *AppError {
	if err == nil {
		return nil
	}
	if ae, ok := err.(*AppError); ok {
		return ae
	}
	return Internal(err)
}
