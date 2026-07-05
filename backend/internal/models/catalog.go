package models

import (
	"encoding/json"
	"time"
)

type Category struct {
	ID        string          `gorm:"column:id;primaryKey" json:"id"`
	VendorID  string          `gorm:"column:vendor_id;not null" json:"vendor_id"`
	NameI18n  json.RawMessage `gorm:"column:name_i18n;type:jsonb;not null" json:"name_i18n"`
	SortOrder int             `gorm:"column:sort_order;not null" json:"sort_order"`
}

func (Category) TableName() string { return "categories" }

type Product struct {
	ID              string          `gorm:"column:id;primaryKey" json:"id"`
	VendorID        string          `gorm:"column:vendor_id;not null" json:"vendor_id"`
	CategoryID      *string         `gorm:"column:category_id" json:"category_id,omitempty"`
	NameI18n        json.RawMessage `gorm:"column:name_i18n;type:jsonb;not null" json:"name_i18n"`
	DescriptionI18n json.RawMessage `gorm:"column:description_i18n;type:jsonb;not null" json:"description_i18n"`
	PriceUSD        float64         `gorm:"column:price_usd;not null" json:"price_usd"`
	Stock           int             `gorm:"column:stock;not null" json:"stock"`
	IsActive        bool            `gorm:"column:is_active;not null" json:"is_active"`
	CreatedAt       time.Time       `gorm:"column:created_at;not null" json:"created_at"`
}

func (Product) TableName() string { return "products" }

type ProductImage struct {
	ID            string `gorm:"column:id;primaryKey" json:"id"`
	ProductID     string `gorm:"column:product_id;not null" json:"product_id"`
	StorageDriver string `gorm:"column:storage_driver;not null" json:"storage_driver"`
	ObjectKey     string `gorm:"column:object_key;not null" json:"-"`
	SortOrder     int    `gorm:"column:sort_order;not null" json:"sort_order"`

	// URL is populated at read time by resolving ObjectKey against the
	// driver named in StorageDriver (not the currently active driver),
	// per blueprint §4.4's compatibility guarantee. Not a real column.
	URL string `gorm:"-" json:"url,omitempty"`
}

func (ProductImage) TableName() string { return "product_images" }
