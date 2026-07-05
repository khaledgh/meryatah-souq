CREATE TYPE order_status AS ENUM
  ('pending','accepted','preparing','on_the_way','delivered','cancelled');

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    driver_id UUID REFERENCES users(id),
    status order_status NOT NULL DEFAULT 'pending',
    delivery_point GEOGRAPHY(POINT,4326) NOT NULL,
    subtotal_usd NUMERIC(12,2) NOT NULL,         -- canonical
    -- currency snapshot: what the user paid in
    currency_code TEXT NOT NULL DEFAULT 'USD',
    exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1,   -- 1 USD = rate units
    subtotal_display NUMERIC(14,2) NOT NULL,     -- subtotal_usd * exchange_rate
    commission_pct NUMERIC(5,2) NOT NULL,        -- snapshot
    commission_usd NUMERIC(12,2) NOT NULL,       -- snapshot
    coupon_id UUID,
    scheduled_for TIMESTAMPTZ,                    -- null = ASAP; set if scheduled
    placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ
);
CREATE INDEX idx_orders_vendor_day ON orders (vendor_id, placed_at);
CREATE INDEX idx_orders_driver ON orders (driver_id, status);
CREATE INDEX idx_orders_scheduled ON orders (scheduled_for) WHERE scheduled_for IS NOT NULL;

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    name TEXT NOT NULL, unit_price_usd NUMERIC(12,2) NOT NULL, quantity INT NOT NULL
);

CREATE TABLE driver_locations (
    driver_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    location GEOGRAPHY(POINT,4326) NOT NULL, heading NUMERIC,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_driver_loc ON driver_locations USING GIST (location);

CREATE TABLE ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
    driver_id UUID NOT NULL REFERENCES users(id),
    user_id UUID NOT NULL REFERENCES users(id),
    score INT NOT NULL CHECK (score BETWEEN 1 AND 5), comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE banner_ads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,   -- null = platform ad
    image_key TEXT NOT NULL, storage_driver TEXT NOT NULL,
    target_url TEXT, is_paid BOOLEAN NOT NULL DEFAULT false,
    priority INT NOT NULL DEFAULT 0,
    starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    discount_type TEXT NOT NULL, discount_val NUMERIC(12,2) NOT NULL,
    max_redemptions INT, redeemed_count INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ, is_active BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE orders
    ADD CONSTRAINT fk_orders_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id);
