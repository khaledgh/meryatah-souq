package otp

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// upsilonSMSURL is the SMS gateway endpoint (Upsilon Communications). TLS
// certificate verification uses Go's default trust store — never disabled,
// unlike the legacy PHP integration this replaces which set
// CURLOPT_SSL_VERIFYPEER=false.
const upsilonSMSURL = "https://smsapi.upsilonlb.com/"

// SMSLogger records what was actually dispatched to the gateway (migration
// 000011 sms_logs). Kept as an interface here so this package stays a pure
// gateway client with no database dependency; services wires the concrete
// implementation in. Implementations must never block the send path for
// long and must swallow their own errors — a failure to write the audit
// row must not fail an OTP the user is waiting on.
type SMSLogger interface {
	LogSMS(ctx context.Context, phone, provider, message string, success bool, gatewayResponse, sendErr string)
}

// SMSProvider sends OTP codes via the Upsilon SMS gateway. Credentials come
// from SMS_USERNAME/SMS_PASSWORD/SMS_SENDER_ID (blueprint §5: no secret
// hardcoded in source) — never logged, since apperror.Internal's cause is
// not serialized to clients and this package never logs the raw error text
// itself (the caller decides what, if anything, to log).
type SMSProvider struct {
	username string
	password string
	senderID string
	client   *http.Client
	logger   SMSLogger // optional; nil disables the audit trail
}

func NewSMSProvider(username, password, senderID string, logger SMSLogger) *SMSProvider {
	return &SMSProvider{
		username: username,
		password: password,
		senderID: senderID,
		client:   &http.Client{Timeout: 10 * time.Second},
		logger:   logger,
	}
}

func (p *SMSProvider) Name() string { return "sms" }

// upsilonResponse mirrors the gateway's {"Response":["OK - ..."]} /
// {"Response":["ERROR - ..."]} shape. Any element containing "ERROR" means
// the send failed even though the HTTP call itself succeeded (200 OK).
type upsilonResponse struct {
	Response []string `json:"Response"`
}

// Send dispatches the code and records the attempt via SMSLogger. Every
// return path is audited (via the deferred write on the named return), so a
// silent non-delivery — the failure mode that made "the code never arrived"
// undiagnosable before this — always leaves a row behind.
func (p *SMSProvider) Send(ctx context.Context, phoneE164, code string) (err error) {
	message := fmt.Sprintf("Your Meryata Souq verification code is %s", code)
	// What gets AUDITED is the message with the code redacted. The audit trail
	// exists to answer "was an SMS dispatched, and what did the gateway say" —
	// it never needs the code itself, and persisting live codes in a
	// phone-indexed table that outlives their 5-minute TTL would hand anyone
	// with database read access a permanent phone -> OTP history (blueprint
	// §5.10: no secret in logs).
	auditMessage := redactCode(message, code)
	var gatewayResponse string

	defer func() {
		if p.logger == nil {
			return
		}
		sendErr := ""
		if err != nil {
			sendErr = err.Error()
		}
		// The gateway's reply can echo the submitted text, so redact it too.
		p.logger.LogSMS(ctx, phoneE164, p.Name(), auditMessage, err == nil, redactCode(gatewayResponse, code), sendErr)
	}()

	if p.username == "" || p.password == "" {
		return fmt.Errorf("otp: sms provider not configured (SMS_USERNAME/SMS_PASSWORD unset)")
	}

	mno, ok := toUpsilonMSISDN(phoneE164)
	if !ok {
		return fmt.Errorf("otp: sms provider: %q is not a sendable phone number", phoneE164)
	}

	q := url.Values{
		"user":       {p.username},
		"pass":       {p.password},
		"mno":        {mno},
		"text":       {message},
		"respformat": {"json"},
	}
	if p.senderID != "" {
		q.Set("sid", p.senderID)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, upsilonSMSURL+"?"+q.Encode(), nil)
	if err != nil {
		return fmt.Errorf("otp: sms provider: build request: %w", err)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("otp: sms provider: request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if err != nil {
		return fmt.Errorf("otp: sms provider: read response: %w", err)
	}
	gatewayResponse = string(body)

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("otp: sms provider: gateway returned status %d", resp.StatusCode)
	}

	var parsed upsilonResponse
	if jsonErr := json.Unmarshal(body, &parsed); jsonErr != nil {
		// The gateway's error responses aren't always valid JSON in every
		// failure mode observed from the legacy integration — fall back to
		// a raw substring check rather than treating an unparsable body as
		// success.
		if strings.Contains(strings.ToUpper(gatewayResponse), "ERROR") {
			return fmt.Errorf("otp: sms provider: gateway rejected the message")
		}
		return fmt.Errorf("otp: sms provider: unexpected response format")
	}
	for _, line := range parsed.Response {
		if strings.Contains(strings.ToUpper(line), "ERROR") {
			return fmt.Errorf("otp: sms provider: gateway rejected the message")
		}
	}
	return nil
}

// redactCode removes a live OTP code from text bound for the audit trail.
// Empty code is a no-op guard so a bug elsewhere can't cause every character
// to be masked.
func redactCode(text, code string) string {
	if text == "" || code == "" {
		return text
	}
	return strings.ReplaceAll(text, code, "******")
}

// toUpsilonMSISDN converts an E.164 number (e.g. "+9613123456") to the bare
// digit MSISDN Upsilon expects (e.g. "9613123456") — country code, no
// leading "+".
func toUpsilonMSISDN(phoneE164 string) (string, bool) {
	trimmed := strings.TrimPrefix(phoneE164, "+")
	if trimmed == "" || trimmed == phoneE164 {
		return "", false
	}
	for _, r := range trimmed {
		if r < '0' || r > '9' {
			return "", false
		}
	}
	return trimmed, true
}
