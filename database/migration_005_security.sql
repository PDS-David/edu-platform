-- =============================================================================
-- migration_005_security.sql
-- Security hardening: audit logs, soft-delete, last-admin protection triggers
-- Safe to run multiple times (IF NOT EXISTS / DO NOTHING / CREATE OR REPLACE).
-- =============================================================================

-- ── 1. audit_logs ─────────────────────────────────────────────────────────────
-- Tamper-resistant append-only audit log. Row-level DELETE/UPDATE blocked by
-- trigger below. INSERT-only via application layer (auditLogger service).
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      UUID         REFERENCES users(id) ON DELETE SET NULL,
  actor_email   TEXT,                          -- snapshot at time of action
  actor_role    TEXT,
  action        TEXT         NOT NULL,         -- e.g. LOGIN, ROLE_CHANGE, USER_DELETE
  target_type   TEXT,                          -- e.g. 'user', 'course', 'setting'
  target_id     TEXT,                          -- UUID or integer cast to text
  target_email  TEXT,                          -- snapshot of target user email
  metadata      JSONB        NOT NULL DEFAULT '{}',
  ip_address    INET,
  user_agent    TEXT,
  severity      TEXT         NOT NULL DEFAULT 'info'  -- info | warning | critical
                             CHECK (severity IN ('info', 'warning', 'critical')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes for fast admin queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id    ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action       ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at   ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_id    ON audit_logs(target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity     ON audit_logs(severity);

-- ── 2. Tamper-resistance trigger ──────────────────────────────────────────────
-- Prevents UPDATE or DELETE on audit_logs. Only INSERT is allowed.
CREATE OR REPLACE FUNCTION audit_logs_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is immutable — UPDATE and DELETE are forbidden';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

-- ── 3. Soft-delete columns on users ───────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at)
  WHERE deleted_at IS NULL;   -- partial index — fast active-user lookups

-- ── 4. Last-admin guard trigger ───────────────────────────────────────────────
-- Fires on UPDATE to users. Blocks:
--   a) demoting the last admin (role change away from 'admin')
--   b) deactivating the last admin (is_active = false)
--   c) soft-deleting the last admin (deleted_at IS NOT NULL)
CREATE OR REPLACE FUNCTION guard_last_admin()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  active_admin_count INTEGER;
BEGIN
  -- Only relevant when the affected row is currently an admin
  IF OLD.role = 'admin' THEN
    -- Count admins that are still active AFTER this change would take effect.
    -- We exclude the row being changed from the count if it's being demoted/deactivated.
    SELECT COUNT(*) INTO active_admin_count
    FROM users
    WHERE role      = 'admin'
      AND is_active = true
      AND deleted_at IS NULL
      AND id != OLD.id;

    -- If this is the last admin and we're removing admin privileges
    IF active_admin_count = 0 THEN
      IF NEW.role != 'admin' THEN
        RAISE EXCEPTION 'LAST_ADMIN_PROTECTION: Cannot demote the last active admin';
      END IF;
      IF NEW.is_active = false THEN
        RAISE EXCEPTION 'LAST_ADMIN_PROTECTION: Cannot deactivate the last active admin';
      END IF;
      IF NEW.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'LAST_ADMIN_PROTECTION: Cannot delete the last active admin';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_last_admin ON users;
CREATE TRIGGER trg_guard_last_admin
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION guard_last_admin();

-- ── 5. Security-event index ───────────────────────────────────────────────────
-- Speeds up the security-events admin dashboard query.
CREATE INDEX IF NOT EXISTS idx_audit_logs_security_events
  ON audit_logs(created_at DESC)
  WHERE severity IN ('warning', 'critical');
