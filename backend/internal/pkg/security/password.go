// Package security implements password hashing (argon2id) per blueprint
// §5.2.
package security

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// argon2id parameters. Tuned for an interactive login path (~50-100ms on
// modern hardware) per OWASP's argon2id recommendations.
const (
	argon2Time    = 1
	argon2Memory  = 64 * 1024 // 64 MiB
	argon2Threads = 4
	argon2KeyLen  = 32
	saltLen       = 16
)

// HashPassword returns a self-describing argon2id hash string in the
// standard $argon2id$v=19$m=...,t=...,p=...$salt$hash format, so parameters
// can be tuned over time without invalidating old hashes.
func HashPassword(password string) (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("security: generate salt: %w", err)
	}

	hash := argon2.IDKey([]byte(password), salt, argon2Time, argon2Memory, argon2Threads, argon2KeyLen)

	encodedSalt := base64.RawStdEncoding.EncodeToString(salt)
	encodedHash := base64.RawStdEncoding.EncodeToString(hash)

	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argon2Memory, argon2Time, argon2Threads, encodedSalt, encodedHash), nil
}

// VerifyPassword checks a password against a stored argon2id hash using a
// constant-time comparison, re-deriving the hash with whatever parameters
// are encoded in the stored string (so historical hashes with different
// tuning remain verifiable).
func VerifyPassword(password, encodedHash string) (bool, error) {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, fmt.Errorf("security: unrecognized hash format")
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return false, fmt.Errorf("security: parse version: %w", err)
	}
	if version != argon2.Version {
		return false, fmt.Errorf("security: unsupported argon2 version %d", version)
	}

	var memory uint32
	var time uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &time, &threads); err != nil {
		return false, fmt.Errorf("security: parse params: %w", err)
	}
	// Bound-check params before calling argon2.IDKey: a corrupted or
	// maliciously crafted hash column (e.g. via direct DB access) must not
	// be able to trigger an out-of-memory allocation or multi-minute hang
	// by claiming an enormous memory/time cost.
	const (
		maxMemoryKiB = 1 << 20 // 1 GiB
		maxTime      = 10
		maxThreads   = 16
	)
	if memory == 0 || memory > maxMemoryKiB || time == 0 || time > maxTime || threads == 0 || threads > maxThreads {
		return false, fmt.Errorf("security: hash params out of allowed range")
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, fmt.Errorf("security: decode salt: %w", err)
	}
	storedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, fmt.Errorf("security: decode hash: %w", err)
	}
	if len(storedHash) == 0 || len(storedHash) > 128 {
		return false, fmt.Errorf("security: stored hash length out of allowed range")
	}

	computedHash := argon2.IDKey([]byte(password), salt, time, memory, threads, uint32(len(storedHash)))

	return subtle.ConstantTimeCompare(storedHash, computedHash) == 1, nil
}
