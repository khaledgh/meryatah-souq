package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"meryata-souq/backend/internal/config"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/pkg/otp"
)

const (
	// maxOTPAttempts caps verification attempts per challenge (§5.2).
	maxOTPAttempts = 5
	// otpRedisKeyPrefix namespaces OTP code storage in Redis.
	otpRedisKeyPrefix = "otp:code:"
	// otpRateLimitPrefix namespaces per-phone/per-IP request rate limits.
	otpRateLimitPrefix = "otp:ratelimit:"
	// maxOTPRequestsPerWindow and otpRateLimitWindow bound how often a
	// phone/IP may request a new OTP (§5.6).
	maxOTPRequestsPerWindow = 5
	otpRateLimitWindow      = 15 * time.Minute
)

// OTPService implements the two-step OTP challenge/verify flow (blueprint
// §5.2, §9): cryptographically random codes, TTL'd and rate-limited, no
// user enumeration (identical responses whether the phone exists or not),
// max attempts, constant-time compare. The code itself lives only in Redis
// with a TTL; Postgres otp_challenges tracks metadata for audit/rate-limit
// history, never the code.
type OTPService struct {
	db       *gorm.DB
	redis    *redis.Client
	cache    *config.Cache
	registry *otp.Registry
}

func NewOTPService(db *gorm.DB, redisClient *redis.Client, cache *config.Cache, registry *otp.Registry) *OTPService {
	return &OTPService{db: db, redis: redisClient, cache: cache, registry: registry}
}

// RequestOTP generates a code, stores its hash in Redis with a TTL,
// records a challenge row, and dispatches it via the currently configured
// provider. Rate-limited per phone. Always succeeds from the caller's
// perspective regardless of whether the phone is already registered — no
// enumeration.
func (s *OTPService) RequestOTP(ctx context.Context, phoneE164, clientIP string) *apperror.AppError {
	log.Printf("otp: request: start for phone=%s ip=%s", phoneE164, clientIP)

	// Reserve the rate-limit slot atomically before doing any other work:
	// Redis INCR is atomic, so concurrent requests can't all observe an
	// under-limit count the way a separate read-then-write could.
	if limited, err := s.reserveRateLimitSlot(ctx, phoneE164, clientIP); err != nil {
		log.Printf("otp: request: reserve rate-limit slot (Redis) failed: %v", err)
		return apperror.Internal(err)
	} else if limited {
		log.Printf("otp: request: rate limited for phone=%s ip=%s", phoneE164, clientIP)
		return apperror.TooManyRequests("otp request rate limit exceeded")
	}

	providerName, _ := s.cache.AppConfigString("otp_provider")
	if providerName == "" {
		providerName = "whatsapp"
	}
	log.Printf("otp: request: resolving provider %q", providerName)
	provider, err := s.registry.Resolve(providerName)
	if err != nil {
		log.Printf("otp: request: resolve provider %q failed: %v", providerName, err)
		return apperror.Internal(fmt.Errorf("otp: resolve provider: %w", err))
	}

	ttlSeconds, _ := s.cache.AppConfig("otp_ttl_seconds")
	ttl := 300 * time.Second
	if ttlSeconds.Value != nil {
		var seconds int
		if jsonErr := unmarshalInt(ttlSeconds.Value, &seconds); jsonErr == nil && seconds > 0 {
			ttl = time.Duration(seconds) * time.Second
		}
	}

	length := 6
	if lengthConfig, ok := s.cache.AppConfig("otp_length"); ok {
		var l int
		if jsonErr := unmarshalInt(lengthConfig.Value, &l); jsonErr == nil && l > 0 {
			length = l
		}
	}

	code, err := otp.Generate(length)
	if err != nil {
		return apperror.Internal(err)
	}

	challenge := models.OTPChallenge{
		ID:        newUUID(),
		Phone:     phoneE164,
		Provider:  providerName,
		Consumed:  false,
		Attempts:  0,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(ttl),
	}
	if err := s.db.WithContext(ctx).Create(&challenge).Error; err != nil {
		log.Printf("otp: request: insert otp_challenges row (DB) failed: %v", err)
		return apperror.Internal(fmt.Errorf("otp: create challenge: %w", err))
	}

	redisKey := otpRedisKeyPrefix + challenge.ID
	if err := s.redis.Set(ctx, redisKey, hashOTP(code), ttl).Err(); err != nil {
		log.Printf("otp: request: store code in Redis failed: %v", err)
		return apperror.Internal(fmt.Errorf("otp: store code: %w", err))
	}
	log.Printf("otp: request: challenge %s created and code stored (provider=%s, ttl=%s)", challenge.ID, providerName, ttl)

	// Development convenience: with no real SMS/WhatsApp provider configured
	// locally, the code is never delivered anywhere, making OTP login
	// impossible to test. In development ONLY, log the code so it can be used
	// for local sign-in. Gated strictly on APP_ENV=development so it can
	// never leak a live code in staging/production.
	if os.Getenv("APP_ENV") == "development" {
		log.Printf("otp[dev]: code for %s is %s (development-only log)", phoneE164, code)
	}

	if err := provider.Send(ctx, phoneE164, code); err != nil {
		// Do not fail the request over dispatch errors in a way that
		// reveals provider internals to the client — timing/response shape
		// must not leak whether the phone is valid — but this must be
		// logged loudly, since a silently undeliverable OTP is a
		// production incident, not a security property.
		log.Printf("otp: provider %q failed to send code to a challenge (dispatch error, not returned to client): %v", providerName, err)
	}

	return nil
}

