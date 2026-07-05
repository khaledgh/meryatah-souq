package otp

import (
	"context"
	"fmt"
)

// SMSProvider sends OTP codes via a generic SMS gateway API. The concrete
// HTTP integration is intentionally minimal — swap Send's body for the
// specific gateway's API contract once one is chosen; the interface
// boundary (blueprint §5.2, §9) is what matters for Phase 3.
type SMSProvider struct {
	apiKey string
}

func NewSMSProvider(apiKey string) *SMSProvider {
	return &SMSProvider{apiKey: apiKey}
}

func (p *SMSProvider) Name() string { return "sms" }

func (p *SMSProvider) Send(ctx context.Context, phoneE164, code string) error {
	if p.apiKey == "" {
		return fmt.Errorf("otp: sms provider not configured (SMS_API_KEY unset)")
	}
	// TODO: call the chosen SMS gateway's API with p.apiKey, phoneE164, and
	// a message containing code. Left unimplemented pending gateway choice.
	return fmt.Errorf("otp: sms provider not yet implemented")
}
