package security

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims is the JWT payload for access tokens: role, sub, exp, iat, jti
// (blueprint §5.1).
type Claims struct {
	Role string `json:"role"`
	jwt.RegisteredClaims
}

// IssueAccessToken signs a short-lived access JWT for userID/role.
func IssueAccessToken(secret []byte, userID, role string, ttl time.Duration, jti string) (string, error) {
	now := time.Now()
	claims := Claims{
		Role: role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			ID:        jti,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(secret)
	if err != nil {
		return "", fmt.Errorf("security: sign access token: %w", err)
	}
	return signed, nil
}

// ParseAccessToken validates signature + expiry and returns the claims.
func ParseAccessToken(secret []byte, tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return secret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("security: parse access token: %w", err)
	}
	if !token.Valid {
		return nil, fmt.Errorf("security: invalid access token")
	}
	return claims, nil
}
