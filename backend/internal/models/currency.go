package models

import "time"

type Currency struct {
	Code     string `gorm:"column:code;primaryKey" json:"code"`
	Symbol   string `gorm:"column:symbol;not null" json:"symbol"`
	Name     string `gorm:"column:name;not null" json:"name"`
	Decimals int    `gorm:"column:decimals;not null" json:"decimals"`
	IsActive bool   `gorm:"column:is_active;not null" json:"is_active"`
}

func (Currency) TableName() string { return "currencies" }

type ExchangeRate struct {
	Code      string    `gorm:"column:code;primaryKey" json:"code"`
	Rate      float64   `gorm:"column:rate;not null" json:"rate"`
	UpdatedBy *string   `gorm:"column:updated_by" json:"updated_by,omitempty"`
	UpdatedAt time.Time `gorm:"column:updated_at;not null" json:"updated_at"`
}

func (ExchangeRate) TableName() string { return "exchange_rates" }
