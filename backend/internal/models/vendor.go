package models

import (
	"encoding/json"
	"time"
)

// Vendor's location is stored as PostGIS GEOGRAPHY(POINT,4326). GORM has no
// built-in geography scan/value type, so it's handled with raw SQL in the
// service layer (ST_MakePoint/ST_X/ST_Y) rather than as a mapped struct
// field — see services/vendor_service.go.
type Vendor struct {
	ID          string          `gorm:"column:id;primaryKey" json:"id"`
	OwnerUserID string          `gorm:"column:owner_user_id;not null" json:"owner_user_id"`
	NameI18n    json.RawMessage `gorm:"column:name_i18n;type:jsonb;not null" json:"name_i18n"`
	// Category is the legacy free-text section label, kept only through the
	// store_categories migration transition — new code should read/write
	// StoreCategoryID instead. Drop this column in a later migration once
	// every read path (web-admin, web-vendor, mobile) is cut over.
	Category          string          `gorm:"column:category;not null" json:"category"`
	StoreCategoryID   *string         `gorm:"column:store_category_id" json:"store_category_id,omitempty"`
	Address           *string         `gorm:"column:address" json:"address,omitempty"`
	LogoURL           *string         `gorm:"column:logo_url" json:"logo_url,omitempty"`
	Timezone          string          `gorm:"column:timezone;not null" json:"timezone"`
	CommissionPct     *float64        `gorm:"column:commission_pct" json:"commission_pct,omitempty"`
	DisplayCurrency   *string         `gorm:"column:display_currency" json:"display_currency,omitempty"`
	SchedulingAllowed bool            `gorm:"column:scheduling_allowed;not null" json:"scheduling_allowed"`
	SchedulingEnabled bool            `gorm:"column:scheduling_enabled;not null" json:"scheduling_enabled"`
	SchedulingConfig  json.RawMessage `gorm:"column:scheduling_config;type:jsonb;not null" json:"scheduling_config"`
	Features          json.RawMessage `gorm:"column:features;type:jsonb;not null" json:"features"`
	IsActive          bool            `gorm:"column:is_active;not null" json:"is_active"`
	CreatedAt         time.Time       `gorm:"column:created_at;not null" json:"created_at"`

	// Longitude/Latitude/DistanceMeters are not real columns on the vendors
	// table — they're computed by ST_X/ST_Y/ST_Distance in vendor_service.go's
	// raw SQL and returned under these column aliases. They must NOT be
	// tagged gorm:"-": GORM's raw-SQL Scan path looks up destination fields
	// by column name and skips any field marked Readable=false (which is
	// exactly what gorm:"-" sets), so a "-" tag here would silently leave
	// these fields always zero-valued regardless of what the query
	// returns. Since no code path ever GORM-writes a Vendor struct (all
	// writes are raw Exec calls), giving these fields ordinary column tags
	// carries no risk of GORM trying to persist a non-existent column.
	Longitude float64 `gorm:"column:longitude" json:"longitude"`
	Latitude  float64 `gorm:"column:latitude" json:"latitude"`

	DistanceMeters *float64 `gorm:"column:distance_meters" json:"distance_meters,omitempty"`
}

func (Vendor) TableName() string { return "vendors" }

type VendorHour struct {
	ID        string `gorm:"column:id;primaryKey" json:"id"`
	VendorID  string `gorm:"column:vendor_id;not null" json:"vendor_id"`
	DayOfWeek int    `gorm:"column:day_of_week;not null" json:"day_of_week"`
	// OpenTime/CloseTime are Postgres TIME columns; scanned as strings
	// ("HH:MM:SS") since GORM/pgx don't map TIME (no date component) to a
	// convenient Go type by default.
	OpenTime  string `gorm:"column:open_time;not null" json:"open_time"`
	CloseTime string `gorm:"column:close_time;not null" json:"close_time"`
	IsClosed  bool   `gorm:"column:is_closed;not null" json:"is_closed"`
}

func (VendorHour) TableName() string { return "vendor_hours" }

type VendorHourOverride struct {
	ID        string  `gorm:"column:id;primaryKey" json:"id"`
	VendorID  string  `gorm:"column:vendor_id;not null" json:"vendor_id"`
	Date      string  `gorm:"column:date;not null" json:"date"` // DATE column, scanned as "YYYY-MM-DD"
	IsClosed  bool    `gorm:"column:is_closed;not null" json:"is_closed"`
	OpenTime  *string `gorm:"column:open_time" json:"open_time,omitempty"`
	CloseTime *string `gorm:"column:close_time" json:"close_time,omitempty"`
	Note      *string `gorm:"column:note" json:"note,omitempty"`
}

func (VendorHourOverride) TableName() string { return "vendor_hour_overrides" }
