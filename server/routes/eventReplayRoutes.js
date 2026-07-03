'use strict';

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const replayEngine = require('../services/eventReplayEngine');
const logger = require('../config/logger');

// GET /api/replay/progress
router.get('/progress', protect, async (req, res) => {
  try {
    const data = await replayEngine.rebuildProgress(req.user.id);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[GET /api/replay/progress]', { error: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: 'Failed to rebuild progress' });
  }
});

// GET /api/replay/weak
router.get('/weak', protect, async (req, res) => {
  try {
    const data = await replayEngine.getWeakSubtopics(req.user.id);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[GET /api/replay/weak]', { error: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: 'Failed to load weak subtopics' });
  }
});

// GET /api/replay/stats
router.get('/stats', protect, async (req, res) => {
  try {
    const data = await replayEngine.getCompletionStats(req.user.id);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[GET /api/replay/stats]', { error: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: 'Failed to load completion stats' });
  }
});

module.exports = router;
