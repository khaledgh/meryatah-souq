-- Multi-category marketplace taxonomy (blueprint-adjacent: turns the
-- platform into a multi-section marketplace — Food, Electronics,
-- Market/Vegetables, ...). Three admin-managed levels:
--   store_categories    — the marketplace section a vendor belongs to
--   product_categories  — global product taxonomy, self-referencing for
--                         subcategories (parent_id)
--   category_requests   — vendors REQUEST a new store/product category;
--                         only super_admin can create one directly (mirrors
--                         the vendor_applications request/approve pattern)
--
-- IMPORTANT: this does NOT touch or repurpose the existing vendor-scoped
-- `categories` table (per-store menu sections, e.g. a restaurant's
-- "Drinks"/"Mains" tabs) or `products.category_id`, which stay exactly as
-- they are. `product_categories` is a separate, new, global taxonomy.

CREATE TABLE store_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_i18n JSONB NOT NULL DEFAULT '{}',
    slug TEXT UNIQUE NOT NULL,
    template_kind TEXT NOT NULL DEFAULT 'generic'
        CHECK (template_kind IN ('food','electronics','market','generic')),
    accent_color TEXT,
    icon_key TEXT,
    storage_driver TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_store_categories_active ON store_categories (is_active, sort_order);

CREATE TABLE product_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_i18n JSONB NOT NULL DEFAULT '{}',
    slug TEXT UNIQUE NOT NULL,
    parent_id UUID REFERENCES product_categories(id) ON DELETE CASCADE,
    store_category_id UUID REFERENCES store_categories(id) ON DELETE SET NULL,
    icon_key TEXT,
    storage_driver TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_categories_parent ON product_categories (parent_id);
CREATE INDEX idx_product_categories_store_category ON product_categories (store_category_id);

CREATE TYPE category_request_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE category_request_kind AS ENUM ('store', 'product');

CREATE TABLE category_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status category_request_status NOT NULL DEFAULT 'pending',
    kind category_request_kind NOT NULL,
    requested_by_user_id UUID NOT NULL REFERENCES users(id),
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    name_i18n JSONB NOT NULL DEFAULT '{}',
    parent_id UUID REFERENCES product_categories(id),
    notes TEXT,
    reject_reason TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_category_id UUID,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_category_requests_status ON category_requests (status, submitted_at);

-- Additive global product-category link (does not touch the existing
-- vendor-scoped products.category_id).
ALTER TABLE products
    ADD COLUMN product_category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL;

-- vendors.category (free text) -> store_categories FK, additive: the old
-- column is kept through the transition (dropped in a later migration once
-- every read path is cut over to store_category_id).
ALTER TABLE vendors
    ADD COLUMN store_category_id UUID REFERENCES store_categories(id);

INSERT INTO store_categories (name_i18n, slug, template_kind, sort_order) VALUES
  ('{"en":"Grocery","ar":"بقالة"}', 'grocery', 'market', 0),
  ('{"en":"Pharmacy","ar":"صيدلية"}', 'pharmacy', 'generic', 1),
  ('{"en":"Restaurant","ar":"مطعم"}', 'restaurant', 'food', 2),
  ('{"en":"Clothing","ar":"ملابس"}', 'clothing', 'generic', 3),
  ('{"en":"Other","ar":"أخرى"}', 'other', 'generic', 99)
ON CONFLICT (slug) DO NOTHING;

-- Seed one store_categories row per any existing vendors.category value not
-- already covered by the known set above, so every vendor can be matched.
INSERT INTO store_categories (name_i18n, slug, template_kind, sort_order)
SELECT jsonb_build_object('en', initcap(lower(trim(v.category)))),
       lower(trim(v.category)),
       'generic',
       50
FROM vendors v
WHERE v.category IS NOT NULL AND trim(v.category) <> ''
  AND lower(trim(v.category)) NOT IN (SELECT slug FROM store_categories)
GROUP BY lower(trim(v.category))
ON CONFLICT (slug) DO NOTHING;

-- Backfill: match every vendor's free-text category to its slug.
UPDATE vendors v
SET store_category_id = sc.id
FROM store_categories sc
WHERE v.store_category_id IS NULL
  AND v.category IS NOT NULL
  AND lower(trim(v.category)) = sc.slug;

-- Fallback: anything still unmatched (blank/null category) goes to "other".
UPDATE vendors v
SET store_category_id = sc.id
FROM store_categories sc
WHERE v.store_category_id IS NULL AND sc.slug = 'other';

CREATE INDEX idx_vendors_store_category ON vendors (store_category_id);
