// Package otp generates and verifies one-time codes per blueprint §5.2:
// cryptographically random, constant-time compare.
package otp

import (
	"crypto/rand"
	"crypto/subtle"
	"fmt"
	"math/big"
)

// Generate returns a cryptographically random numeric code of the given
// length (e.g. length=6 -> "000000".."999999", zero-padded).
func Generate(length int) (string, error) {
	if length <= 0 {
		return "", fmt.Errorf("otp: length must be positive")
	}
	max := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(length)), nil)
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", fmt.Errorf("otp: generate random code: %w", err)
	}
	return fmt.Sprintf("%0*d", length, n.Int64()), nil
}

// Verify constant-time compares a submitted code against the expected one.
// Both must be the same length to be considered equal (mismatched lengths
// return false without leaking timing information about which differs,
// since ConstantTimeCompare itself short-circuits on length — callers
// should not rely on this function alone to prevent length-based timing
// leaks across many attempts, but a single OTP compare's length is not
// secret).
func Verify(submitted, expected string) bool {
	if len(submitted) != len(expected) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(submitted), []byte(expected)) == 1
}
