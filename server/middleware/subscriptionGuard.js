// server/middleware/subscriptionGuard.js
//
// MVP mode: pricing is not active. All authenticated users get unlimited access.
// When pricing goes live, remove the MVP_FREE_ACCESS block below and uncomment
// the full guard logic at the bottom of this file.

module.exports = async (req, res, next) => {
  // ── MVP: free access for everyone ────────────────────────────────────────
  // Remove this block and restore the limit logic below when subscriptions go live.
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  return next();
  // ── END MVP BLOCK ─────────────────────────────────────────────────────────

  /* ── RESTORE THIS WHEN PRICING GOES LIVE ─────────────────────────────────

  const { QueryTypes } = require('sequelize');
  const sequelize = require('../config/database');

  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    // Teachers and admins always bypass
    if (['teacher', 'admin'].includes(req.user.role)) return next();

    const result = await sequelize.query(
      `SELECT subscription_status, subscription_expires_at FROM users WHERE id = :userId`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT }
    );

    if (!result.length) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    const user = result[0];

    // Active paid subscription — unlimited
    if (
      user.subscription_status === 'active' &&
      user.subscription_expires_at &&
      new Date(user.subscription_expires_at) > new Date()
    ) return next();

    // Active free trial — unlimited for trial period
    if (
      user.subscription_status === 'free_trial' &&
      user.subscription_expires_at &&
      new Date(user.subscription_expires_at) > new Date()
    ) return next();

    // Free / expired — 5 questions per day
    const dailyLimit = 5;
    let attemptCount = 0;
    try {
      const countResult = await sequelize.query(
        `SELECT COUNT(*)::INTEGER AS count FROM practice_attempts
         WHERE student_id = :userId AND attempted_at > NOW() - INTERVAL '24 hours'`,
        { replacements: { userId: req.user.id }, type: QueryTypes.SELECT }
      );
      attemptCount = parseInt(countResult[0].count) || 0;
    } catch {
      return next(); // table not yet created — allow
    }

    if (attemptCount < dailyLimit) return next();

    return res.status(403).json({
      success: false,
      error: 'free_limit_reached',
      message: 'Daily limit reached. Upgrade to continue learning.',
      attempts_used: attemptCount,
      attempts_allowed: dailyLimit,
      upgrade_url: '/pricing',
    });

  } catch (err) {
    console.error('[subscriptionGuard] Error:', err.message);
    return res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable. Please try again.',
    });
  }

  ─────────────────────────────────────────────────────────────────────────── */
};
