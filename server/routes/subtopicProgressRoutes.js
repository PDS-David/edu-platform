'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const progressEngine = require('../services/progressEngine');

/**
 * POST /api/subtopic-progress/resource
 */
router.post('/resource', protect, async (req, res) => {
  try {
    const { subtopic_id } = req.body;

    const result = await progressEngine.markField(
      req.user.id,
      subtopic_id,
      'resources_completed',
      true
    );

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to mark resource' });
  }
});

/**
 * POST /api/subtopic-progress/practice
 */
router.post('/practice', protect, async (req, res) => {
  try {
    const { subtopic_id } = req.body;

    const result = await progressEngine.markField(
      req.user.id,
      subtopic_id,
      'practice_completed',
      true
    );

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to mark practice' });
  }
});

/**
 * POST /api/subtopic-progress/quiz
 */
router.post('/quiz', protect, async (req, res) => {
  try {
    const { subtopic_id } = req.body;

    const result = await progressEngine.markField(
      req.user.id,
      subtopic_id,
      'quiz_completed',
      true
    );

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to mark quiz' });
  }
});

/**
 * POST /api/subtopic-progress/notes
 */
router.post('/notes', protect, async (req, res) => {
  try {
    const { subtopic_id } = req.body;

    const result = await progressEngine.markField(
      req.user.id,
      subtopic_id,
      'notes_viewed',
      true
    );

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to mark notes' });
  }
});

/**
 * POST /api/subtopic-progress/video
 */
router.post('/video', protect, async (req, res) => {
  try {
    const { subtopic_id } = req.body;

    const result = await progressEngine.markField(
      req.user.id,
      subtopic_id,
      'video_watched',
      true
    );

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to mark video' });
  }
});

/**
 * GET /api/subtopic-progress/:id
 */
router.get('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;

    const data = await progressEngine.getProgress(req.user.id, id);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch progress' });
  }
});

module.exports = router;
