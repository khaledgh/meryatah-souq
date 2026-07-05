package services

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"

	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

// CurrencyAdminService implements admin-facing reads of currencies/rates
// (blueprint §11.A11: "currencies table... exchange_rates editor" — the
// write side already exists as SettingsService.SetExchangeRate from Phase
// 2; this adds the read side needed to actually populate that editor).
type CurrencyAdminService struct {
	db *gorm.DB
}

func NewCurrencyAdminService(db *gorm.DB) *CurrencyAdminService {
	return &CurrencyAdminService{db: db}
}

type CurrencyWithRate struct {
	Code      string  `json:"code"`
	Symbol    string  `json:"symbol"`
	Name      string  `json:"name"`
	Decimals  int     `json:"decimals"`
	IsActive  bool    `json:"is_active"`
	Rate      float64 `json:"rate"`
	UpdatedAt string  `json:"updated_at"`
}

// List returns every currency joined with its current exchange rate.
func (s *CurrencyAdminService) List(ctx context.Context) ([]CurrencyWithRate, *apperror.AppError) {
	var currencies []models.Currency
	if err := s.db.WithContext(ctx).Order("code ASC").Find(&currencies).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("currency_admin: list currencies: %w", err))
	}

	var rates []models.ExchangeRate
	if err := s.db.WithContext(ctx).Find(&rates).Error; err != nil {
		return nil, apperror.Internal(fmt.Errorf("currency_admin: list rates: %w", err))
	}
	rateByCode := make(map[string]models.ExchangeRate, len(rates))
	for _, r := range rates {
		rateByCode[r.Code] = r
	}

	out := make([]CurrencyWithRate, 0, len(currencies))
	for _, c := range currencies {
		rate := rateByCode[c.Code]
		out = append(out, CurrencyWithRate{
			Code:      c.Code,
			Symbol:    c.Symbol,
			Name:      c.Name,
			Decimals:  c.Decimals,
			IsActive:  c.IsActive,
			Rate:      rate.Rate,
			UpdatedAt: rate.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	return out, nil
}

// CreateCurrency adds a new currency (blueprint §11.A11: "add/activate
// currency"). Its exchange rate must be set separately via
// SettingsService.SetExchangeRate.
func (s *CurrencyAdminService) CreateCurrency(ctx context.Context, code, symbol, name string, decimals int) *apperror.AppError {
	currency := models.Currency{Code: code, Symbol: symbol, Name: name, Decimals: decimals, IsActive: true}
	if err := s.db.WithContext(ctx).Create(&currency).Error; err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == postgresUniqueViolation {
			return apperror.Validation(fmt.Sprintf("currency code %q already exists", code))
		}
		return apperror.Internal(fmt.Errorf("currency_admin: create currency: %w", err))
	}
	return nil
}
