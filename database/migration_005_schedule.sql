-- ============================================================
-- Migration 005 — Study Schedule Columns
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_study_days TEXT[]      DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_study_time VARCHAR(20) DEFAULT 'evening';
