'use strict';

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const weakEngine = require('../services/weakTopicEngine');

// GET /api/weak-topics
router.get('/', protect, async (req, res) => {
  try {
    const data = await weakEngine.getWeakTopics(req.user.id);

    res.json({
      success: true,
      count: data.length,
      data
    });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// GET /api/weak-topics/top
router.get('/top', protect, async (req, res) => {
  try {
    const data = await weakEngine.getTopWeakTopics(req.user.id);

    res.json({
      success: true,
      data
    });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
