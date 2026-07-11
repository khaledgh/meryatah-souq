-- OTP delivery audit trail. Until this existed, a failed SMS was only
-- log.Printf'd and swallowed (RequestOTP never fails the request over a
-- dispatch error, by design — see otp_service.go), which made "the code
-- never arrived" impossible to diagnose after the fact.
--
-- SECURITY: `message` contains the live OTP code for the duration of its
-- TTL (default 5 min). This table is therefore as sensitive as the Redis
-- code store — restrict reads to super_admin, and prune old rows.
CREATE TABLE sms_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT NOT NULL,
    provider TEXT NOT NULL,              -- 'sms' | 'whatsapp'
    message TEXT NOT NULL,               -- body actually sent to the gateway
    success BOOLEAN NOT NULL,
    gateway_response TEXT,               -- raw provider reply, for debugging
    error TEXT,                          -- dispatch error, if any
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_logs_phone ON sms_logs (phone, created_at DESC);
