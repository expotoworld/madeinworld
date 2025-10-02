-- Migration: Add Author role; create ebooks and ebook_versions; unique email index
-- Applies to Neon dev branch and should be safe to run multiple times with IF NOT EXISTS

-- 1) Add 'Author' to user_role enum
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Author';

-- 2) ebooks (singleton row with slug='main')
CREATE TABLE IF NOT EXISTS ebooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL DEFAULT 'main',
    title VARCHAR(255),
    content JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed singleton row
INSERT INTO ebooks (slug, title, content)
VALUES ('main', 'Main Ebook', '{}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- 3) ebook_versions (autosave | manual | published)
CREATE TABLE IF NOT EXISTS ebook_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ebook_id UUID NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('autosave','manual','published')),
    s3_key VARCHAR(1024) NOT NULL,
    label VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_ebook_versions_ebook_id ON ebook_versions(ebook_id);
CREATE INDEX IF NOT EXISTS idx_ebook_versions_kind ON ebook_versions(kind);

-- 4) Enforce unique emails to avoid ambiguity in passwordless flows
-- (allows multiple NULLs; fails if duplicates exist, so check before applying)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL;

