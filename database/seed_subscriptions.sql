-- ============================================================
-- EAC LEARNING PLATFORM — SUBSCRIPTION PLANS + USER SUBSCRIPTIONS
-- Section 1: Seeds the subscription_plans table (safe to re-run)
-- Section 2: Seeds test user subscriptions (John Doe, Temitope)
-- ============================================================

BEGIN;

-- ── 0. Ensure plan_code is unique (safe even if constraint exists) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_plans_plan_code_key'
  ) THEN
    ALTER TABLE subscription_plans ADD CONSTRAINT subscription_plans_plan_code_key UNIQUE (plan_code);
  END IF;
END$$;

-- ── 1. Seed subscription_plans ───────────────────────────────
INSERT INTO subscription_plans
  (id, plan_code, plan_name, price_monthly, price_yearly, currency,
   features, max_exam_boards, max_subjects,
   has_analytics, has_video_access, has_test_builder, is_active)
VALUES
  (gen_random_uuid(), 'FREE', 'Free Plan', 0, 0, 'NGN',
   '["5 questions/day","1 exam board","3 subjects","Basic progress tracking"]'::jsonb,
   1, 3, false, false, false, true),

  (gen_random_uuid(), 'FREE_TRIAL', 'Free Trial', 0, 0, 'NGN',
   '["20 questions/day","All exam boards for 14 days","All subjects","AI explanations"]'::jsonb,
   10, 20, true, false, false, true),

  (gen_random_uuid(), 'STUDENT_MONTHLY', 'Student Monthly', 3500, 0, 'NGN',
   '["Unlimited questions","All exam boards","All subjects","AI explanations","Analytics","Video lessons"]'::jsonb,
   10, 20, true, true, false, true),

  (gen_random_uuid(), 'STUDENT_YEARLY', 'Student Yearly', 0, 35000, 'NGN',
   '["Unlimited questions","All exam boards","All subjects","AI explanations","Analytics","Video lessons","Save 17%"]'::jsonb,
   10, 20, true, true, false, true),

  (gen_random_uuid(), 'TEACHER_YEARLY', 'Teacher Plan', 0, 60000, 'NGN',
   '["All Student features","Test builder","Cohort analytics","AI gap analysis","Class management"]'::jsonb,
   10, 30, true, true, true, true)

ON CONFLICT (plan_code) DO UPDATE
  SET plan_name        = EXCLUDED.plan_name,
      price_monthly    = EXCLUDED.price_monthly,
      price_yearly     = EXCLUDED.price_yearly,
      features         = EXCLUDED.features,
      max_exam_boards  = EXCLUDED.max_exam_boards,
      max_subjects     = EXCLUDED.max_subjects,
      has_analytics    = EXCLUDED.has_analytics,
      has_video_access = EXCLUDED.has_video_access,
      has_test_builder = EXCLUDED.has_test_builder,
      is_active        = EXCLUDED.is_active;

-- ── 2. Create test user subscriptions ────────────────────────
-- John Doe → STUDENT_YEARLY
INSERT INTO user_subscriptions (id, user_id, plan_id, start_date, end_date, status, payment_reference, amount_paid, auto_renew, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'cd818b5c-24c2-46a4-ae0c-5635d7f671b0',  -- John Doe
  sp.id,
  NOW(),
  NOW() + INTERVAL '1 year',
  'active',
  'TEST-JOHN-YEARLY-001',
  20000,
  false,
  NOW(),
  NOW()
FROM subscription_plans sp WHERE sp.plan_code = 'STUDENT_YEARLY';

-- Temitope → FREE_TRIAL
INSERT INTO user_subscriptions (id, user_id, plan_id, start_date, end_date, status, payment_reference, amount_paid, auto_renew, created_at, updated_at)
SELECT
  gen_random_uuid(),
  '10429bfe-bb6b-4b01-99a1-f921bb956687',  -- Temitope
  sp.id,
  NOW(),
  NOW() + INTERVAL '14 days',
  'active',
  'TEST-TEMI-TRIAL-001',
  0,
  false,
  NOW(),
  NOW()
FROM subscription_plans sp WHERE sp.plan_code = 'FREE_TRIAL';

-- ── 3. Link subscription_id into student_exam_types ──────────
UPDATE student_exam_types SET
  subscription_id = (
    SELECT us.id FROM user_subscriptions us
    WHERE us.user_id = 'cd818b5c-24c2-46a4-ae0c-5635d7f671b0'
      AND us.status = 'active'
    ORDER BY us.created_at DESC LIMIT 1
  )
WHERE student_id = 'cd818b5c-24c2-46a4-ae0c-5635d7f671b0';

UPDATE student_exam_types SET
  subscription_id = (
    SELECT us.id FROM user_subscriptions us
    WHERE us.user_id = '10429bfe-bb6b-4b01-99a1-f921bb956687'
      AND us.status = 'active'
    ORDER BY us.created_at DESC LIMIT 1
  )
WHERE student_id = '10429bfe-bb6b-4b01-99a1-f921bb956687';

-- ── 4. Verify ─────────────────────────────────────────────────
SELECT plan_code, plan_name, price_monthly, price_yearly, is_active
FROM subscription_plans
ORDER BY price_yearly ASC NULLS FIRST;

COMMIT;
