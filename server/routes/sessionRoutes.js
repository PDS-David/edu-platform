'use strict';

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const sessionService = require('../services/sessionService');
const { success, error } = require('../utils/response');

// START
router.post('/start', protect, async (req, res) => {
  try {
    const session = await sessionService.startSession({
      studentId: req.user.id,
      subtopicId: req.body.subtopicId,
    });

    return success(res, session);

  } catch (err) {
    return error(res, 'Failed to start session');
  }
});

// END
router.post('/end', protect, async (req, res) => {
  try {
    const session = await sessionService.endSession({
      sessionId: req.body.sessionId,
    });

    return success(res, session);

  } catch (err) {
    return error(res, 'Failed to end session');
  }
});

// ACTIVE
router.get('/active', protect, async (req, res) => {
  try {
    const session = await sessionService.getActiveSession(req.user.id);
    return success(res, session);

  } catch (err) {
    return error(res, 'Failed to fetch active session');
  }
});

// STATS
router.get('/stats', protect, async (req, res) => {
  try {
    const stats = await sessionService.getSessionStats(req.user.id);
    return success(res, stats);

  } catch (err) {
    return error(res, 'Failed to fetch session stats');
  }
});

module.exports = router;
