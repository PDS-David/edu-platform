// server/routes/examTypeActivation.js
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/activate-exam-types
//
// Called by PaymentVerify.jsx after Paystack payment is confirmed.
// Reads users.pending_exam_board_ids, creates student_exam_types rows
// linked to the new subscription, then clears the pending column.
//
// This is a student-facing endpoint — NOT admin-only.
// ─────────────────────────────────────────────────────────────────────────────

const express    = require('express');
const router     = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize  = require('../config/database');
const { protect } = require('../middleware/auth');

router.post('/activate-exam-types', protect, async (req, res) => {
  const studentId      = req.user.id;
  const subscriptionId = req.body?.subscription_id || null;

  try {
    // ── 1. Get the student's pending exam board IDs ────────────
    const userRows = await sequelize.query(
      `SELECT pending_exam_board_ids FROM users WHERE id = :id`,
      { replacements: { id: studentId }, type: QueryTypes.SELECT }
    );

    if (!userRows.length) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const pendingIds = userRows[0].pending_exam_board_ids || [];

    if (pendingIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No pending exam types to activate',
        activated: 0,
      });
    }

    // ── 2. Get subscription end date ───────────────────────────
    let expiresAt = null;
    if (subscriptionId) {
      const subRows = await sequelize.query(
        `SELECT end_date FROM user_subscriptions
         WHERE id = :id AND user_id = :userId`,
        { replacements: { id: subscriptionId, userId: studentId }, type: QueryTypes.SELECT }
      );
      if (subRows.length) expiresAt = subRows[0].end_date;
    }

    // ── 3. Insert into student_exam_types ──────────────────────
    let activated = 0;
    for (const boardId of pendingIds) {
      await sequelize.query(
        `INSERT INTO student_exam_types
           (student_id, exam_board_id, subscription_id, granted_at, expires_at, is_active)
         VALUES (:studentId, :boardId, :subscriptionId, NOW(), :expiresAt, true)
         ON CONFLICT (student_id, exam_board_id) DO UPDATE SET
           is_active       = true,
           subscription_id = EXCLUDED.subscription_id,
           expires_at      = EXCLUDED.expires_at,
           granted_at      = NOW()`,
        {
          replacements: {
            studentId,
            boardId,
            subscriptionId: subscriptionId || null,
            expiresAt:      expiresAt      || null,
          },
          type: QueryTypes.INSERT,
        }
      );
      activated++;
    }

    // ── 4. Clear pending_exam_board_ids ────────────────────────
    await sequelize.query(
      `UPDATE users SET pending_exam_board_ids = '{}' WHERE id = :id`,
      { replacements: { id: studentId }, type: QueryTypes.UPDATE }
    );

    return res.status(200).json({
      success: true,
      message: `${activated} examination type(s) activated`,
      activated,
    });

  } catch (err) {
    console.error('[POST /payments/activate-exam-types]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to activate exam types' });
  }
});

module.exports = router;
