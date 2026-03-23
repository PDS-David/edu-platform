-- ============================================================
-- Migration 005 — Free Trial Support
-- Safe to re-run
-- ============================================================

-- Step 1: Add subscription_expires_at if not present
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ NULL;

-- Step 2: Update subscription_status CHECK constraint to include free_trial
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_subscription_status_check;
ALTER TABLE users ADD CONSTRAINT users_subscription_status_check
  CHECK (subscription_status IN ('free', 'free_trial', 'active', 'expired', 'cancelled'));
