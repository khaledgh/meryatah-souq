CREATE TYPE user_role AS ENUM ('user','vendor','driver','super_admin');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT UNIQUE NOT NULL,             -- E.164 (+961...)
    phone_verified BOOLEAN NOT NULL DEFAULT false,
    first_name TEXT, last_name TEXT,
    password_hash TEXT,                     -- argon2id; null until step 2
    role user_role NOT NULL DEFAULT 'user',
    preferred_locale TEXT REFERENCES locales(code) DEFAULT 'en',
    is_active BOOLEAN NOT NULL DEFAULT true,
    failed_logins INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_phone ON users (phone);

CREATE TABLE otp_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT NOT NULL, provider TEXT NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT false, attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_otp_phone ON otp_challenges (phone, created_at DESC);

-- Refresh-token rotation store (hashed tokens only).
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,               -- sha256 of the token
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by UUID,
    created_ip TEXT, user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_user ON refresh_tokens (user_id);

CREATE TABLE push_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL, role user_role NOT NULL, platform TEXT,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, player_id)
);
CREATE INDEX idx_push_role ON push_tokens (role);

-- Security audit trail.
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID, actor_role user_role,
    action TEXT NOT NULL, entity TEXT, entity_id UUID,
    ip TEXT, meta JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_actor ON audit_logs (actor_id, created_at DESC);
