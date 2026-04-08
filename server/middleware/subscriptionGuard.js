// server/middleware/subscriptionGuard.js
//
// Applied to: /api/questions and /api/ai routes only
//
// Daily limits:
//   teacher / admin      — always unlimited, bypass immediately
//   student (active sub) — unlimited
//   student (free_trial) — 20 question attempts per 24 hours
//   student (free)       — 5 question attempts per 24 hours
//
// Counts rows in practice_attempts for the last 24 hours.
// On any database error the guard FAILS CLOSED (denies access) rather than
// failing open, so a DB outage never accidentally unlocks free users.

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    if (['teacher', 'admin'].includes(req.user.role)) {
      return next();
    }

    // Re-read from DB in case subscription changed since the JWT was issued
    const result = await sequelize.query(
      `SELECT subscription_status, subscription_expires_at
       FROM users WHERE id = :userId`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT }
    );

    if (!result.length) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    const user = result[0];

    // Active paid subscription — unlimited access
    if (
      user.subscription_status === 'active' &&
      user.subscription_expires_at &&
      new Date(user.subscription_expires_at) > new Date()
    ) {
      return next();
    }

    const isActiveTrial =
      user.subscription_status === 'free_trial' &&
      user.subscription_expires_at &&
      new Date(user.subscription_expires_at) > new Date();

    const dailyLimit = isActiveTrial ? 20 : 5;

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

    const message = isActiveTrial
      ? `You have used your ${dailyLimit} free trial questions today. Upgrade for unlimited access.`
      : `You have used your ${dailyLimit} free daily questions. Upgrade to continue learning.`;

    return res.status(403).json({
      success: false,
      error: 'free_limit_reached',
      message,
      attempts_used: attemptCount,
      attempts_allowed: dailyLimit,
      upgrade_url: '/pricing',
    });

  } catch (err) {
    console.error('[subscriptionGuard] Error:', err.message);
    // Fail closed — never grant access on a DB error
    return res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable. Please try again in a moment.',
    });
  }
};
