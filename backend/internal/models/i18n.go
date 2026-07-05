package models

type Locale struct {
	Code      string `gorm:"column:code;primaryKey" json:"code"`
	Name      string `gorm:"column:name;not null" json:"name"`
	IsRTL     bool   `gorm:"column:is_rtl;not null" json:"is_rtl"`
	IsDefault bool   `gorm:"column:is_default;not null" json:"is_default"`
	IsActive  bool   `gorm:"column:is_active;not null" json:"is_active"`
	SortOrder int    `gorm:"column:sort_order;not null" json:"sort_order"`
}

func (Locale) TableName() string { return "locales" }

type UITranslation struct {
	ID        string `gorm:"column:id;primaryKey" json:"id"`
	Locale    string `gorm:"column:locale;not null" json:"locale"`
	Namespace string `gorm:"column:namespace;not null" json:"namespace"`
	Key       string `gorm:"column:key;not null" json:"key"`
	Value     string `gorm:"column:value;not null" json:"value"`
}

func (UITranslation) TableName() string { return "ui_translations" }
