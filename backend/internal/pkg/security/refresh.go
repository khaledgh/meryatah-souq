package security

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

// GenerateRefreshToken returns a new random, URL-safe refresh token. Only
// its SHA-256 hash is ever persisted (blueprint §3.2, §5.1) — the raw value
// is returned once, to the client.
func GenerateRefreshToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("security: generate refresh token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// HashRefreshToken returns the hex-encoded SHA-256 hash of a raw refresh
// token, for storage/lookup in refresh_tokens.token_hash.
func HashRefreshToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
