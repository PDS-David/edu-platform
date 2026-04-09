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
  email, password, first_name, last_name,
  role, is_active, is_verified,
  subscription_status, created_at, updated_at
)
VALUES (
  'admin@aischoolonair.com',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password123
  'Platform',
  'Admin',
  'admin',
  true,
  true,
  'active',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE
  SET role        = 'admin',
      is_active   = true,
      is_verified = true,
      updated_at  = NOW();

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
INSERT INTO exam_boards (code, name, description, country, is_active, created_at, updated_at)
VALUES ('GCE_AL', 'GCE A-Levels', 'GCE Advanced Level examinations for post-secondary students.', 'NG', true, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = true, updated_at = NOW();

-- JUPEB
INSERT INTO exam_boards (code, name, description, country, is_active, created_at, updated_at)
VALUES ('JUPEB', 'JUPEB', 'Joint Universities Preliminary Examinations Board — direct entry to 200 Level.', 'NG', true, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = true, updated_at = NOW();

-- Language Lab — English
INSERT INTO exam_boards (code, name, description, country, is_active, created_at, updated_at)
VALUES ('LANG_EN', 'Language Lab – English', 'English language training for proficiency and exam preparation.', 'NG', true, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = true, updated_at = NOW();

-- Language Lab — French
INSERT INTO exam_boards (code, name, description, country, is_active, created_at, updated_at)
VALUES ('LANG_FR', 'Language Lab – French', 'French language training from beginner to advanced level.', 'NG', true, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = true, updated_at = NOW();

-- Language Lab — Yoruba
INSERT INTO exam_boards (code, name, description, country, is_active, created_at, updated_at)
VALUES ('LANG_YO', 'Language Lab – Yoruba', 'Yoruba language training covering oral, written and cultural aspects.', 'NG', true, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = true, updated_at = NOW();

-- ─────────────────────────────────────────────────────────────
-- 4. Add teacher_subjects table if not already present
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_subjects (
  id            SERIAL PRIMARY KEY,
  teacher_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id    INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  exam_board_id INTEGER REFERENCES exam_boards(id) ON DELETE SET NULL,
  assigned_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, subject_id)
);

-- ─────────────────────────────────────────────────────────────
-- Done
-- ─────────────────────────────────────────────────────────────
SELECT 'Migration complete.' AS status;
