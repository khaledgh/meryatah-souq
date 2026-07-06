// Package config loads environment configuration and holds the boot-time
// connections (Postgres, Redis). The dynamic settings cache backed by
// app_configs/feature_flags/locales/currencies (blueprint §4.3) is built out
// in Phase 2; this Phase 1 version only loads env vars and opens the DB/Redis
// connections needed for the health check and future services.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all environment-derived settings for the process.
type Config struct {
	AppEnv   string
	HTTPPort string

	DatabaseURL string
	RedisURL    string

	JWTSecret     string
	JWTAccessTTL  time.Duration
	JWTRefreshTTL time.Duration

	OTPTTLSeconds int
	OTPLength     int

	SMSAPIKey      string
	WhatsAppAPIKey string

	OneSignalAppID  string
	OneSignalAPIKey string

	StorageDriver string
	MediaLocalDir string
	// PublicBaseURL is the externally-reachable origin of this API (e.g.
	// https://souq-api.example.com), used to build absolute URLs for
	// locally-served media so clients on other origins (admin dashboard,
	// mobile app) can load images. Empty → URLs stay relative (dev default).
	PublicBaseURL string

	AWSRegion          string
	AWSS3Bucket        string
	AWSAccessKeyID     string
	AWSSecretAccessKey string

	BaseCurrency  string
	DefaultLocale string

	CORSOrigins []string

	// SeedAdminPhone/SeedAdminPassword bootstrap the first super_admin
	// account on boot if no super_admin exists yet (blueprint has no HTTP
	// path to create one). Optional — leave unset after first boot.
	SeedAdminPhone    string
	SeedAdminPassword string
}

// Load reads a .env file if present (development convenience; never
// required in production where real env vars are injected) and builds a
// Config from the process environment. Missing required vars return an
// error rather than silently defaulting, per the no-silent-failure rule.
func Load() (*Config, error) {
	_ = godotenv.Load() // optional: ignore if .env is absent (e.g. prod)

	cfg := &Config{
		AppEnv:   getEnv("APP_ENV", "development"),
		HTTPPort: getEnv("HTTP_PORT", "8080"),

		DatabaseURL: os.Getenv("DATABASE_URL"),
		RedisURL:    os.Getenv("REDIS_URL"),

		JWTSecret: os.Getenv("JWT_SECRET"),

		SMSAPIKey:      os.Getenv("SMS_API_KEY"),
		WhatsAppAPIKey: os.Getenv("WHATSAPP_API_KEY"),

		OneSignalAppID:  os.Getenv("ONESIGNAL_APP_ID"),
		OneSignalAPIKey: os.Getenv("ONESIGNAL_API_KEY"),

		StorageDriver: getEnv("STORAGE_DRIVER", "local"),
		MediaLocalDir: getEnv("MEDIA_LOCAL_DIR", "./media"),
		PublicBaseURL: strings.TrimSuffix(os.Getenv("PUBLIC_BASE_URL"), "/"),

		AWSRegion:          os.Getenv("AWS_REGION"),
		AWSS3Bucket:        os.Getenv("AWS_S3_BUCKET"),
		AWSAccessKeyID:     os.Getenv("AWS_ACCESS_KEY_ID"),
		AWSSecretAccessKey: os.Getenv("AWS_SECRET_ACCESS_KEY"),

		BaseCurrency:  getEnv("BASE_CURRENCY", "USD"),
		DefaultLocale: getEnv("DEFAULT_LOCALE", "en"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("config: DATABASE_URL is required")
	}
	if cfg.RedisURL == "" {
		return nil, fmt.Errorf("config: REDIS_URL is required")
	}
	// Required in every environment, not just "production": an empty JWT
	// secret makes every access token forgeable with an empty HMAC key,
	// regardless of APP_ENV. There is no safe default to fall back to.
	if len(cfg.JWTSecret) < 32 {
		return nil, fmt.Errorf("config: JWT_SECRET is required and must be at least 32 characters")
	}

	accessTTL, err := parseDurationEnv("JWT_ACCESS_TTL", "15m")
	if err != nil {
		return nil, err
	}
	cfg.JWTAccessTTL = accessTTL

	refreshTTL, err := parseDurationEnv("JWT_REFRESH_TTL", "720h")
	if err != nil {
		return nil, err
	}
	cfg.JWTRefreshTTL = refreshTTL

	otpTTL, err := parseIntEnv("OTP_TTL_SECONDS", 300)
	if err != nil {
		return nil, err
	}
	cfg.OTPTTLSeconds = otpTTL

	otpLen, err := parseIntEnv("OTP_LENGTH", 6)
	if err != nil {
		return nil, err
	}
	cfg.OTPLength = otpLen

	cfg.CORSOrigins = splitAndTrim(getEnv("CORS_ORIGINS", ""))

	cfg.SeedAdminPhone = os.Getenv("SEED_ADMIN_PHONE")
	cfg.SeedAdminPassword = os.Getenv("SEED_ADMIN_PASSWORD")

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseDurationEnv(key, fallback string) (time.Duration, error) {
	raw := getEnv(key, fallback)
	d, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("config: invalid duration for %s=%q: %w", key, raw, err)
	}
	return d, nil
}

func parseIntEnv(key string, fallback int) (int, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("config: invalid int for %s=%q: %w", key, raw, err)
	}
	return n, nil
}

func splitAndTrim(csv string) []string {
	if csv == "" {
		return nil
	}
	var out []string
	for _, part := range strings.Split(csv, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
