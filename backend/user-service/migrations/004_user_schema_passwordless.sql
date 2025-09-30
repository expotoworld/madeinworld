-- Migration: Transition users table to passwordless auth, add middle_name, reintroduce nullable phone

-- Add middle_name column (nullable)
ALTER TABLE users ADD COLUMN IF NOT EXISTS middle_name TEXT;

-- Reintroduce phone column (nullable)
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Ensure name fields have no default 'N/A' values at the schema level
ALTER TABLE users ALTER COLUMN first_name DROP DEFAULT;
ALTER TABLE users ALTER COLUMN last_name DROP DEFAULT;
ALTER TABLE users ALTER COLUMN middle_name DROP DEFAULT;

-- Ensure name fields are nullable
ALTER TABLE users ALTER COLUMN first_name DROP NOT NULL;
ALTER TABLE users ALTER COLUMN last_name DROP NOT NULL;
ALTER TABLE users ALTER COLUMN middle_name DROP NOT NULL;

-- Data cleanup: convert legacy 'N/A' placeholders to NULL
UPDATE users SET first_name = NULL WHERE first_name = 'N/A';
UPDATE users SET middle_name = NULL WHERE middle_name = 'N/A';
UPDATE users SET last_name = NULL WHERE last_name = 'N/A';

-- Ensure last_login exists (nullable)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- Remove password_hash column (passwordless)
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

-- Note: Down migration (manual): to rollback, re-add password_hash TEXT NULL,
-- and optionally set default 'N/A' on name columns if desired.
