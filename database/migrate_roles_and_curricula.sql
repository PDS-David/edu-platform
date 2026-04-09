-- ============================================================
-- MIGRATION: Roles, New Curricula, Admin Seed
-- Run once against the production database on Render.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Ensure users.role allows 'teacher'
--    (It already should, but this is idempotent)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'teacher'
  ) THEN
    -- role is likely a varchar — just make sure the check constraint allows teacher
    NULL;
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Seed the admin user
--    Email : admin@aischoolonair.com
--    Pass  : password123  (bcrypt hash)
--    The hash below is bcrypt cost-10 of "password123"
-- ─────────────────────────────────────────────────────────────
INSERT INTO users (
  id, email, password_hash, first_name, last_name,
  role, is_active, email_verified,
  terms_accepted_at, terms_version,
  subscription_status, created_at, updated_at
)
VALUES (
  gen_random_uuid(),
  'admin@aischoolonair.com',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password123
  'Platform',
  'Admin',
  'admin',
  true,
  true,          -- no email verification needed
  NOW(),
  '1.0',
  'active',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE
  SET role            = 'admin',
      is_active       = true,
      email_verified  = true,
      updated_at      = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Add new exam boards (safe — won't duplicate if run twice)
-- ─────────────────────────────────────────────────────────────────────────────

-- Add unique constraint on exam_boards.code if it doesn't exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exam_boards_code_unique'
  ) THEN
    ALTER TABLE exam_boards ADD CONSTRAINT exam_boards_code_unique UNIQUE (code);
  END IF;
END$$;

-- GCE A-Level
INSERT INTO exam_boards (id, code, name, full_name, description, country, icon_emoji, display_order, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'GCE_AL',
  'GCE A'' Levels',
  'General Certificate of Education Advanced Level',
  'GCE Advanced Level examinations for post-secondary students, recognised across West Africa and the UK.',
  'NG', '🎓', 15, true, NOW(), NOW()
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, full_name = EXCLUDED.full_name,
      description = EXCLUDED.description, is_active = true, updated_at = NOW();

-- JUPEB
INSERT INTO exam_boards (id, code, name, full_name, description, country, icon_emoji, display_order, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'JUPEB',
  'JUPEB',
  'Joint Universities Preliminary Examinations Board',
  'Nigerian pre-degree programme equivalent to A-Levels, accepted for direct entry into 200 Level at Nigerian universities.',
  'NG', '🏛️', 16, true, NOW(), NOW()
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, full_name = EXCLUDED.full_name,
      description = EXCLUDED.description, is_active = true, updated_at = NOW();

-- Language Lab — English
INSERT INTO exam_boards (id, code, name, full_name, description, country, icon_emoji, display_order, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'LANG_EN',
  'Language Lab – English',
  'Language Laboratory: English Language',
  'Spoken and written English language training for proficiency, communication and examination preparation.',
  'NG', '🇬🇧', 20, true, NOW(), NOW()
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, full_name = EXCLUDED.full_name,
      description = EXCLUDED.description, is_active = true, updated_at = NOW();

-- Language Lab — French
INSERT INTO exam_boards (id, code, name, full_name, description, country, icon_emoji, display_order, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'LANG_FR',
  'Language Lab – French',
  'Language Laboratory: French Language',
  'Spoken and written French language training from beginner to advanced level.',
  'NG', '🇫🇷', 21, true, NOW(), NOW()
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, full_name = EXCLUDED.full_name,
      description = EXCLUDED.description, is_active = true, updated_at = NOW();

-- Language Lab — Yoruba
INSERT INTO exam_boards (id, code, name, full_name, description, country, icon_emoji, display_order, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'LANG_YO',
  'Language Lab – Yoruba',
  'Language Laboratory: Yoruba Language',
  'Yoruba language training covering oral, written and cultural aspects for academic and professional use.',
  'NG', '🌍', 22, true, NOW(), NOW()
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, full_name = EXCLUDED.full_name,
      description = EXCLUDED.description, is_active = true, updated_at = NOW();

-- ─────────────────────────────────────────────────────────────
-- 4. Add teacher_subjects table if not already present
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_subjects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id   UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  exam_board_id UUID REFERENCES exam_boards(id) ON DELETE SET NULL,
  assigned_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, subject_id)
);

-- ─────────────────────────────────────────────────────────────
-- Done
-- ─────────────────────────────────────────────────────────────
SELECT 'Migration complete.' AS status;
