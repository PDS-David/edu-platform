-- migration_005_enrollment_lifecycle.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Enrollment lifecycle column additions.
-- Adds status values: pending, active, expired, cancelled, suspended.
-- Adds: expires_at, suspended_at, suspended_reason, cancelled_at, user_id (legacy compat).
-- Safe to run on production: all statements use IF NOT EXISTS / DO blocks.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add new columns (idempotent)
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS expires_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason  TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_id           UUID REFERENCES users(id);  -- legacy compat

-- 2. Widen/replace status enum to support new values.
--    Postgres can't ADD a value to ENUM inside a transaction, so we convert to TEXT
--    with a CHECK constraint which is simpler to manage going forward.
DO $$
BEGIN
  -- Check if the column is still an ENUM type
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'enrollments'
       AND column_name  = 'status'
       AND data_type    = 'USER-DEFINED'
  ) THEN
    -- Convert enum → text
    ALTER TABLE enrollments
      ALTER COLUMN status TYPE TEXT USING status::TEXT;
    RAISE NOTICE 'Converted enrollments.status from ENUM to TEXT';
  END IF;
END $$;

-- 3. Back-fill: map old 'completed' rows → 'expired'
UPDATE enrollments
   SET status = 'expired',
       completed_at = COALESCE(completed_at, updated_at)
 WHERE status = 'completed';

-- 4. Apply NOT NULL + default
ALTER TABLE enrollments
  ALTER COLUMN status SET DEFAULT 'active';

UPDATE enrollments SET status = 'active' WHERE status IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'enrollments'
       AND column_name  = 'status'
       AND is_nullable  = 'YES'
  ) THEN
    ALTER TABLE enrollments ALTER COLUMN status SET NOT NULL;
  END IF;
END $$;

-- 5. Add CHECK constraint for valid status values
DO $$
BEGIN
  ALTER TABLE enrollments
    ADD CONSTRAINT chk_enrollment_status
    CHECK (status IN ('pending','active','expired','cancelled','suspended'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Indexes for common access patterns
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id    ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id     ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status        ON enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_course ON enrollments(student_id, course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user_id       ON enrollments(user_id) WHERE user_id IS NOT NULL;

-- 7. Audit log table for enrollment events
CREATE TABLE IF NOT EXISTS enrollment_audit_log (
  id            BIGSERIAL   PRIMARY KEY,
  enrollment_id UUID        REFERENCES enrollments(id) ON DELETE SET NULL,
  student_id    UUID        REFERENCES users(id)        ON DELETE SET NULL,
  course_id     UUID,
  actor_id      UUID        REFERENCES users(id)        ON DELETE SET NULL,
  event       VARCHAR(60)  NOT NULL,
  from_status VARCHAR(20),
  to_status   VARCHAR(20),
  reason      TEXT,
  ip          VARCHAR(45),
  user_agent  TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eal_enrollment_id ON enrollment_audit_log(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_eal_student_id    ON enrollment_audit_log(student_id);
CREATE INDEX IF NOT EXISTS idx_eal_created_at    ON enrollment_audit_log(created_at DESC);

-- Verification queries (run manually after migration):
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'enrollments'
--  ORDER BY ordinal_position;
--
-- SELECT status, COUNT(*) FROM enrollments GROUP BY status;
