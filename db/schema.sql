CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS stories (
  id          SERIAL PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL DEFAULT 'Untitled',
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  published   BOOLEAN NOT NULL DEFAULT false,
  owner_student_id UUID,
  class_id    UUID,
  status      TEXT NOT NULL DEFAULT 'draft',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stories_slug ON stories (slug);
CREATE INDEX IF NOT EXISTS idx_stories_published ON stories (published) WHERE published = true;
CREATE INDEX IF NOT EXISTS idx_stories_owner ON stories (owner_student_id);
CREATE INDEX IF NOT EXISTS idx_stories_class ON stories (class_id);

CREATE TABLE IF NOT EXISTS classes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id      UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  username      TEXT NOT NULL,
  password_hash TEXT,
  password_set_at TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_admin      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, username)
);

CREATE INDEX IF NOT EXISTS idx_students_class ON students (class_id);
CREATE INDEX IF NOT EXISTS idx_students_username ON students (username);

CREATE TABLE IF NOT EXISTS site_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  category    TEXT NOT NULL DEFAULT 'other',
  filename    TEXT NOT NULL,
  storage_key TEXT,
  public_url  TEXT,
  size_bytes  BIGINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_assets_student ON student_assets (student_id);

CREATE TABLE IF NOT EXISTS common_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL DEFAULT 'other',
  filename    TEXT NOT NULL,
  storage_key TEXT,
  public_url  TEXT,
  size_bytes  BIGINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS story_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id        INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_comment TEXT,
  admin_comment   TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_story_submissions_student ON story_submissions (student_id);
CREATE INDEX IF NOT EXISTS idx_story_submissions_story ON story_submissions (story_id);

CREATE TABLE IF NOT EXISTS legal_pages (
  page        TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  body_html   TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_auth_tokens (
  token       TEXT PRIMARY KEY,
  purpose     TEXT NOT NULL DEFAULT 'student_handoff',
  student_id  UUID REFERENCES students(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_auth_tokens_expires ON platform_auth_tokens (expires_at);

CREATE TABLE IF NOT EXISTS file_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type  TEXT NOT NULL,
  asset_id    UUID NOT NULL,
  tag         TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_tags_asset ON file_tags (asset_type, asset_id);
CREATE INDEX IF NOT EXISTS idx_file_tags_tag ON file_tags (tag);

ALTER TABLE stories ADD COLUMN IF NOT EXISTS owner_student_id UUID;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS class_id UUID;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stories_owner_student_id_fkey'
  ) THEN
    ALTER TABLE stories
      ADD CONSTRAINT stories_owner_student_id_fkey
      FOREIGN KEY (owner_student_id) REFERENCES students(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stories_class_id_fkey'
  ) THEN
    ALTER TABLE stories
      ADD CONSTRAINT stories_class_id_fkey
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

INSERT INTO site_settings (key, value) VALUES
  ('site', '{"main_footer_html":"","export_help_html":"","blocked_extensions":["exe","bat","sh","cmd","com","heic","heif"],"public_template_slugs":["earth"]}'::jsonb)
ON CONFLICT (key) DO NOTHING;
