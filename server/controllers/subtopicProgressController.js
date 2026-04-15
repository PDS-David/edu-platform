'use strict';

const Service = require('../services/subtopicProgressService');

// ─────────────────────────────────────────────
// MARK RESOURCE COMPLETE
// ─────────────────────────────────────────────
exports.completeResource = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { subtopicId } = req.body;

    const updated = await Service.updateField(
      studentId,
      subtopicId,
      'resources_completed',
      true
    );

    const evaluated = await Service.evaluateCompletion(studentId, subtopicId);

    return res.json({
      success: true,
      data: evaluated || updated
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to mark resource complete'
    });
  }
};

// ─────────────────────────────────────────────
// MARK PRACTICE COMPLETE
// ─────────────────────────────────────────────
exports.completePractice = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { subtopicId } = req.body;

    const updated = await Service.updateField(
      studentId,
      subtopicId,
      'practice_completed',
      true
    );

    const evaluated = await Service.evaluateCompletion(studentId, subtopicId);

    return res.json({
      success: true,
      data: evaluated || updated
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to mark practice complete'
    });
  }
};

// ─────────────────────────────────────────────
// MARK QUIZ COMPLETE
// ─────────────────────────────────────────────
exports.completeQuiz = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { subtopicId } = req.body;

    const updated = await Service.updateField(
      studentId,
      subtopicId,
      'quiz_completed',
      true
    );

    const evaluated = await Service.evaluateCompletion(studentId, subtopicId);

    return res.json({
      success: true,
      data: evaluated || updated
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to mark quiz complete'
    });
  }
};
