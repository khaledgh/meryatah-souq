package config

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"meryata-souq/backend/internal/models"
)

// refreshChannel is the Redis pub/sub channel instances publish to after a
// write to app_configs/feature_flags/locales/currencies/exchange_rates, so
// every other instance's in-memory Cache reloads without a restart
// (blueprint §4.3).
const refreshChannel = "meryata:config:refresh"

// Cache is an in-memory, Redis-backed mirror of the dynamic settings
// tables: app_configs, feature_flags, locales, currencies, exchange_rates.
// Reads are O(1) against the in-memory maps; writes go to Postgres then
// publish a refresh notification so every instance reloads.
type Cache struct {
	db    *gorm.DB
	redis *redis.Client

	mu            sync.RWMutex
	appConfigs    map[string]models.AppConfig
	featureFlags  map[string]models.FeatureFlag
	locales       map[string]models.Locale
	currencies    map[string]models.Currency
	exchangeRates map[string]models.ExchangeRate
}

// NewCache builds a Cache and performs the initial boot-load from Postgres.
func NewCache(ctx context.Context, db *gorm.DB, redisClient *redis.Client) (*Cache, error) {
	c := &Cache{db: db, redis: redisClient}
	if err := c.Reload(ctx); err != nil {
		return nil, fmt.Errorf("config: initial cache load: %w", err)
	}
	return c, nil
}

// Reload re-fetches every cached table from Postgres and atomically
// swaps the in-memory maps. Safe to call concurrently.
func (c *Cache) Reload(ctx context.Context) error {
	var appConfigs []models.AppConfig
	if err := c.db.WithContext(ctx).Find(&appConfigs).Error; err != nil {
		return fmt.Errorf("load app_configs: %w", err)
	}

	var featureFlags []models.FeatureFlag
	if err := c.db.WithContext(ctx).Find(&featureFlags).Error; err != nil {
		return fmt.Errorf("load feature_flags: %w", err)
	}

	var locales []models.Locale
	if err := c.db.WithContext(ctx).Find(&locales).Error; err != nil {
		return fmt.Errorf("load locales: %w", err)
	}

	var currencies []models.Currency
	if err := c.db.WithContext(ctx).Find(&currencies).Error; err != nil {
		return fmt.Errorf("load currencies: %w", err)
	}

	var exchangeRates []models.ExchangeRate
	if err := c.db.WithContext(ctx).Find(&exchangeRates).Error; err != nil {
		return fmt.Errorf("load exchange_rates: %w", err)
	}

	appConfigMap := make(map[string]models.AppConfig, len(appConfigs))
	for _, v := range appConfigs {
		appConfigMap[v.Key] = v
	}
	featureFlagMap := make(map[string]models.FeatureFlag, len(featureFlags))
	for _, v := range featureFlags {
		featureFlagMap[v.Key] = v
	}
	localeMap := make(map[string]models.Locale, len(locales))
	for _, v := range locales {
		localeMap[v.Code] = v
	}
	currencyMap := make(map[string]models.Currency, len(currencies))
	for _, v := range currencies {
		currencyMap[v.Code] = v
	}
	exchangeRateMap := make(map[string]models.ExchangeRate, len(exchangeRates))
	for _, v := range exchangeRates {
		exchangeRateMap[v.Code] = v
	}

	c.mu.Lock()
	c.appConfigs = appConfigMap
	c.featureFlags = featureFlagMap
	c.locales = localeMap
	c.currencies = currencyMap
	c.exchangeRates = exchangeRateMap
	c.mu.Unlock()

	return nil
}

// AppConfig returns a raw app_configs value by key.
func (c *Cache) AppConfig(key string) (models.AppConfig, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	v, ok := c.appConfigs[key]
	return v, ok
}

// AppConfigString unmarshals a JSON-string app_configs value (e.g.
// otp_provider, storage_driver, base_currency, default_locale).
func (c *Cache) AppConfigString(key string) (string, bool) {
	v, ok := c.AppConfig(key)
	if !ok {
		return "", false
	}
	var s string
	if err := json.Unmarshal(v.Value, &s); err != nil {
		return "", false
	}
	return s, true
}

func (c *Cache) FeatureFlag(key string) (models.FeatureFlag, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	v, ok := c.featureFlags[key]
	return v, ok
}

func (c *Cache) Locale(code string) (models.Locale, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	v, ok := c.locales[code]
	return v, ok
}

// ActiveLocales returns all active locales in sort_order.
func (c *Cache) ActiveLocales() []models.Locale {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]models.Locale, 0, len(c.locales))
	for _, v := range c.locales {
		if v.IsActive {
			out = append(out, v)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].SortOrder != out[j].SortOrder {
			return out[i].SortOrder < out[j].SortOrder
		}
		return out[i].Code < out[j].Code
	})
	return out
}

// DefaultLocale returns the locale marked is_default. If more than one row
// is (mis)configured as default, the lowest sort_order (ties broken by
// code) wins deterministically rather than depending on Go's random map
// iteration order.
func (c *Cache) DefaultLocale() (models.Locale, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	best, found := models.Locale{}, false
	for _, v := range c.locales {
		if !v.IsDefault {
			continue
		}
		if !found || v.SortOrder < best.SortOrder || (v.SortOrder == best.SortOrder && v.Code < best.Code) {
			best, found = v, true
		}
	}
	return best, found
}

func (c *Cache) Currency(code string) (models.Currency, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	v, ok := c.currencies[code]
	return v, ok
}

func (c *Cache) ExchangeRate(code string) (models.ExchangeRate, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	v, ok := c.exchangeRates[code]
	return v, ok
}

// PublishRefresh notifies every instance subscribed to refreshChannel to
// reload from Postgres. Call after any write to a cached table.
func (c *Cache) PublishRefresh(ctx context.Context) error {
	if err := c.redis.Publish(ctx, refreshChannel, "reload").Err(); err != nil {
		return fmt.Errorf("config: publish refresh: %w", err)
	}
	return nil
}

// Subscribe starts a goroutine that reloads the cache whenever any instance
// (including this one) publishes a refresh notification. It runs until ctx
// is cancelled, reconnecting with backoff if the underlying Redis
// connection drops without ctx being cancelled.
func (c *Cache) Subscribe(ctx context.Context) {
	go func() {
		backoff := time.Second
		const maxBackoff = 30 * time.Second
		for {
			if ctx.Err() != nil {
				return
			}
			c.runSubscription(ctx)
			if ctx.Err() != nil {
				return
			}
			log.Printf("config: pub/sub subscription lost, reconnecting in %s", backoff)
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			if backoff < maxBackoff {
				backoff *= 2
			}
		}
	}()
}

// runSubscription subscribes and reloads on every message until the
// subscription channel closes (connection drop) or ctx is cancelled.
func (c *Cache) runSubscription(ctx context.Context) {
	sub := c.redis.Subscribe(ctx, refreshChannel)
	defer sub.Close()
	ch := sub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case _, ok := <-ch:
			if !ok {
				return
			}
			if err := c.Reload(ctx); err != nil {
				// Keep serving stale data rather than crash; the next
				// refresh notification will retry the reload.
				log.Printf("config: reload after refresh notification failed: %v", err)
			}
		}
	}
}
