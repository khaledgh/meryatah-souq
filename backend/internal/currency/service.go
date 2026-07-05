// Package currency implements USD-canonical price conversion using the
// cached exchange_rates table (blueprint §4.5, §7). Order-time snapshotting
// of currency_code/exchange_rate/subtotal_display is implemented in Phase 7
// alongside the orders service — this package only provides the conversion
// primitive both will call.
package currency

import (
	"fmt"
	"math"

	"meryata-souq/backend/internal/config"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

type Service struct {
	cache *config.Cache
}

func NewService(cache *config.Cache) *Service {
	return &Service{cache: cache}
}

// Convert converts a USD amount to the given currency using the cached
// rate: display = round(usd * rate, decimals). Rate expresses "1 USD =
// rate units of code" (blueprint §3.1, §4.5).
func (s *Service) Convert(usd float64, currencyCode string) (float64, *apperror.AppError) {
	currency, ok := s.cache.Currency(currencyCode)
	if !ok || !currency.IsActive {
		return 0, apperror.BadRequest(fmt.Sprintf("currency %q is not active", currencyCode))
	}
	rate, ok := s.cache.ExchangeRate(currencyCode)
	if !ok {
		return 0, apperror.Internal(fmt.Errorf("currency: no exchange rate cached for %q", currencyCode))
	}
	return roundTo(usd*rate.Rate, currency.Decimals), nil
}

// Rate returns the raw cached exchange rate for a currency code.
func (s *Service) Rate(currencyCode string) (models.ExchangeRate, bool) {
	return s.cache.ExchangeRate(currencyCode)
}

// Currency returns the cached currency metadata for a code.
func (s *Service) Currency(currencyCode string) (models.Currency, bool) {
	return s.cache.Currency(currencyCode)
}

func roundTo(value float64, decimals int) float64 {
	factor := math.Pow(10, float64(decimals))
	return math.Round(value*factor) / factor
}
