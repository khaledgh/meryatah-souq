package models

import (
	"encoding/json"
	"time"
)

// StoreCategory is the admin-managed marketplace section a vendor belongs
// to (Food, Electronics, Market, ...). TemplateKind drives which page
// template the mobile app renders for vendors in this section; AccentColor
// is an optional per-section theme accent (mobile falls back to its default
// when unset). Icon storage mirrors BannerAd's pattern (IconKey +
// StorageDriver, computed IconURL) — never a plain URL string.
type StoreCategory struct {
	ID            string          `gorm:"column:id;primaryKey" json:"id"`
	NameI18n      json.RawMessage `gorm:"column:name_i18n;type:jsonb;not null" json:"name_i18n"`
	Slug          string          `gorm:"column:slug;not null" json:"slug"`
	TemplateKind  string          `gorm:"column:template_kind;not null" json:"template_kind"`
	AccentColor   *string         `gorm:"column:accent_color" json:"accent_color,omitempty"`
	IconKey       *string         `gorm:"column:icon_key" json:"-"`
	StorageDriver *string         `gorm:"column:storage_driver" json:"-"`
	SortOrder     int             `gorm:"column:sort_order;not null" json:"sort_order"`
	IsActive      bool            `gorm:"column:is_active;not null" json:"is_active"`
	CreatedAt     time.Time       `gorm:"column:created_at;not null" json:"created_at"`

	// IconURL is resolved at read time from IconKey/StorageDriver via the
	// storage registry, same pattern as BannerAd.ImageURL — set by plain Go
	// assignment, never via a raw-SQL alias, so gorm:"-" is safe here.
	IconURL string `gorm:"-" json:"icon_url,omitempty"`
}

func (StoreCategory) TableName() string { return "store_categories" }

// ProductCategory is the admin-managed global product taxonomy (Drinks,
// Laptops, Leafy Greens, ...). ParentID is set for a subcategory
// (self-referencing); StoreCategoryID optionally links it to a marketplace
// section. This is entirely separate from the existing vendor-scoped
// `categories` table (per-store menu sections) — do not confuse the two.
type ProductCategory struct {
	ID              string          `gorm:"column:id;primaryKey" json:"id"`
	NameI18n        json.RawMessage `gorm:"column:name_i18n;type:jsonb;not null" json:"name_i18n"`
	Slug            string          `gorm:"column:slug;not null" json:"slug"`
	ParentID        *string         `gorm:"column:parent_id" json:"parent_id,omitempty"`
	StoreCategoryID *string         `gorm:"column:store_category_id" json:"store_category_id,omitempty"`
	IconKey         *string         `gorm:"column:icon_key" json:"-"`
	StorageDriver   *string         `gorm:"column:storage_driver" json:"-"`
	SortOrder       int             `gorm:"column:sort_order;not null" json:"sort_order"`
	IsActive        bool            `gorm:"column:is_active;not null" json:"is_active"`
	CreatedAt       time.Time       `gorm:"column:created_at;not null" json:"created_at"`

	// IconURL is resolved at read time, same pattern as StoreCategory.IconURL.
	IconURL string `gorm:"-" json:"icon_url,omitempty"`
}

func (ProductCategory) TableName() string { return "product_categories" }

type CategoryRequestStatus string

const (
	CategoryRequestPending  CategoryRequestStatus = "pending"
	CategoryRequestApproved CategoryRequestStatus = "approved"
	CategoryRequestRejected CategoryRequestStatus = "rejected"
)

type CategoryRequestKind string

const (
	CategoryRequestKindStore   CategoryRequestKind = "store"
	CategoryRequestKindProduct CategoryRequestKind = "product"
)

// CategoryRequest is a vendor's request for a new store or product category
// (vendors can only request — never create directly). Mirrors the
// VendorApplication request/approve shape: approval creates the requested
// category row and links it back via CreatedCategoryID.
type CategoryRequest struct {
	ID                string                `gorm:"column:id;primaryKey" json:"id"`
	Status            CategoryRequestStatus `gorm:"column:status;not null" json:"status"`
	Kind              CategoryRequestKind   `gorm:"column:kind;not null" json:"kind"`
	RequestedByUserID string                `gorm:"column:requested_by_user_id;not null" json:"requested_by_user_id"`
	VendorID          *string               `gorm:"column:vendor_id" json:"vendor_id,omitempty"`
	NameI18n          json.RawMessage       `gorm:"column:name_i18n;type:jsonb;not null" json:"name_i18n"`
	ParentID          *string               `gorm:"column:parent_id" json:"parent_id,omitempty"`
	Notes             *string               `gorm:"column:notes" json:"notes,omitempty"`
	RejectReason      *string               `gorm:"column:reject_reason" json:"reject_reason,omitempty"`
	ReviewedBy        *string               `gorm:"column:reviewed_by" json:"reviewed_by,omitempty"`
	ReviewedAt        *time.Time            `gorm:"column:reviewed_at" json:"reviewed_at,omitempty"`
	CreatedCategoryID *string               `gorm:"column:created_category_id" json:"created_category_id,omitempty"`
	SubmittedAt       time.Time             `gorm:"column:submitted_at;not null" json:"submitted_at"`
}

func (CategoryRequest) TableName() string { return "category_requests" }
