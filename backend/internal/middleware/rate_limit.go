package middleware

import (
	"context"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"

	"meryata-souq/backend/internal/pkg/apperror"
)

// RateLimitByIP caps requests to a route per client IP within window, using
// the same atomic Redis INCR+Expire pattern as OTPService's rate limiter
// (services/otp_service.go) — unauthenticated write endpoints with no OTP
// step of their own (e.g. vendor application submission) have no other
// natural throttle, so without this a single IP could flood the table.
func RateLimitByIP(redisClient *redis.Client, keyPrefix string, max int, window time.Duration) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			ctx := c.Request().Context()
			key := keyPrefix + c.RealIP()

			count, err := redisClient.Incr(ctx, key).Result()
			if err != nil {
				return apperror.Internal(err)
			}
			if count == 1 {
				redisClient.Expire(context.WithoutCancel(ctx), key, window)
			}
			if count > int64(max) {
				return apperror.TooManyRequests("rate limit exceeded")
			}
			return next(c)
		}
	}
}
