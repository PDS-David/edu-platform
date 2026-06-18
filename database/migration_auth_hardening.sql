-- =============================================================================
-- migration_auth_hardening.sql
-- AUTH-001 → AUTH-006  Authentication Security Hardening
--
-- Implements:
--   AUTH-001  Account lockout (failed_login_count, locked_until)
--   AUTH-002  Server-side token revocation (auth_tokens table)
--   AUTH-003  Remember Me / persistent tokens (auth_tokens.remember_me)
--   AUTH-004  Refresh token support (auth_tokens.refresh_token)
--   AUTH-005  Session management — token rotation, inactivity expiration
--   AUTH-006  Authentication audit log (auth_audit_log table)
--
-- Safe to run multiple times — every statement uses IF NOT EXISTS or
-- column-existence guards.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- AUTH-001  Account lockout columns on users
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_count INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until       TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────────
-- AUTH-002 / AUTH-003 / AUTH-004 / AUTH-005
-- auth_tokens — server-side token registry
--
-- One row per active access+refresh pair.
-- Revoked rows are kept for audit; a nightly job purges rows older than 90 days.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_tokens (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The opaque jti (JWT ID) stored inside the signed JWT.
  -- Used to check revocation without re-verifying the full token on every request.
  jti              VARCHAR(64) NOT NULL UNIQUE,

  -- Hashed refresh token (SHA-256 hex).  Raw value is sent only once to the client.
  refresh_token    VARCHAR(64) UNIQUE,

  -- Remember Me flag drives token lifetime on issue.
  remember_me      BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Device / session hint for UI ("all-device logout" support).
  device_hint      VARCHAR(255),
  ip_address       INET,
  user_agent       TEXT,

  -- Timestamps
  issued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL,               -- access token expiry
  refresh_expires_at TIMESTAMPTZ,                      -- refresh token expiry (NULL = no refresh)
  last_used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- inactivity tracking

  -- Revocation
  revoked          BOOLEAN     NOT NULL DEFAULT FALSE,
  revoked_at       TIMESTAMPTZ,
  revoked_reason   VARCHAR(64)           -- 'logout', 'all_devices', 'password_change', 'admin'
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id  ON auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_jti      ON auth_tokens(jti);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_refresh  ON auth_tokens(refresh_token) WHERE refresh_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_tokens_revoked  ON auth_tokens(revoked, expires_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- AUTH-006  Authentication audit log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  event_type  VARCHAR(64) NOT NULL,   -- LOGIN_SUCCESS, LOGIN_FAILURE, LOGOUT,
                                       -- LOCKOUT, PASSWORD_RESET_REQUEST,
                                       -- PASSWORD_RESET_SUCCESS, TOKEN_REVOKED,
                                       -- TOKEN_REFRESH, REGISTER
  user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  email       VARCHAR(255),            -- captured even when user_id is unknown
  ip_address  INET,
  user_agent  TEXT,
  metadata    JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_user_id    ON auth_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_event_type ON auth_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_auth_audit_created_at ON auth_audit_log(created_at DESC);

-- Automatic purge: rows older than 1 year are deleted by the nightly cron.
-- (Implemented in server/jobs/authCleanup.js)
