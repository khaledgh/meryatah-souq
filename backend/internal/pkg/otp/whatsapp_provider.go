package otp

import (
	"context"
	"fmt"
)

// WhatsAppProvider sends OTP codes via the WhatsApp Business API. The
// concrete HTTP integration is intentionally minimal — swap Send's body
// for Meta's Cloud API contract once credentials exist; the interface
// boundary (blueprint §5.2, §9) is what matters for Phase 3.
type WhatsAppProvider struct {
	apiKey string
}

func NewWhatsAppProvider(apiKey string) *WhatsAppProvider {
	return &WhatsAppProvider{apiKey: apiKey}
}

func (p *WhatsAppProvider) Name() string { return "whatsapp" }

func (p *WhatsAppProvider) Send(ctx context.Context, phoneE164, code string) error {
	if p.apiKey == "" {
		return fmt.Errorf("otp: whatsapp provider not configured (WHATSAPP_API_KEY unset)")
	}
	// TODO: call the WhatsApp Business Cloud API with p.apiKey, phoneE164,
	// and a template message containing code. Left unimplemented pending
	// Meta Business account setup.
	return fmt.Errorf("otp: whatsapp provider not yet implemented")
}
