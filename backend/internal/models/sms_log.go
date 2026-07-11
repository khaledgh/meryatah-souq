package models

import "time"

// SMSLog is the delivery audit trail for OTP messages (migration 000011).
//
// SECURITY: Message holds the live OTP code for the length of its TTL, so
// this table is as sensitive as the Redis code store — it is never exposed
// on a client-facing route.
type SMSLog struct {
	ID              string    `gorm:"column:id;primaryKey" json:"id"`
	Phone           string    `gorm:"column:phone;not null" json:"phone"`
	Provider        string    `gorm:"column:provider;not null" json:"provider"`
	Message         string    `gorm:"column:message;not null" json:"message"`
	Success         bool      `gorm:"column:success;not null" json:"success"`
	GatewayResponse *string   `gorm:"column:gateway_response" json:"gateway_response,omitempty"`
	Error           *string   `gorm:"column:error" json:"error,omitempty"`
	CreatedAt       time.Time `gorm:"column:created_at;not null" json:"created_at"`
}

func (SMSLog) TableName() string { return "sms_logs" }
