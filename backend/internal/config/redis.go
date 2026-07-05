package config

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// NewRedis opens a Redis client from a redis:// URL.
func NewRedis(redisURL string) (*redis.Client, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("config: parse REDIS_URL: %w", err)
	}
	return redis.NewClient(opts), nil
}

// PingRedis verifies the connection is alive.
func PingRedis(ctx context.Context, client *redis.Client) error {
	if err := client.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("config: ping redis: %w", err)
	}
	return nil
}
