CREATE TABLE app_configs (
    key TEXT PRIMARY KEY, value JSONB NOT NULL, description TEXT,
    updated_by UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO app_configs (key, value, description) VALUES
  ('otp_provider','"whatsapp"','sms | whatsapp'),
  ('commission_default_pct','10','default commission %'),
  ('otp_ttl_seconds','300',''), ('otp_length','6',''),
  ('storage_driver','"local"','local | s3'),
  ('base_currency','"USD"','canonical pricing currency'),
  ('default_locale','"en"','en | ar | ...');

CREATE TABLE feature_flags (
    key TEXT PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT true,
    config JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supported languages. is_rtl drives layout direction on all clients.
CREATE TABLE locales (
    code TEXT PRIMARY KEY,          -- 'en', 'ar', 'fr'
    name TEXT NOT NULL,             -- 'English', 'العربية'
    is_rtl BOOLEAN NOT NULL DEFAULT false,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0
);
INSERT INTO locales (code,name,is_rtl,is_default,sort_order) VALUES
  ('en','English',false,true,0), ('ar','العربية',true,false,1);

-- Backend-driven UI strings served to clients per locale.
CREATE TABLE ui_translations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    locale TEXT NOT NULL REFERENCES locales(code) ON DELETE CASCADE,
    namespace TEXT NOT NULL DEFAULT 'common',
    key TEXT NOT NULL, value TEXT NOT NULL,
    UNIQUE (locale, namespace, key)
);

CREATE TABLE currencies (
    code TEXT PRIMARY KEY,          -- 'USD','LBP','AED'
    symbol TEXT NOT NULL, name TEXT NOT NULL,
    decimals INT NOT NULL DEFAULT 2,
    is_active BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO currencies (code,symbol,name,decimals) VALUES
  ('USD','$','US Dollar',2), ('LBP','ل.ل','Lebanese Pound',0);

-- Rate expresses: 1 base_currency (USD) = rate units of `code`.
CREATE TABLE exchange_rates (
    code TEXT PRIMARY KEY REFERENCES currencies(code) ON DELETE CASCADE,
    rate NUMERIC(18,6) NOT NULL,
    updated_by UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO exchange_rates (code,rate) VALUES ('USD',1),('LBP',89000);
