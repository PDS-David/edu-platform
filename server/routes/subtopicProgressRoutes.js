'use strict';

const express = require('express');
const router  = express.Router();

const SubtopicProgressService = require('../services/subtopicProgressService');

/**
 * GET /api/subtopic-progress/:subtopicId
 * Returns progress state for one subtopic for the authenticated student.
 */
router.get('/:subtopicId', async (req, res) => {
  try {
    const studentId  = req.user.id;
    const subtopicId = Number(req.params.subtopicId);

    if (!subtopicId || !Number.isInteger(subtopicId) || subtopicId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid subtopic ID' });
    }

    // getStudentProgress returns all rows for a student — filter to this subtopic
    const rows = await SubtopicProgressService.getStudentProgress(studentId);
    const row  = rows.find(r => Number(r.subtopic_id) === subtopicId) || null;

    return res.json({
      success: true,
      data: {
        resources_completed: row?.resources_completed ?? false,
        practice_completed:  row?.practice_completed  ?? false,
        quiz_completed:      row?.quiz_completed       ?? false,
      },
    });
  } catch (err) {
    console.error('[GET /subtopic-progress/:subtopicId]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch progress' });
  }
});

/**
 * POST /api/subtopic-progress/:subtopicId
 * Body: { task: 'resources' | 'practice' | 'quiz' }
 *   OR full object: { resources_completed, practice_completed, quiz_completed, ... }
 *
 * FIX: previously called service as updateProgress(studentId, subtopicId, req.body)
 * — 3 positional args — but SubtopicProgressService.updateProgress expects a SINGLE
 * destructured object { studentId, subtopicId, resources_completed, ... }.
 * All boolean fields received undefined → Postgres NOT NULL constraint violation → 500.
 */
router.post('/:subtopicId', async (req, res) => {
  try {
    const studentId  = req.user.id;
    const subtopicId = Number(req.params.subtopicId);

    if (!subtopicId || !Number.isInteger(subtopicId) || subtopicId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid subtopic ID' });
    }

    const TASK_MAP = {
      resources: 'resources_completed',
      practice:  'practice_completed',
      quiz:      'quiz_completed',
    };

    // Build full payload with safe boolean defaults
    const payload = {
      studentId,
      subtopicId,
      resources_completed: req.body.resources_completed ?? false,
      practice_completed:  req.body.practice_completed  ?? false,
      quiz_completed:      req.body.quiz_completed       ?? false,
      notes_viewed:        req.body.notes_viewed         ?? false,
      video_watched:       req.body.video_watched        ?? false,
    };

    // Support { task: 'quiz' } shorthand — flip just that field to true
    if (req.body.task && TASK_MAP[req.body.task]) {
      payload[TASK_MAP[req.body.task]] = true;
    }

    const result = await SubtopicProgressService.updateProgress(payload);

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[POST /subtopic-progress/:subtopicId]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update progress' });
  }
});

module.exports = router;
