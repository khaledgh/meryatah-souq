package models

import "time"

type OrderStatus string

const (
	OrderStatusPending   OrderStatus = "pending"
	OrderStatusAccepted  OrderStatus = "accepted"
	OrderStatusPreparing OrderStatus = "preparing"
	OrderStatusOnTheWay  OrderStatus = "on_the_way"
	OrderStatusDelivered OrderStatus = "delivered"
	OrderStatusCancelled OrderStatus = "cancelled"
)

// Order's delivery_point is PostGIS GEOGRAPHY, handled via raw SQL (see
// services/order_service.go), same pattern as Vendor.location.
type Order struct {
	ID              string      `gorm:"column:id;primaryKey" json:"id"`
	UserID          string      `gorm:"column:user_id;not null" json:"user_id"`
	VendorID        string      `gorm:"column:vendor_id;not null" json:"vendor_id"`
	DriverID        *string     `gorm:"column:driver_id" json:"driver_id,omitempty"`
	Status          OrderStatus `gorm:"column:status;not null" json:"status"`
	SubtotalUSD     float64     `gorm:"column:subtotal_usd;not null" json:"subtotal_usd"`
	CurrencyCode    string      `gorm:"column:currency_code;not null" json:"currency_code"`
	ExchangeRate    float64     `gorm:"column:exchange_rate;not null" json:"exchange_rate"`
	SubtotalDisplay float64     `gorm:"column:subtotal_display;not null" json:"subtotal_display"`
	CommissionPct   float64     `gorm:"column:commission_pct;not null" json:"commission_pct"`
	CommissionUSD   float64     `gorm:"column:commission_usd;not null" json:"commission_usd"`
	CouponID        *string     `gorm:"column:coupon_id" json:"coupon_id,omitempty"`
	ScheduledFor    *time.Time  `gorm:"column:scheduled_for" json:"scheduled_for,omitempty"`
	PlacedAt        time.Time   `gorm:"column:placed_at;not null" json:"placed_at"`
	DeliveredAt     *time.Time  `gorm:"column:delivered_at" json:"delivered_at,omitempty"`

	// DeliveryLongitude/DeliveryLatitude are populated by raw ST_X/ST_Y at
	// read time, matching the Vendor.Longitude/Latitude pattern (real
	// column tags, never gorm:"-", since Phase 5 established that gorm:"-"
	// silently breaks GORM's raw-SQL Scan destination mapping).
	DeliveryLongitude float64     `gorm:"column:delivery_longitude" json:"delivery_longitude"`
	DeliveryLatitude  float64     `gorm:"column:delivery_latitude" json:"delivery_latitude"`
	Items             []OrderItem `gorm:"-" json:"items,omitempty"`
}

func (Order) TableName() string { return "orders" }

type OrderItem struct {
	ID           string  `gorm:"column:id;primaryKey" json:"id"`
	OrderID      string  `gorm:"column:order_id;not null" json:"order_id"`
	ProductID    string  `gorm:"column:product_id;not null" json:"product_id"`
	Name         string  `gorm:"column:name;not null" json:"name"`
	UnitPriceUSD float64 `gorm:"column:unit_price_usd;not null" json:"unit_price_usd"`
	Quantity     int     `gorm:"column:quantity;not null" json:"quantity"`
}

func (OrderItem) TableName() string { return "order_items" }

type OrderTrackingHistory struct {
	ID         string    `gorm:"column:id;primaryKey" json:"id"`
	OrderID    string    `gorm:"column:order_id;not null" json:"order_id"`
	DriverID   string    `gorm:"column:driver_id;not null" json:"driver_id"`
	Latitude   float64   `gorm:"column:latitude;not null" json:"latitude"`
	Longitude  float64   `gorm:"column:longitude;not null" json:"longitude"`
	Heading    float64   `gorm:"column:heading;default:0" json:"heading"`
	RecordedAt time.Time `gorm:"column:recorded_at;not null" json:"recorded_at"`
}

func (OrderTrackingHistory) TableName() string { return "order_tracking_history" }

