'use strict';

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const recommendationService = require('../services/recommendationService');

// ─────────────────────────────────────────────
// GET /api/recommendations
// ─────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const studentId = req.user.id;

    const data = await recommendationService.getRecommendations(studentId);

    return res.json({
      success: true,
      data,
    });

  } catch (err) {
    console.error('[RECOMMENDATIONS ERROR]', err.message);

    return res.status(500).json({
      success: false,
      error: 'Failed to generate recommendations',
    });
  }
});

module.exports = router;
