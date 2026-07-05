-- Admin dashboard CRUD extensions (blueprint §11.A8 banner ads price/schedule,
-- §11.A9 coupon scheduling). Adds fields the admin editor needs but the
-- original tables lacked: a monetary price for paid banner ads (canonical
-- USD per §7) and a schedule start for coupons (they previously had only an
-- expiry). banner_ads already has starts_at/ends_at; coupons only had
-- expires_at.

ALTER TABLE banner_ads
    ADD COLUMN price_usd NUMERIC(12,2);

ALTER TABLE coupons
    ADD COLUMN starts_at TIMESTAMPTZ;
