'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const EngineValidationService = require('../services/engineValidationService');

// GET /api/engine/validate
router.get('/validate', protect, async (req, res) => {
  try {
    const result = await EngineValidationService.fullSystemCheck(req.user.id);

    res.json({
      success: true,
      data: result
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
