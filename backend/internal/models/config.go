package models

import (
	"encoding/json"
	"time"
)

type AppConfig struct {
	Key         string          `gorm:"column:key;primaryKey" json:"key"`
	Value       json.RawMessage `gorm:"column:value;type:jsonb;not null" json:"value"`
	Description string          `gorm:"column:description" json:"description"`
	UpdatedBy   *string         `gorm:"column:updated_by" json:"updated_by,omitempty"`
	UpdatedAt   time.Time       `gorm:"column:updated_at;not null" json:"updated_at"`
}

func (AppConfig) TableName() string { return "app_configs" }

type FeatureFlag struct {
	Key       string          `gorm:"column:key;primaryKey" json:"key"`
	Enabled   bool            `gorm:"column:enabled;not null" json:"enabled"`
	Config    json.RawMessage `gorm:"column:config;type:jsonb;not null" json:"config"`
	UpdatedAt time.Time       `gorm:"column:updated_at;not null" json:"updated_at"`
}

func (FeatureFlag) TableName() string { return "feature_flags" }
