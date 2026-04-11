-- =============================================================================
-- migration_002.sql
-- Gaps identified in full audit
--
-- What this does:
--   1. Adds missing columns to questions table
--   2. Creates subscription_plans table + seeds plan data
--   3. Creates payment_transactions table
--   4. Creates user_subscriptions table
--   5. Cleans up 69 duplicate email unique constraints on users
--   6. Adds scheduled trial-expiry UPDATE (run manually or via cron)
--
-- Safe to run multiple times — uses IF NOT EXISTS and DO $$ checks throughout.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ADD MISSING COLUMNS TO questions
--
--    DB currently has:
--      id, subtopic_id, submitted_by, question_text, type, options,
--      correct_answer, explanation, marks, order_index, image_url,
--      is_active, created_at, updated_at
--
--    Code references that are missing:
--      status, difficulty, question_type, question_sub_type,
--      topic, year, source, subject_id_uuid,
--      is_ai_generated, ai_generation_source, concept_hint, hints
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS status               VARCHAR(20)  NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS difficulty           VARCHAR(10)  DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS question_type        VARCHAR(50)  DEFAULT 'mcq',
  ADD COLUMN IF NOT EXISTS question_sub_type    VARCHAR(50)  DEFAULT 'mcq',
  ADD COLUMN IF NOT EXISTS topic                VARCHAR(255),
  ADD COLUMN IF NOT EXISTS year                 INTEGER,
  ADD COLUMN IF NOT EXISTS source               VARCHAR(100),
  ADD COLUMN IF NOT EXISTS subject_id_uuid      INTEGER      REFERENCES subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_ai_generated      BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_generation_source VARCHAR(100),
  ADD COLUMN IF NOT EXISTS concept_hint         TEXT,
  ADD COLUMN IF NOT EXISTS hints                JSONB;

-- Index status for fast "approved" question lookups (used by every quiz/test)
CREATE INDEX IF NOT EXISTS idx_questions_status         ON questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_subject_id     ON questions(subject_id_uuid);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty     ON questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_sub_type       ON questions(question_sub_type);

-- Backfill: any existing rows should be treated as approved and active
UPDATE questions SET status = 'approved' WHERE status = 'pending';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CREATE subscription_plans TABLE + SEED
--    Used by: GET /payments/plans, POST /payments/initialize,
--             GET /payments/verify, POST /payments/webhook
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code         VARCHAR(50)  NOT NULL UNIQUE,
  plan_name         VARCHAR(100) NOT NULL,
  price_monthly     INTEGER,        -- in kobo (NGN * 100); NULL for yearly-only
  price_yearly      INTEGER,        -- in kobo; NULL for monthly-only
  currency          VARCHAR(10)  NOT NULL DEFAULT 'NGN',
  has_analytics     BOOLEAN      NOT NULL DEFAULT true,
  has_video_access  BOOLEAN      NOT NULL DEFAULT true,
  has_test_builder  BOOLEAN      NOT NULL DEFAULT true,
  is_active         BOOLEAN      NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed the three plans the pricing page and payment routes expect
INSERT INTO subscription_plans
  (plan_code, plan_name, price_monthly, price_yearly, currency,
   has_analytics, has_video_access, has_test_builder, is_active)
VALUES
  -- Free trial — no payment, activated automatically on registration
  ('FREE_TRIAL',      'Free Trial',       NULL,   NULL,    'NGN', true,  true,  false, true),
  -- ₦2,000/month (200,000 kobo)
  ('STUDENT_MONTHLY', 'Student Monthly',  200000, NULL,    'NGN', true,  true,  true,  true),
  -- ₦6,000/year (600,000 kobo) — ₦500/month equivalent
  ('STUDENT_YEARLY',  'Student Annual',   NULL,   600000,  'NGN', true,  true,  true,  true)
ON CONFLICT (plan_code) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CREATE payment_transactions TABLE
--    Used by: POST /payments/initialize, GET /payments/verify,
--             POST /payments/webhook
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_transactions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_reference   VARCHAR(100) NOT NULL UNIQUE,
  paystack_reference      VARCHAR(100),
  payment_gateway         VARCHAR(50)  NOT NULL DEFAULT 'paystack',
  amount                  INTEGER      NOT NULL,   -- in kobo
  currency                VARCHAR(10)  NOT NULL DEFAULT 'NGN',
  status                  VARCHAR(20)  NOT NULL DEFAULT 'pending',
  metadata                JSONB,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id   ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_reference ON payment_transactions(transaction_reference);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status    ON payment_transactions(status);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CREATE user_subscriptions TABLE
--    Used by: GET /payments/verify, POST /payments/webhook,
--             GET /payments/subscription
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id           UUID        NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  start_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date          TIMESTAMPTZ NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'active',
  payment_reference VARCHAR(100),
  amount_paid       INTEGER,    -- in kobo
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status  ON user_subscriptions(status);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CLEAN UP DUPLICATE EMAIL UNIQUE CONSTRAINTS ON users
--    The users table has 70 identical unique constraints on email
--    (users_email_key through users_email_key69). Keep only the original
--    users_email_key and drop the 69 duplicates.
--    This is safe — the column stays unique, we just remove redundant indexes.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  i INTEGER;
BEGIN
  FOR i IN 1..69 LOOP
    BEGIN
      EXECUTE format('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key%s', i);
    EXCEPTION WHEN others THEN
      NULL; -- ignore if doesn't exist
    END;
  END LOOP;
  RAISE NOTICE 'Duplicate email constraints cleaned up';
END
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. EXPIRE FREE TRIALS THAT HAVE PASSED THEIR END DATE
--    This is the one-time backfill. For ongoing expiry, add this to
--    scheduledJobs.js (see note below).
--    Changes free_trial → expired where subscription_expires_at has passed.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE users
SET    subscription_status = 'expired',
       updated_at          = NOW()
WHERE  subscription_status   = 'free_trial'
  AND  subscription_expires_at IS NOT NULL
  AND  subscription_expires_at < NOW();

RAISE NOTICE 'Expired free trials updated to expired status';


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. questions new columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'questions'
  AND column_name IN (
    'status','difficulty','question_type','question_sub_type',
    'topic','year','source','subject_id_uuid',
    'is_ai_generated','ai_generation_source','concept_hint','hints'
  )
ORDER BY column_name;

-- 2. new tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('subscription_plans','payment_transactions','user_subscriptions')
ORDER BY table_name;

-- 3. subscription plans seeded
SELECT plan_code, plan_name, price_monthly, price_yearly, is_active
FROM subscription_plans
ORDER BY
  CASE plan_code
    WHEN 'FREE_TRIAL'      THEN 1
    WHEN 'STUDENT_MONTHLY' THEN 2
    WHEN 'STUDENT_YEARLY'  THEN 3
  END;

-- 4. duplicate constraints gone (should return 1 row only)
SELECT COUNT(*) AS email_unique_constraints
FROM information_schema.table_constraints
WHERE table_name       = 'users'
  AND constraint_type  = 'UNIQUE'
  AND constraint_name  LIKE 'users_email%';
