-- ============================================================
-- MIGRATION: Roles, New Curricula, Admin Seed
-- ============================================================

-- 1. Ensure role ENUM includes 'teacher'
DO $$
BEGIN
IF NOT EXISTS (
SELECT 1 FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'enum_users_role'
AND e.enumlabel = 'teacher'
) THEN
ALTER TYPE enum_users_role ADD VALUE 'teacher';
END IF;
EXCEPTION WHEN others THEN NULL;
END$$;

-- 2. Seed admin user
INSERT INTO users (
email, password, first_name, last_name,
role, is_active, is_verified,
subscription_status, created_at, updated_at
)
VALUES (
'[admin@aischoolonair.com](mailto:admin@aischoolonair.com)',
'$2a$10$xJXYWxcpi607RxAR.KT0OeKNRa6H8.6SnAs3rQD1ktr7DUXp5kkyO',
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
SET role='admin',
is_active=true,
is_verified=true,
updated_at=NOW();

-- 3. Ensure unique constraint exists
DO $$
BEGIN
IF NOT EXISTS (
SELECT 1 FROM pg_constraint
WHERE conname = 'exam_boards_code_unique'
) THEN
ALTER TABLE exam_boards
ADD CONSTRAINT exam_boards_code_unique UNIQUE (code);
END IF;
EXCEPTION WHEN others THEN NULL;
END$$;

-- 4. Add exam boards (standardized version)

INSERT INTO exam_boards
(code, name, full_name, description, country,
icon_emoji, display_order, is_active,
created_at, updated_at)
VALUES
('GCE_AL',
'GCE A Levels',
'General Certificate of Education Advanced Level',
'GCE Advanced Level examinations recognised across West Africa and the UK.',
'NG',
'AL',
15,
true,
NOW(),
NOW())
ON CONFLICT (code)
DO UPDATE SET
name=EXCLUDED.name,
is_active=true,
updated_at=NOW();

INSERT INTO exam_boards
(code, name, full_name, description, country,
icon_emoji, display_order, is_active,
created_at, updated_at)
VALUES
('JUPEB',
'JUPEB',
'Joint Universities Preliminary Examinations Board',
'Nigerian pre-degree programme accepted for direct entry.',
'NG',
'JP',
16,
true,
NOW(),
NOW())
ON CONFLICT (code)
DO UPDATE SET
name=EXCLUDED.name,
is_active=true,
updated_at=NOW();

INSERT INTO exam_boards
(code, name, full_name, description, country,
icon_emoji, display_order, is_active,
created_at, updated_at)
VALUES
('LANG_EN',
'Language Lab - English',
'Language Laboratory English',
'Spoken and written English language training.',
'NG',
'EN',
20,
true,
NOW(),
NOW())
ON CONFLICT (code)
DO UPDATE SET
name=EXCLUDED.name,
is_active=true,
updated_at=NOW();

INSERT INTO exam_boards
(code, name, full_name, description, country,
icon_emoji, display_order, is_active,
created_at, updated_at)
VALUES
('LANG_FR',
'Language Lab - French',
'Language Laboratory French',
'French language training from beginner to advanced.',
'NG',
'FR',
21,
true,
NOW(),
NOW())
ON CONFLICT (code)
DO UPDATE SET
name=EXCLUDED.name,
is_active=true,
updated_at=NOW();

INSERT INTO exam_boards
(code, name, full_name, description, country,
icon_emoji, display_order, is_active,
created_at, updated_at)
VALUES
('LANG_YO',
'Language Lab - Yoruba',
'Language Laboratory Yoruba',
'Yoruba language training covering oral and written aspects.',
'NG',
'YO',
22,
true,
NOW(),
NOW())
ON CONFLICT (code)
DO UPDATE SET
name=EXCLUDED.name,
is_active=true,
updated_at=NOW();

-- 5. teacher_subjects table

CREATE TABLE IF NOT EXISTS teacher_subjects (
id SERIAL PRIMARY KEY,
teacher_id UUID NOT NULL
REFERENCES users(id) ON DELETE CASCADE,
subject_id INTEGER NOT NULL
REFERENCES subjects(id) ON DELETE CASCADE,
exam_board_id INTEGER
REFERENCES exam_boards(id) ON DELETE SET NULL,
assigned_by UUID
REFERENCES users(id) ON DELETE SET NULL,
is_active BOOLEAN NOT NULL DEFAULT true,
assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
UNIQUE (teacher_id, subject_id)
);

SELECT 'Migration complete.' AS status;
