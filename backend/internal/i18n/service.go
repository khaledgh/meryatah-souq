// Package i18n resolves the locale registry and serves ui_translations to
// clients, per blueprint §4.3 and §6.1.
package i18n

import (
	"context"
	"database/sql"
	"fmt"
	"log"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/config"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

type Service struct {
	db    *gorm.DB
	cache *config.Cache
}

func NewService(db *gorm.DB, cache *config.Cache) *Service {
	return &Service{db: db, cache: cache}
}

// Translations returns every ui_translations row for the given locale,
// grouped by namespace, then by key. Falls back to the default locale if
// the requested locale is unknown or inactive (blueprint §6.1).
func (s *Service) Translations(ctx context.Context, localeCode string) (map[string]map[string]string, *apperror.AppError) {
	resolved, appErr := s.ResolveLocale(localeCode)
	if appErr != nil {
		return nil, appErr
	}

	var rows []models.UITranslation
	if err := s.db.WithContext(ctx).Where("locale = ?", resolved.Code).Find(&rows).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("i18n: load translations: %w", err))
	}

	out := make(map[string]map[string]string)
	for _, row := range rows {
		ns, ok := out[row.Namespace]
		if !ok {
			ns = make(map[string]string)
			out[row.Namespace] = ns
		}
		ns[row.Key] = row.Value
	}
	return out, nil
}

// ResolveLocale returns the active locale matching code, or the default
// active locale if code is empty/unknown/inactive. Returns an error rather
// than fabricating a locale if the locales table has no row marked
// is_default — that state means the deployment is misconfigured and should
// surface, not be silently papered over.
func (s *Service) ResolveLocale(code string) (models.Locale, *apperror.AppError) {
	if code != "" {
		if locale, ok := s.cache.Locale(code); ok && locale.IsActive {
			return locale, nil
		}
	}
	if def, ok := s.cache.DefaultLocale(); ok {
		return def, nil
	}
	return models.Locale{}, apperror.Internal(fmt.Errorf("i18n: no default locale configured in locales table"))
}

// ActiveLocales lists all active locales for a language-switcher UI.
func (s *Service) ActiveLocales() []models.Locale {
	return s.cache.ActiveLocales()
}

// TranslateFor resolves a single ui_translations key for one recipient
// locale, falling back to the caller-supplied English default if no row
// exists — used for backend-originated text a client never renders
// itself, such as push notification bodies (blueprint §4.8), where there's
// no client-side i18n bundle to fall back to. A genuine DB error is
// distinguished from a legitimately-missing key: both fall back to the
// same default text (push delivery must never fail over a translation
// lookup), but only the DB-error case is logged, so an admin can tell "ar
// is missing this content key" (silent, expected during content rollout)
// apart from "the database just failed a query" (worth investigating).
func (s *Service) TranslateFor(ctx context.Context, locale, namespace, key, fallback string) string {
	resolved, appErr := s.ResolveLocale(locale)
	if appErr != nil {
		return fallback
	}
	var value string
	err := s.db.WithContext(ctx).Raw(`
		SELECT value FROM ui_translations WHERE locale = ? AND namespace = ? AND key = ?
	`, resolved.Code, namespace, key).Row().Scan(&value)
	if err != nil {
		if err != sql.ErrNoRows {
			log.Printf("i18n: TranslateFor query failed for locale=%q namespace=%q key=%q: %v", resolved.Code, namespace, key, err)
		}
		return fallback
	}
	if value == "" {
		return fallback
	}
	return value
}
