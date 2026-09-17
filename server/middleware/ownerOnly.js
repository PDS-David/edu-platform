'use strict';

/**
 * server/middleware/ownerOnly.js
 *
 * Gates the platform-oversight endpoints (server/routes/platformRoutes.js) to
 * the platform owner's own account(s) only.
 *
 * WHY AN ENV VAR AND NOT A ROLE:
 *   The obvious implementation would be a new 'owner' value on the users.role
 *   ENUM. That was deliberately NOT done. Adding an enum value changes the
 *   schema, shows up in any migration file or model read, and would be visible
 *   to anyone with repo or database access — which defeats the point, since
 *   these endpoints exist specifically so the platform owner can review App
 *   Admin activity without the App Admins being aware of it.
 *
 *   PLATFORM_OWNER_EMAILS lives only in api.env on the production server. It
 *   is never bundled into the client (nothing under client/ reads it), never
 *   committed, and not inferable from the schema.
 *
 * WHY NOT A SHARED PASSWORD:
 *   A hardcoded secret checked in the frontend would ship inside the
 *   JavaScript bundle every browser downloads, making it readable in DevTools
 *   by exactly the people it's meant to exclude. Authorization is enforced
 *   here, server-side, per-account. There is no shared secret to leak.
 *
 * HONEST LIMITS, stated so nobody over-trusts this:
 *   - This hides the capability from an App Admin using the app normally. It
 *     does NOT hide it from anyone with SSH, database, or repo access — they
 *     can see the audit tables and this file regardless.
 *   - It is an access control, not a guarantee of secrecy.
 *
 * Config (api.env):
 *   PLATFORM_OWNER_EMAILS=owner@example.com,second.owner@example.com
 *
 * If the variable is unset or empty, every request is denied. Failing closed
 * is deliberate: a misconfigured deploy must not silently expose admin
 * activity review to every admin.
 */

function parseOwnerEmails() {
  return String(process.env.PLATFORM_OWNER_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

const ownerOnly = (req, res, next) => {
  const owners = parseOwnerEmails();
  const email  = String(req.user?.email || '').trim().toLowerCase();

  // Deliberately returns the same 404 an unknown route would, rather than a
  // 403 "forbidden". A 403 confirms the endpoint exists and that the caller
  // simply isn't allowed — which tells an App Admin probing URLs that there
  // is something here worth finding. A 404 tells them nothing.
  if (!owners.length || !email || !owners.includes(email)) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  next();
};

module.exports = { ownerOnly, parseOwnerEmails };
