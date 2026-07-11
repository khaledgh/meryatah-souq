-- OTP delivery audit trail. Until this existed, a failed SMS was only
-- log.Printf'd and swallowed (RequestOTP never fails the request over a
-- dispatch error, by design — see otp_service.go), which made "the code
-- never arrived" impossible to diagnose after the fact.
--
-- The OTP code is REDACTED from `message` and `gateway_response` before they
-- are written (see redactCode in pkg/otp/sms_provider.go): this table answers
-- "was a message dispatched, and what did the gateway say", which never
-- requires the code itself. Persisting live codes in a phone-indexed table
-- that outlives their TTL would be a permanent phone -> OTP history for
-- anyone with database read access (blueprint §5.10: no secret in logs).
CREATE TABLE sms_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT NOT NULL,
    provider TEXT NOT NULL,              -- 'sms' | 'whatsapp'
    message TEXT NOT NULL,               -- body sent, with the code redacted
    success BOOLEAN NOT NULL,
    gateway_response TEXT,               -- provider reply, with the code redacted
    error TEXT,                          -- dispatch error, if any
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_logs_phone ON sms_logs (phone, created_at DESC);
