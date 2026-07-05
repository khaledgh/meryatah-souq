package models

import "time"

type BannerAd struct {
	ID            string     `gorm:"column:id;primaryKey" json:"id"`
	VendorID      *string    `gorm:"column:vendor_id" json:"vendor_id,omitempty"`
	ImageKey      string     `gorm:"column:image_key;not null" json:"-"`
	StorageDriver string     `gorm:"column:storage_driver;not null" json:"storage_driver"`
	TargetURL     *string    `gorm:"column:target_url" json:"target_url,omitempty"`
	IsPaid        bool       `gorm:"column:is_paid;not null" json:"is_paid"`
	PriceUSD      *float64   `gorm:"column:price_usd" json:"price_usd,omitempty"`
	Priority      int        `gorm:"column:priority;not null" json:"priority"`
	StartsAt      *time.Time `gorm:"column:starts_at" json:"starts_at,omitempty"`
	EndsAt        *time.Time `gorm:"column:ends_at" json:"ends_at,omitempty"`
	IsActive      bool       `gorm:"column:is_active;not null" json:"is_active"`

	// ImageURL is resolved at read time from ImageKey/StorageDriver via the
	// storage registry, same pattern as ProductImage.URL — set by plain Go
	// assignment, never via a raw-SQL alias, so gorm:"-" is safe here.
	ImageURL string `gorm:"-" json:"image_url,omitempty"`
}

func (BannerAd) TableName() string { return "banner_ads" }

type Coupon struct {
	ID             string     `gorm:"column:id;primaryKey" json:"id"`
	VendorID       *string    `gorm:"column:vendor_id" json:"vendor_id,omitempty"`
	Code           string     `gorm:"column:code;not null" json:"code"`
	DiscountType   string     `gorm:"column:discount_type;not null" json:"discount_type"`
	DiscountVal    float64    `gorm:"column:discount_val;not null" json:"discount_val"`
	MaxRedemptions *int       `gorm:"column:max_redemptions" json:"max_redemptions,omitempty"`
	RedeemedCount  int        `gorm:"column:redeemed_count;not null" json:"redeemed_count"`
	StartsAt       *time.Time `gorm:"column:starts_at" json:"starts_at,omitempty"`
	ExpiresAt      *time.Time `gorm:"column:expires_at" json:"expires_at,omitempty"`
	IsActive       bool       `gorm:"column:is_active;not null" json:"is_active"`
}

func (Coupon) TableName() string { return "coupons" }

type Rating struct {
	ID        string    `gorm:"column:id;primaryKey" json:"id"`
	OrderID   string    `gorm:"column:order_id;not null" json:"order_id"`
	DriverID  string    `gorm:"column:driver_id;not null" json:"driver_id"`
	UserID    string    `gorm:"column:user_id;not null" json:"user_id"`
	Score     int       `gorm:"column:score;not null" json:"score"`
	Comment   *string   `gorm:"column:comment" json:"comment,omitempty"`
	CreatedAt time.Time `gorm:"column:created_at;not null" json:"created_at"`
}

func (Rating) TableName() string { return "ratings" }
