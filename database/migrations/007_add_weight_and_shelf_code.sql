-- Migration: Add product weight and shelf code (store-scoped)
-- Safely adds new columns and a uniqueness guarantee scoped to store

BEGIN;

-- 1) Product weight: required, defaults to 1.00 gram
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS weight DECIMAL(10,2) NOT NULL DEFAULT 1.00;

COMMENT ON COLUMN products.weight IS 'Weight in grams for the product. Required. Default is 1.00 gram.';

-- 2) Shelf code: optional, only used for location-based mini-apps (store-scoped)
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS shelf_code VARCHAR(50) NULL;

COMMENT ON COLUMN products.shelf_code IS 'Store-specific shelf/bin code. NULL for non-store-based mini-apps. Uniqueness is enforced per store.';

-- 3) Uniqueness per store (ignore NULLs)
--    Postgres unique index allows multiple NULLs; use a partial index to only enforce when both are present
CREATE UNIQUE INDEX IF NOT EXISTS ux_products_store_shelf_code
    ON products (store_id, shelf_code)
    WHERE store_id IS NOT NULL AND shelf_code IS NOT NULL;

COMMIT;