// VerifyResult indicates what the caller should do next after a
// successful OTP verification.
type VerifyResult struct {
	ChallengeID       string
	Phone             string
	ExistingUser      *models.User
	VerificationToken string
}

// otpGlobalAttemptPrefix namespaces a per-phone verify-attempt counter
// that spans every challenge for that phone within otpRateLimitWindow —
// independent of the per-challenge attempt cap, so requesting a fresh
// challenge cannot reset an attacker's guess budget.
const otpGlobalAttemptPrefix = "otp:verify_attempts:"

// maxGlobalOTPAttempts bounds total guesses per phone across all
// challenges within otpRateLimitWindow.
const maxGlobalOTPAttempts = 15

// VerifyOTP checks a submitted code against the stored hash for the most
// recent unconsumed challenge for a phone, enforcing both the per-challenge
// attempt cap and a per-phone global cap (so requesting a new challenge
// cannot reset an attacker's guess budget), with constant-time comparison
// (§5.2).
func (s *OTPService) VerifyOTP(ctx context.Context, phoneE164, code string) (*VerifyResult, *apperror.AppError) {
	globalAttempts, err := s.redis.Incr(ctx, otpGlobalAttemptPrefix+phoneE164).Result()
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("otp: increment global attempt counter: %w", err))
	}
	if globalAttempts == 1 {
		s.redis.Expire(ctx, otpGlobalAttemptPrefix+phoneE164, otpRateLimitWindow)
	}
	if globalAttempts > maxGlobalOTPAttempts {
		return nil, apperror.New("OTP_LOCKED", 429, "max global attempts exceeded for phone", "Too many incorrect attempts. Try again later.")
	}

	var challenge models.OTPChallenge
	err2 := s.db.WithContext(ctx).
		Where("phone = ? AND consumed = false AND expires_at > ?", phoneE164, time.Now()).
		Order("created_at DESC").
		First(&challenge).Error
	if err2 != nil {
		if err2 == gorm.ErrRecordNotFound {
			return nil, apperror.New("OTP_INVALID", 400, "no active challenge for phone", "The code is incorrect or has expired.")
		}
		return nil, apperror.Internal(fmt.Errorf("otp: load challenge: %w", err2))
	}

	if challenge.Attempts >= maxOTPAttempts {
		return nil, apperror.New("OTP_LOCKED", 429, "max attempts exceeded", "Too many incorrect attempts. Request a new code.")
	}

	redisKey := otpRedisKeyPrefix + challenge.ID
	storedHash, err := s.redis.Get(ctx, redisKey).Result()
	if err == redis.Nil {
		return nil, apperror.New("OTP_INVALID", 400, "code expired or not found in redis", "The code is incorrect or has expired.")
	} else if err != nil {
		return nil, apperror.Internal(fmt.Errorf("otp: fetch stored code: %w", err))
	}

	if err := s.db.WithContext(ctx).Model(&challenge).
		Update("attempts", gorm.Expr("attempts + 1")).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("otp: increment attempts: %w", err))
	}

	if !otp.Verify(hashOTP(code), storedHash) {
		return nil, apperror.New("OTP_INVALID", 400, "code mismatch", "The code is incorrect.")
	}

	if err := s.db.WithContext(ctx).Model(&challenge).Update("consumed", true).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("otp: mark consumed: %w", err))
	}
	s.redis.Del(ctx, redisKey)

	var user models.User
	err = s.db.WithContext(ctx).Where("phone = ?", phoneE164).First(&user).Error
	switch {
	case err == nil:
		return &VerifyResult{ChallengeID: challenge.ID, Phone: phoneE164, ExistingUser: &user}, nil
	case err == gorm.ErrRecordNotFound:
		token, tokenErr := s.issueVerificationToken(ctx, phoneE164)
		if tokenErr != nil {
			return nil, apperror.Internal(tokenErr)
		}
		return &VerifyResult{ChallengeID: challenge.ID, Phone: phoneE164, VerificationToken: token}, nil
	default:
		return nil, apperror.Internal(fmt.Errorf("otp: load user: %w", err))
	}
}

