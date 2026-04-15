'use strict';

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const {
  updateProgress,
  getProgress,
} = require('../services/subtopicProgressService');

/**
 * -----------------------------------------------------
 * GET CURRENT PROGRESS
 * GET /api/subtopic-progress/:subtopicId
 * -----------------------------------------------------
 */
router.get('/:subtopicId', protect, async (req, res) => {
  try {
    const studentId = req.user.id;
    const subtopicId = Number(req.params.subtopicId);

    if (!subtopicId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subtopic ID',
      });
    }

    const data = await getProgress(studentId, subtopicId);

    return res.json({
      success: true,
      data: data || null,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch progress',
    });
  }
});

/**
 * -----------------------------------------------------
 * UPDATE PROGRESS (CORE ENGINE ENTRY POINT)
 * POST /api/subtopic-progress/:subtopicId
 * -----------------------------------------------------
 */
router.post('/:subtopicId', protect, async (req, res) => {
  try {
    const studentId = req.user.id;
    const subtopicId = Number(req.params.subtopicId);

    if (!subtopicId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subtopic ID',
      });
    }

    const result = await updateProgress(
      studentId,
      subtopicId,
      req.body
    );

    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to update progress',
    });
  }
});

module.exports = router;
