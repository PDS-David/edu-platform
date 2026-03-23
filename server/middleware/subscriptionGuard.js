// server/middleware/subscriptionGuard.js
// ─────────────────────────────────────────────────────────────────────────────
// Applied to: /api/questions and /api/ai routes only
// Logic:
//   - teachers and admins: always pass through
//   - subscribed students (active + not expired): pass through
//   - free_trial students (not expired): allow up to 20 question attempts per 24 hours
//   - free students: allow up to 5 question attempts per 24 hours
//   - free/trial students over limit: return 403 free_limit_reached
// ─────────────────────────────────────────────────────────────────────────────

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = async (req, res, next) => {
  try {
    // Must have req.user set by protect middleware first
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    // Teachers and admins always pass through
    if (['teacher', 'admin'].includes(req.user.role)) {
      return next();
    }

    // Check subscription status from DB (not just req.user, which may be stale)
    const result = await sequelize.query(
      `SELECT subscription_status, subscription_expires_at FROM users WHERE id = :userId`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT }
    );

    if (!result.length) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    const user = result[0];

    // ── Active subscription — unlimited access ───────────────────────────────
    if (
      user.subscription_status === 'active' &&
      user.subscription_expires_at &&
      new Date(user.subscription_expires_at) > new Date()
    ) {
      return next();
    }

    // ── Free trial — 20 questions/day ─────────────────────────────────────────
    const isActiveTrial =
      user.subscription_status === 'free_trial' &&
      user.subscription_expires_at &&
      new Date(user.subscription_expires_at) > new Date();

    const dailyLimit = isActiveTrial ? 20 : 5;

    // Check 24-hour attempt count
    const countResult = await sequelize.query(
      `SELECT COUNT(*)::INTEGER AS count
       FROM practice_attempts
       WHERE student_id = :userId
         AND attempted_at > NOW() - INTERVAL '24 hours'`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT }
    );

    const attemptCount = parseInt(countResult[0].count) || 0;

    if (attemptCount < dailyLimit) {
      return next();
    }

    // Limit reached
    const message = isActiveTrial
      ? `You have used your ${dailyLimit} free trial questions today. Upgrade for unlimited access.`
      : `You have used your ${dailyLimit} free daily questions. Upgrade to continue learning.`;

    return res.status(403).json({
      success:  false,
      error:    'free_limit_reached',
      message,
      attempts_used:    attemptCount,
      attempts_allowed: dailyLimit,
      upgrade_url:      '/pricing',
    });

  } catch (err) {
    console.error('[subscriptionGuard] Error:', err.message);
    // On unexpected error, allow through rather than block all users
    return next();
  }
};
