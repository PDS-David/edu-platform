'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const AIQuestionGenerationEngine = require('../services/aiQuestionGenerationEngine');

// ─────────────────────────────────────────────
// GENERATE QUESTIONS FOR STUDENT
// ─────────────────────────────────────────────
router.get('/:subjectId', protect, async (req, res) => {

  try {
    const result = await AIQuestionGenerationEngine.generateQuestions({
      studentId: req.user.id,
      subjectId: req.params.subjectId,
      limit: req.query.limit ? Number(req.query.limit) : 10
    });

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
