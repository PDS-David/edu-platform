'use strict';

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const TASKS = ['resources', 'practice', 'quiz'];

const columnMap = {
  resources: 'resources_completed',
  practice: 'practice_completed',
  quiz: 'quiz_completed',
};

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isValidUUID(v) {
  return UUID_REGEX.test(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE UTIL: progress computation (single source of truth)
// ─────────────────────────────────────────────────────────────────────────────

function computeProgress(p) {
  const tasksDone = TASKS
    .map((t) => p[`${t}_completed`])
    .filter(Boolean).length;

  return {
    tasks_done: tasksDone,
    tasks_remaining: TASKS.length - tasksDone,
    completion_pct: Math.round((tasksDone / TASKS.length) * 100),
    subtopic_fully_complete: tasksDone === TASKS.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/subtopics/:id/progress
// Student self progress (JWT-based)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:id/progress', protect, async (req, res) => {
  const { id } = req.params;
  const studentId = req.user.id;

  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid subtopic ID' });
  }

  try {
    const rows = await sequelize.query(
      `
      SELECT resources_completed, practice_completed, quiz_completed, completed_at, updated_at
      FROM subtopic_progress
      WHERE subtopic_id = :id AND student_id = :studentId
      `,
      {
        replacements: { id, studentId },
        type: QueryTypes.SELECT,
      }
    );

    const progress = rows[0] || {
      resources_completed: false,
      practice_completed: false,
      quiz_completed: false,
      completed_at: null,
      updated_at: null,
    };

    const computed = computeProgress(progress);

    return res.status(200).json({
      success: true,
      data: {
        ...progress,
        ...computed,
        completion_label: `${computed.completion_pct}% Complete`,
        tasks_label: `${computed.tasks_remaining} task${
          computed.tasks_remaining !== 1 ? 's' : ''
        } remaining`,
      },
    });
  } catch (err) {
    console.error('[GET progress]', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch subtopic progress',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/subtopics/:id/progress/:studentId
// Admin / teacher access only
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:id/progress/:studentId', protect, async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  const { id, studentId } = req.params;

  if (!isValidUUID(id) || !isValidUUID(studentId)) {
    return res.status(400).json({ success: false, error: 'Invalid ID format' });
  }

  try {
    const rows = await sequelize.query(
      `
      SELECT resources_completed, practice_completed, quiz_completed, completed_at, updated_at
      FROM subtopic_progress
      WHERE subtopic_id = :id AND student_id = :studentId
      `,
      {
        replacements: { id, studentId },
        type: QueryTypes.SELECT,
      }
    );

    const progress = rows[0] || {
      resources_completed: false,
      practice_completed: false,
      quiz_completed: false,
      completed_at: null,
      updated_at: null,
    };

    return res.status(200).json({
      success: true,
      data: {
        ...progress,
        ...computeProgress(progress),
      },
    });
  } catch (err) {
    console.error('[ADMIN progress]', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch subtopic progress',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/subtopics/:id/progress
// Mark a task as complete (student)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/progress', protect, async (req, res) => {
  const { id } = req.params;
  const { task } = req.body;
  const studentId = req.user.id;

  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid subtopic ID' });
  }

  if (!TASKS.includes(task)) {
    return res.status(400).json({
      success: false,
      error: `task must be one of: ${TASKS.join(', ')}`,
    });
  }

  const column = columnMap[task];

  try {
    await sequelize.query(
      `
      INSERT INTO subtopic_progress (student_id, subtopic_id, ${column}, created_at, updated_at)
      VALUES (:studentId, :subtopicId, true, NOW(), NOW())
      ON CONFLICT (student_id, subtopic_id)
      DO UPDATE SET ${column} = true, updated_at = NOW()
      `,
      {
        replacements: { studentId, subtopicId: id },
        type: QueryTypes.INSERT,
      }
    );

    const rows = await sequelize.query(
      `
      SELECT resources_completed, practice_completed, quiz_completed
      FROM subtopic_progress
      WHERE student_id = :studentId AND subtopic_id = :subtopicId
      `,
      {
        replacements: { studentId, subtopicId: id },
        type: QueryTypes.SELECT,
      }
    );

    const progress = rows[0];
    const computed = computeProgress(progress);

    if (computed.subtopic_fully_complete) {
      await sequelize.query(
        `
        UPDATE subtopic_progress
        SET completed_at = NOW()
        WHERE student_id = :studentId
          AND subtopic_id = :subtopicId
          AND completed_at IS NULL
        `,
        {
          replacements: { studentId, subtopicId: id },
          type: QueryTypes.UPDATE,
        }
      );
    }

    return res.status(200).json({
      success: true,
      message: `${task} marked as complete`,
      data: {
        ...progress,
        ...computed,
      },
    });
  } catch (err) {
    console.error('[POST progress]', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to update subtopic progress',
    });
  }
});

module.exports = router;
