'use strict';

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const replayEngine = require('../services/eventReplayEngine');

// GET /api/replay/progress
router.get('/progress', protect, async (req, res) => {
  const data = await replayEngine.rebuildProgress(req.user.id);
  res.json({ success: true, data });
});

// GET /api/replay/weak
router.get('/weak', protect, async (req, res) => {
  const data = await replayEngine.getWeakSubtopics(req.user.id);
  res.json({ success: true, data });
});

// GET /api/replay/stats
router.get('/stats', protect, async (req, res) => {
  const data = await replayEngine.getCompletionStats(req.user.id);
  res.json({ success: true, data });
});

module.exports = router;
