CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_user_id UUID NOT NULL REFERENCES users(id),
    name_i18n JSONB NOT NULL DEFAULT '{}',       -- {"en":"...","ar":"..."}
    category TEXT NOT NULL,
    location GEOGRAPHY(POINT,4326) NOT NULL,
    address TEXT, logo_url TEXT,
    timezone TEXT NOT NULL DEFAULT 'Asia/Beirut',
    commission_pct NUMERIC(5,2),                 -- null -> app default
    display_currency TEXT REFERENCES currencies(code) DEFAULT 'USD',
    -- scheduling: admin GRANTS capability, vendor ENABLES it
    scheduling_allowed BOOLEAN NOT NULL DEFAULT false,  -- set by admin
    scheduling_enabled BOOLEAN NOT NULL DEFAULT false,  -- set by vendor (only if allowed)
    scheduling_config JSONB NOT NULL DEFAULT '{}',      -- {slot_minutes, lead_minutes, max_days_ahead, max_per_slot}
    features JSONB NOT NULL DEFAULT '{}',               -- per-vendor overrides
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vendors_location ON vendors USING GIST (location);
CREATE INDEX idx_vendors_category ON vendors (category);

-- Weekly recurring hours (multiple rows per day allow split shifts).
CREATE TABLE vendor_hours (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun
    open_time TIME NOT NULL, close_time TIME NOT NULL,
    is_closed BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_hours_vendor ON vendor_hours (vendor_id, day_of_week);

-- Date-specific overrides (holidays, special hours).
CREATE TABLE vendor_hour_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    is_closed BOOLEAN NOT NULL DEFAULT false,
    open_time TIME, close_time TIME,
    note TEXT, UNIQUE (vendor_id, date)
);

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    name_i18n JSONB NOT NULL DEFAULT '{}', sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name_i18n JSONB NOT NULL DEFAULT '{}',
    description_i18n JSONB NOT NULL DEFAULT '{}',
    price_usd NUMERIC(12,2) NOT NULL,           -- canonical price in base currency
    stock INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_vendor ON products (vendor_id);

-- Product images stored via the storage abstraction (local or s3).
CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    storage_driver TEXT NOT NULL,               -- 'local' | 's3' (where THIS file lives)
    object_key TEXT NOT NULL,                    -- path/key within that driver
    sort_order INT NOT NULL DEFAULT 0
);
