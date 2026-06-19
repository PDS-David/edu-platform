'use strict';

/**
 * confirmDestructive.js
 * ─────────────────────
 * Middleware factory requiring explicit confirmation before destructive actions.
 *
 * Three confirmation mechanisms (choose one per route):
 *
 *   1. Header confirmation:
 *      requireConfirmHeader('purge-all-resources')
 *      → caller must send  X-Confirm: purge-all-resources
 *
 *   2. Body token confirmation:
 *      requireConfirmBody('DELETE_ALL_USERS')
 *      → caller must send  { "confirm": "DELETE_ALL_USERS" }
 *
 *   3. Admin-only gate (combined with rate limiter):
 *      requireAdminConfirm()
 *      → validates admin role + presence of X-Admin-Action: 1 header
 *
 * Usage:
 *   router.delete('/purge', protect, adminOnly,
 *     confirmDestructive.requireConfirmHeader('purge-all-resources'), handler);
 */

const { requireConfirmHeader, requireConfirmBody, requireAdminConfirm } = (() => {
  /**
   * Require  X-Confirm: <token>  header.
   */
  const requireConfirmHeader = (token) => (req, res, next) => {
    if (req.headers['x-confirm'] !== token) {
      return res.status(400).json({
        success: false,
        error: `Confirmation required. Send header  X-Confirm: ${token}`,
        code: 'CONFIRMATION_REQUIRED',
      });
    }
    next();
  };

  /**
   * Require  { "confirm": "<token>" }  in request body.
   */
  const requireConfirmBody = (token) => (req, res, next) => {
    if (req.body?.confirm !== token) {
      return res.status(400).json({
        success: false,
        error: `Confirmation required. Send  { "confirm": "${token}" }  in request body`,
        code: 'CONFIRMATION_REQUIRED',
      });
    }
    next();
  };

  /**
   * Combined: admin role + X-Admin-Action: 1 header.
   * Use this as a general guard on any destructive admin endpoint.
   */
  const requireAdminConfirm = (req, res, next) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    if (req.headers['x-admin-action'] !== '1') {
      return res.status(400).json({
        success: false,
        error: 'Destructive action confirmation required. Send header  X-Admin-Action: 1',
        code: 'ADMIN_CONFIRM_REQUIRED',
      });
    }
    next();
  };

  return { requireConfirmHeader, requireConfirmBody, requireAdminConfirm };
})();

module.exports = { requireConfirmHeader, requireConfirmBody, requireAdminConfirm };
