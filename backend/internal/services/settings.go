package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/config"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

// SettingsService implements admin-facing reads/writes of app_configs and
// feature_flags (blueprint §10 A10). Writes go to Postgres, then publish a
// Redis refresh notification so every instance's config.Cache reloads with
// no restart (blueprint §4.3). The write itself is the source of truth: if
// the refresh broadcast fails (e.g. Redis is briefly unreachable), the
// write still succeeded and is reported as such — every instance will pick
// it up on its next successful refresh notification, and the writer's own
// process reloads immediately as a fallback.
type SettingsService struct {
	db    *gorm.DB
	cache *config.Cache
}

func NewSettingsService(db *gorm.DB, cache *config.Cache) *SettingsService {
	return &SettingsService{db: db, cache: cache}
}

// notifyRefresh broadcasts a refresh to every instance; if that fails, it
// falls back to reloading only this instance's cache so at least the
// writer sees its own change take effect. Either way, a failure here never
// fails the write that already committed to Postgres.
func (s *SettingsService) notifyRefresh(ctx context.Context) {
	if err := s.cache.PublishRefresh(ctx); err != nil {
		log.Printf("settings: publish refresh failed, reloading local cache only: %v", err)
		if err := s.cache.Reload(ctx); err != nil {
			log.Printf("settings: local cache reload also failed: %v", err)
		}
	}
}

// SettingsSnapshot is the full admin-facing settings view (blueprint
// §11.A10): every app_configs row plus every feature_flags row, so the
// System Settings page can render current values without one request per
// key.
type SettingsSnapshot struct {
	AppConfigs   []models.AppConfig   `json:"app_configs"`
	FeatureFlags []models.FeatureFlag `json:"feature_flags"`
}

// ListAll returns every app_configs and feature_flags row (blueprint
// §11.A10's settings/feature_flags grid).
func (s *SettingsService) ListAll(ctx context.Context) (*SettingsSnapshot, *apperror.AppError) {
	var configs []models.AppConfig
	if err := s.db.WithContext(ctx).Order("key ASC").Find(&configs).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("settings: list app_configs: %w", err))
	}
	var flags []models.FeatureFlag
	if err := s.db.WithContext(ctx).Order("key ASC").Find(&flags).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("settings: list feature_flags: %w", err))
	}
	return &SettingsSnapshot{AppConfigs: configs, FeatureFlags: flags}, nil
}

// SetAppConfig upserts a single app_configs value and broadcasts a refresh.
// updatedBy is the acting user's UUID, or nil if unauthenticated (updated_by
// is a nullable UUID column per blueprint §3.1).
func (s *SettingsService) SetAppConfig(ctx context.Context, key string, value json.RawMessage, updatedBy *string) *apperror.AppError {
	row := models.AppConfig{
		Key:       key,
		Value:     value,
		UpdatedBy: updatedBy,
		UpdatedAt: time.Now(),
	}
	if err := s.db.WithContext(ctx).
		Where("key = ?", key).
		Assign(models.AppConfig{Value: value, UpdatedBy: updatedBy, UpdatedAt: row.UpdatedAt}).
		FirstOrCreate(&row).Error; err != nil {
		return apperror.Internal(fmt.Errorf("settings: upsert app_config %q: %w", key, err))
	}
	s.notifyRefresh(ctx)
	return nil
}

// SetFeatureFlag upserts a feature flag and broadcasts a refresh.
func (s *SettingsService) SetFeatureFlag(ctx context.Context, key string, enabled bool, cfg json.RawMessage) *apperror.AppError {
	row := models.FeatureFlag{
		Key:       key,
		Enabled:   enabled,
		Config:    cfg,
		UpdatedAt: time.Now(),
	}
	if err := s.db.WithContext(ctx).
		Where("key = ?", key).
		Assign(models.FeatureFlag{Enabled: enabled, Config: cfg, UpdatedAt: row.UpdatedAt}).
		FirstOrCreate(&row).Error; err != nil {
		return apperror.Internal(fmt.Errorf("settings: upsert feature_flag %q: %w", key, err))
	}
	s.notifyRefresh(ctx)
	return nil
}

// SetExchangeRate upserts an exchange rate and broadcasts a refresh
// (blueprint §7, §11.A11). The base currency's rate is always 1 and is
// never user-editable. updatedBy is the acting user's UUID, or nil if
// unauthenticated.
func (s *SettingsService) SetExchangeRate(ctx context.Context, code string, rate float64, updatedBy *string) *apperror.AppError {
	baseCurrency, _ := s.cache.AppConfigString("base_currency")
	if code == baseCurrency && rate != 1 {
		return apperror.Validation(fmt.Sprintf("base currency %q rate is fixed at 1", baseCurrency))
	}

	row := models.ExchangeRate{
		Code:      code,
		Rate:      rate,
		UpdatedBy: updatedBy,
		UpdatedAt: time.Now(),
	}
	if err := s.db.WithContext(ctx).
		Where("code = ?", code).
		Assign(models.ExchangeRate{Rate: rate, UpdatedBy: updatedBy, UpdatedAt: row.UpdatedAt}).
		FirstOrCreate(&row).Error; err != nil {
		return apperror.Internal(fmt.Errorf("settings: upsert exchange_rate %q: %w", code, err))
	}
	s.notifyRefresh(ctx)
	return nil
}
