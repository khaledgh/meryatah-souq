package otp

import "context"

// Provider sends an OTP code to a phone number over some channel (SMS,
// WhatsApp). The active provider is chosen at runtime from
// app_configs.otp_provider (blueprint §5.2, §9), with no restart required.
type Provider interface {
	// Name identifies the provider as stored in app_configs.otp_provider
	// (e.g. "sms", "whatsapp").
	Name() string
	Send(ctx context.Context, phoneE164, code string) error
}
