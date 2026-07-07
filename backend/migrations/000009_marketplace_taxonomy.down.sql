DROP INDEX IF EXISTS idx_vendors_store_category;
ALTER TABLE vendors DROP COLUMN IF EXISTS store_category_id;
ALTER TABLE products DROP COLUMN IF EXISTS product_category_id;

DROP TABLE IF EXISTS category_requests;
DROP TYPE IF EXISTS category_request_kind;
DROP TYPE IF EXISTS category_request_status;

DROP TABLE IF EXISTS product_categories;
DROP TABLE IF EXISTS store_categories;
