package services

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"

	"meryata-souq/backend/internal/config"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

// LocalizationAdminService implements the admin-facing locales/
// ui_translations management (blueprint §11.A12: "locales table..,
// ui_translations editor.. missing-key report"). Reads/writes go straight
// to Postgres; writes also broadcast a config.Cache refresh so every
// instance (and the public /locales, /i18n/:locale endpoints) picks up the
// change with no restart, matching SettingsService's existing pattern.
type LocalizationAdminService struct {
	db    *gorm.DB
	cache *config.Cache
}

func NewLocalizationAdminService(db *gorm.DB, cache *config.Cache) *LocalizationAdminService {
	return &LocalizationAdminService{db: db, cache: cache}
}

func (s *LocalizationAdminService) notifyRefresh(ctx context.Context) {
	if err := s.cache.PublishRefresh(ctx); err != nil {
		log.Printf("localization_admin: publish refresh failed, reloading local cache only: %v", err)
		if err := s.cache.Reload(ctx); err != nil {
			log.Printf("localization_admin: local cache reload also failed: %v", err)
		}
	}
}

// ListLocales returns every locale (active and inactive), sorted for
// display (blueprint §11.A12's locales table).
func (s *LocalizationAdminService) ListLocales(ctx context.Context) ([]models.Locale, *apperror.AppError) {
	locales := make([]models.Locale, 0)
	if err := s.db.WithContext(ctx).Order("sort_order ASC, code ASC").Find(&locales).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("localization_admin: list locales: %w", err))
	}
	return locales, nil
}

type CreateLocaleInput struct {
	Code      string
	Name      string
	IsRTL     bool
	SortOrder int
}

// CreateLocale adds a new locale (blueprint §11.A12: "add locale"; "adding
// ar with is_rtl flips client direction" is a client-side concern once the
// locale is active, not enforced here).
func (s *LocalizationAdminService) CreateLocale(ctx context.Context, in CreateLocaleInput) *apperror.AppError {
	locale := models.Locale{
		Code:      in.Code,
		Name:      in.Name,
		IsRTL:     in.IsRTL,
		IsDefault: false,
		IsActive:  true,
		SortOrder: in.SortOrder,
	}
	if err := s.db.WithContext(ctx).Create(&locale).Error; err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == postgresUniqueViolation {
			return apperror.Validation(fmt.Sprintf("locale %q already exists", in.Code))
		}
		return apperror.Internal(fmt.Errorf("localization_admin: create locale: %w", err))
	}
	s.notifyRefresh(ctx)
	return nil
}

// SetLocaleActive toggles a locale's active flag (blueprint §11.A12).
func (s *LocalizationAdminService) SetLocaleActive(ctx context.Context, code string, active bool) *apperror.AppError {
	result := s.db.WithContext(ctx).Model(&models.Locale{}).Where("code = ?", code).Update("is_active", active)
	if result.Error != nil {
		return apperror.Internal(fmt.Errorf("localization_admin: set locale active: %w", result.Error))
	}
	if result.RowsAffected == 0 {
		return apperror.NotFound("locale")
	}
	s.notifyRefresh(ctx)
	return nil
}

// SetDefaultLocale marks code as the sole default locale (blueprint
// §11.A12: "set default"), clearing is_default on every other locale in
// the same transaction so exactly one locale is ever default.
func (s *LocalizationAdminService) SetDefaultLocale(ctx context.Context, code string) *apperror.AppError {
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.Locale{}).Where("code <> ?", code).Update("is_default", false).Error; err != nil {
			return err
		}
		result := tx.Model(&models.Locale{}).Where("code = ?", code).Update("is_default", true)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apperror.NotFound("locale")
		}
		return apperror.Internal(fmt.Errorf("localization_admin: set default locale: %w", err))
	}
	s.notifyRefresh(ctx)
	return nil
}

// SetLocaleRTL toggles is_rtl on a locale (blueprint §11.A12: "toggle RTL").
func (s *LocalizationAdminService) SetLocaleRTL(ctx context.Context, code string, isRTL bool) *apperror.AppError {
	result := s.db.WithContext(ctx).Model(&models.Locale{}).Where("code = ?", code).Update("is_rtl", isRTL)
	if result.Error != nil {
		return apperror.Internal(fmt.Errorf("localization_admin: set locale rtl: %w", result.Error))
	}
	if result.RowsAffected == 0 {
		return apperror.NotFound("locale")
	}
	s.notifyRefresh(ctx)
	return nil
}

// ListTranslations returns every ui_translations row, optionally filtered
// by locale (blueprint §11.A12's "ui_translations editor").
func (s *LocalizationAdminService) ListTranslations(ctx context.Context, locale *string) ([]models.UITranslation, *apperror.AppError) {
	query := s.db.WithContext(ctx).Model(&models.UITranslation{})
	if locale != nil {
		query = query.Where("locale = ?", *locale)
	}
	rows := make([]models.UITranslation, 0)
	if err := query.Order("namespace ASC, key ASC, locale ASC").Find(&rows).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("localization_admin: list translations: %w", err))
	}
	return rows, nil
}

// UpsertTranslation creates or updates a single (locale, namespace, key)
// translation string (blueprint §11.A12: "edit strings").
func (s *LocalizationAdminService) UpsertTranslation(ctx context.Context, locale, namespace, key, value string) *apperror.AppError {
	var row models.UITranslation
	if err := s.db.WithContext(ctx).
		Where(models.UITranslation{Locale: locale, Namespace: namespace, Key: key}).
		Attrs(map[string]any{"id": newUUID()}).
		Assign(map[string]any{"value": value}).
		FirstOrCreate(&row).Error; err != nil {
		return apperror.Internal(fmt.Errorf("localization_admin: upsert translation: %w", err))
	}
	s.notifyRefresh(ctx)
	return nil
}

// MissingKeyReport returns, for every active non-default locale, the
// (namespace, key) pairs that exist for the default locale but are absent
// for that locale (blueprint §11.A12: "missing-key report").
type MissingKeyEntry struct {
	Locale    string `json:"locale"`
	Namespace string `json:"namespace"`
	Key       string `json:"key"`
}

func (s *LocalizationAdminService) MissingKeyReport(ctx context.Context) ([]MissingKeyEntry, *apperror.AppError) {
	defaultLocale, ok := s.cache.DefaultLocale()
	if !ok {
		return nil, apperror.Internal(fmt.Errorf("localization_admin: no default locale configured"))
	}

	var baseline []models.UITranslation
	if err := s.db.WithContext(ctx).Where("locale = ?", defaultLocale.Code).Find(&baseline).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("localization_admin: load baseline translations: %w", err))
	}

	locales := s.cache.ActiveLocales()
	missing := make([]MissingKeyEntry, 0)
	for _, l := range locales {
		if l.Code == defaultLocale.Code {
			continue
		}
		var existing []models.UITranslation
		if err := s.db.WithContext(ctx).Where("locale = ?", l.Code).Find(&existing).Error; err != nil {
			return nil, apperror.Internal(fmt.Errorf("localization_admin: load translations for %q: %w", l.Code, err))
		}
		have := make(map[string]bool, len(existing))
		for _, e := range existing {
			have[e.Namespace+"."+e.Key] = true
		}
		for _, b := range baseline {
			if !have[b.Namespace+"."+b.Key] {
				missing = append(missing, MissingKeyEntry{Locale: l.Code, Namespace: b.Namespace, Key: b.Key})
			}
		}
	}
	return missing, nil
}
