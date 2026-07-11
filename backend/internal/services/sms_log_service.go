package services

import (
	"context"
	"log"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/models"
)

// SMSLogService persists the OTP delivery audit trail (migration 000011).
// Implements otp.SMSLogger.
type SMSLogService struct {
	db *gorm.DB
}

func NewSMSLogService(db *gorm.DB) *SMSLogService {
	return &SMSLogService{db: db}
}

// LogSMS records one dispatch attempt. It deliberately returns nothing and
// swallows its own error: this runs on the OTP send path, and failing to
// write an audit row must never fail the OTP the user is waiting on. A
// write failure is itself logged so the gap is visible.
func (s *SMSLogService) LogSMS(ctx context.Context, phone, provider, message string, success bool, gatewayResponse, sendErr string) {
	row := models.SMSLog{
		ID:       newUUID(),
		Phone:    phone,
		Provider: provider,
		Message:  message,
		Success:  success,
	}
	if gatewayResponse != "" {
		row.GatewayResponse = &gatewayResponse
	}
	if sendErr != "" {
		row.Error = &sendErr
	}

	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		log.Printf("sms_log: could not record dispatch to %s (success=%t): %v", phone, success, err)
	}
}
