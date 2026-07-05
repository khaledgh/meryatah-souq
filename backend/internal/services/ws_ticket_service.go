package services

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/pkg/security"
)

// wsTicketPrefix namespaces one-time WebSocket auth tickets in Redis.
const wsTicketPrefix = "ws:ticket:"

// wsTicketTTL bounds how long a ticket is valid — long enough to cover the
// brief gap between issuing it and the client completing the WS handshake,
// short enough that a ticket leaked via a proxy/access log is worthless by
// the time anyone could reuse it.
const wsTicketTTL = 30 * time.Second

// WSTicketService issues and consumes short-lived, single-use tokens for
// authenticating a WebSocket handshake without putting the general-purpose
// access JWT in a URL query string (blueprint §5.1, §5.10: WS upgrades
// must be authenticated, and secrets shouldn't leak into logs — a JWT in a
// query string is commonly captured by reverse-proxy/load-balancer access
// logs, unlike a ticket that's dead within seconds of being minted).
type WSTicketService struct {
	redis *redis.Client
}

func NewWSTicketService(redisClient *redis.Client) *WSTicketService {
	return &WSTicketService{redis: redisClient}
}

// IssueTicket mints a one-time ticket bound to userID/role, to be passed as
// the WS handshake's query token. Called from a normal authenticated
// (Authorization-header) HTTP route — the ticket itself never appears
// anywhere but the WS URL, and only briefly.
func (s *WSTicketService) IssueTicket(ctx context.Context, userID, role string) (string, *apperror.AppError) {
	raw, err := security.GenerateRefreshToken() // reuse: any cryptographically random URL-safe token generator
	if err != nil {
		return "", apperror.Internal(fmt.Errorf("ws_ticket: generate: %w", err))
	}
	value := userID + "|" + role
	if err := s.redis.Set(ctx, wsTicketPrefix+raw, value, wsTicketTTL).Err(); err != nil {
		return "", apperror.Internal(fmt.Errorf("ws_ticket: store: %w", err))
	}
	return raw, nil
}

// ConsumeTicket validates and deletes a ticket (single use), returning the
// bound userID/role. An invalid, expired, or already-consumed ticket
// returns an error indistinguishable in shape from any other auth failure.
func (s *WSTicketService) ConsumeTicket(ctx context.Context, ticket string) (userID, role string, appErr *apperror.AppError) {
	value, err := s.redis.Get(ctx, wsTicketPrefix+ticket).Result()
	if err == redis.Nil {
		return "", "", apperror.Unauthorized("invalid or expired ticket")
	}
	if err != nil {
		return "", "", apperror.Internal(fmt.Errorf("ws_ticket: fetch: %w", err))
	}
	s.redis.Del(ctx, wsTicketPrefix+ticket)

	for i := 0; i < len(value); i++ {
		if value[i] == '|' {
			return value[:i], value[i+1:], nil
		}
	}
	return "", "", apperror.Internal(fmt.Errorf("ws_ticket: malformed stored value"))
}
