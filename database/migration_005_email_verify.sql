-- ============================================================
-- Migration 005 — Email Verification Token Columns
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token   VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMPTZ  NULL;