// issueVerificationToken stores a short-lived token in Redis proving this
// phone just completed OTP verification, consumed by
// complete-registration.
func (s *OTPService) issueVerificationToken(ctx context.Context, phoneE164 string) (string, error) {
	token := hashOTP(phoneE164 + newUUID())
	key := "otp:verified:" + token
	if err := s.redis.Set(ctx, key, phoneE164, 15*time.Minute).Err(); err != nil {
		return "", fmt.Errorf("otp: store verification token: %w", err)
	}
	return token, nil
}

// ConsumeVerificationToken returns the phone number a verification token
// was issued for, and deletes it (single use).
func (s *OTPService) ConsumeVerificationToken(ctx context.Context, token string) (string, *apperror.AppError) {
	key := "otp:verified:" + token
	phone, err := s.redis.Get(ctx, key).Result()
	if err == redis.Nil {
		return "", apperror.Unauthorized("verification token invalid or expired")
	} else if err != nil {
		return "", apperror.Internal(fmt.Errorf("otp: fetch verification token: %w", err))
	}
	s.redis.Del(ctx, key)
	return phone, nil
}

// reserveRateLimitSlot atomically increments the phone/IP counters and
// reports whether this request exceeds the limit — INCR is atomic in
// Redis, so concurrent requests can never all observe a stale under-limit
// count the way a separate read-then-write (GET, then later INCR) could.
// The increment always happens; callers that are over budget must not
// dispatch an OTP even though the counter was bumped, which is correct
// since a rejected attempt should still count against the budget.
func (s *OTPService) reserveRateLimitSlot(ctx context.Context, phoneE164, clientIP string) (bool, error) {
	phoneKey := otpRateLimitPrefix + "phone:" + phoneE164
	ipKey := otpRateLimitPrefix + "ip:" + clientIP

	pipe := s.redis.Pipeline()
	phoneIncr := pipe.Incr(ctx, phoneKey)
	pipe.Expire(ctx, phoneKey, otpRateLimitWindow)
	ipIncr := pipe.Incr(ctx, ipKey)
	pipe.Expire(ctx, ipKey, otpRateLimitWindow)
	if _, err := pipe.Exec(ctx); err != nil {
		return false, fmt.Errorf("otp: reserve rate limit slot: %w", err)
	}

	if phoneIncr.Val() > maxOTPRequestsPerWindow {
		return true, nil
	}
	if ipIncr.Val() > maxOTPRequestsPerWindow*4 {
		// A single IP requesting OTPs for many different phones is capped
		// higher than a single phone, but still bounded.
		return true, nil
	}
	return false, nil
}

func hashOTP(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}
