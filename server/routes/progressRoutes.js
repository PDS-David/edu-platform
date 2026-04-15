'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

const aggregator = require('../services/progressAggregator');

/**
 * GET /api/progress/topic/:topicId
 */
router.get('/topic/:topicId', protect, async (req, res) => {
  try {
    const data = await aggregator.getTopicProgress(
      req.user.id,
      req.params.topicId
    );

    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Topic progress failed' });
  }
});

/**
 * GET /api/progress/subject/:subjectId
 */
router.get('/subject/:subjectId', protect, async (req, res) => {
  try {
    const data = await aggregator.getSubjectProgress(
      req.user.id,
      req.params.subjectId
    );

    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Subject progress failed' });
  }
});

/**
 * GET /api/progress/dashboard
 */
router.get('/dashboard', protect, async (req, res) => {
  try {
    const data = await aggregator.getUserDashboardProgress(req.user.id);

    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Dashboard failed' });
  }
});

module.exports = router;
