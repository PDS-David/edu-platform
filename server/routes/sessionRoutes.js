'use strict';

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const sessionService = require('../services/sessionService');

// ─────────────────────────────────────────────
// START SESSION
// POST /api/sessions/start
// ─────────────────────────────────────────────
router.post('/start', protect, async (req, res) => {
  try {
    const studentId = req.user.id;
    const { subtopicId } = req.body;

    const session = await sessionService.startSession({
      studentId,
      subtopicId,
    });

    res.json({ success: true, data: session });

  } catch (err) {
    console.error('[START SESSION ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Failed to start session' });
  }
});

// ─────────────────────────────────────────────
// END SESSION
// POST /api/sessions/end
// ─────────────────────────────────────────────
router.post('/end', protect, async (req, res) => {
  try {
    const { sessionId } = req.body;

    const session = await sessionService.endSession({ sessionId });

    res.json({ success: true, data: session });

  } catch (err) {
    console.error('[END SESSION ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Failed to end session' });
  }
});

// ─────────────────────────────────────────────
// ACTIVE SESSION
// GET /api/sessions/active
// ─────────────────────────────────────────────
router.get('/active', protect, async (req, res) => {
  try {
    const session = await sessionService.getActiveSession(req.user.id);

    res.json({ success: true, data: session });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// SESSION STATS
// GET /api/sessions/stats
// ─────────────────────────────────────────────
router.get('/stats', protect, async (req, res) => {
  try {
    const stats = await sessionService.getSessionStats(req.user.id);

    res.json({ success: true, data: stats });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
