const { QueryTypes } = require('sequelize');
const db = require('../config/database');

/**
 * @desc    Get all subjects
 * @route   GET /api/subjects
 * @access  Public
 */
const getSubjects = async (req, res) => {
  try {
    const { level, category, exam_board_id } = req.query;
    const student_id = req.user?.id || null;

    const params = [];

    if (level)         { params.push(level);         }
    if (category)      { params.push(category);      }
    if (exam_board_id) { params.push(exam_board_id); }

    // Build WHERE clauses
    let where = 'WHERE s.is_active = true';
    let pIdx  = 1;
    if (level)         { where += ` AND s.level = $${pIdx++}`;          }
    if (category)      { where += ` AND s.category = $${pIdx++}`;       }
    if (exam_board_id) { where += ` AND s.exam_board_id = $${pIdx++}`;  }

    // completion_pct requires student_id; push it as the last param if present
    let completionSelect;
    if (student_id) {
      params.push(student_id);
      const spIdx = pIdx++;
      completionSelect = `
        COALESCE(
          (SELECT ROUND(
             COUNT(CASE WHEN sp.quiz_completed THEN 1 END)::decimal /
             NULLIF(COUNT(st.id), 0) * 100
           )
           FROM subtopics st
           LEFT JOIN subtopic_progress sp
             ON sp.subtopic_id = st.id AND sp.student_id = $${spIdx}
           JOIN topics t ON t.id = st.topic_id
           WHERE t.subject_id = s.id
          ), 0
        ) AS completion_pct`;
    } else {
      completionSelect = `0 AS completion_pct`;
    }

    const query = `
      SELECT s.*,
        ${completionSelect},
        COALESCE(
          (SELECT COUNT(st.id)
           FROM subtopics st
           JOIN topics t ON t.id = st.topic_id
           WHERE t.subject_id = s.id), 0
        ) AS subtopic_count
      FROM subjects s
      ${where}
      ORDER BY s.name`;

    const result = await db.query(query, {
      bind: params.length > 0 ? params : undefined,
      type: QueryTypes.SELECT,
    });

    res.status(200).json({ success: true, count: result.length, data: result });
  } catch (error) {
    console.error('Get subjects error:', error);
    res.status(500).json({ success: false, error: 'Server error fetching subjects' });
  }
};

/**
 * @desc    Get single subject
 * @route   GET /api/subjects/:id
 * @access  Public
 */
const getSubject = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM subjects WHERE id = $1',
      {
        bind: [req.params.id],
        type: QueryTypes.SELECT
      }
    );

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found'
      });
    }

    res.status(200).json({
      success: true,
      data: result[0]
    });
  } catch (error) {
    console.error('Get subject error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching subject'
    });
  }
};

/**
 * @desc    Create subject
 * @route   POST /api/subjects
 * @access  Private (Admin only)
 */
const createSubject = async (req, res) => {
  try {
    const { name, code, description, category, level, icon, color } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        error: 'Please provide name and code'
      });
    }

    const result = await db.query(
      `INSERT INTO subjects (name, code, description, category, level, icon, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      {
        bind: [name, code, description, category, level, icon, color],
        type: QueryTypes.INSERT
      }
    );

    res.status(201).json({
      success: true,
      data: result[0][0]
    });
  } catch (error) {
    console.error('Create subject error:', error);

    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        error: 'Subject code already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error creating subject'
    });
  }
};

module.exports = {
  getSubjects,
  getSubject,
  createSubject
};
