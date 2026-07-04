-- database/em_grading_persistence.sql
--
-- Closes two gaps found during grading/storage verification (July 2026):
--   1. Pronunciation was graded (score stored in em_practice_sessions) but the
--      raw audio clip itself was discarded after scoring — no way to audit,
--      re-grade, or review a disputed score.
--   2. Written-text exercises had no grading pipeline or storage at all.
--
-- Safe to run multiple times (IF NOT EXISTS throughout).

BEGIN;

-- ── 1. Persist every pronunciation attempt, including the audio clip ───────
CREATE TABLE IF NOT EXISTS em_pronunciation_attempts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id          UUID REFERENCES em_words(id) ON DELETE SET NULL,
  word_text        TEXT NOT NULL,       -- kept even if word_id is null/deleted
  audio_url        TEXT,                -- R2 URL; null if R2 not configured (falls back gracefully)
  heard            TEXT,                -- what Gemini transcribed
  score            NUMERIC(5,2) NOT NULL,
  matched          BOOLEAN NOT NULL DEFAULT false,
  feedback         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_em_pronunciation_attempts_user
  ON em_pronunciation_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_em_pronunciation_attempts_word
  ON em_pronunciation_attempts(word_id);

-- ── 2. Written-text exercise submissions + AI grading ───────────────────────
CREATE TABLE IF NOT EXISTS em_writing_submissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id          UUID REFERENCES em_words(id) ON DELETE SET NULL,
  word_text        TEXT NOT NULL,
  prompt           TEXT NOT NULL,       -- the instruction shown to the student
  submission_text  TEXT NOT NULL,       -- what the student actually wrote
  score            NUMERIC(5,2) NOT NULL,
  used_word_correctly BOOLEAN NOT NULL DEFAULT false,
  grammar_notes    TEXT,                -- short AI note on grammar/usage issues, if any
  feedback         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_em_writing_submissions_user
  ON em_writing_submissions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_em_writing_submissions_word
  ON em_writing_submissions(word_id);

-- ── 3. Session-level writing average, parallel to pronunciation_score ──────
ALTER TABLE em_practice_sessions
  ADD COLUMN IF NOT EXISTS writing_score NUMERIC(5,2);

COMMIT;

-- Verify:
-- SELECT COUNT(*) FROM em_pronunciation_attempts;
-- SELECT COUNT(*) FROM em_writing_submissions;
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'em_practice_sessions' AND column_name = 'writing_score';
