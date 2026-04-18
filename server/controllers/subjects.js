// server/controllers/subjects.js

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * GET /api/subjects
 *
 * Normal mode  — returns all subjects with exam board info, supports filters:
 *   ?level=           filter by level
 *   ?category=        filter by category
 *   ?exam_board_id=   filter by board id
 *   ?exam_board_code= filter by board code
 *
 * Test Builder mode — ?for_test_builder=true
 *   Returns one row per unique subject name (deduplicates subjects that exist
 *   across multiple exam boards). The Test Builder dropdown only needs a clean
 *   list of names + one valid id per name to pass as subject_id when creating
 *   a test. Uses DISTINCT ON (s.name) so PostgreSQL picks one representative
 *   row per name, ordered alphabetically.
 */
const getSubjects = async (req, res) => {
  try {
    const {
      level,
      category,
      exam_board_id,
      exam_board_code,
      for_test_builder,
    } = req.query;

    // ── Test Builder mode: deduplicated subject list ──────────────────────────
    if (for_test_builder === 'true') {
      const result = await sequelize.query(
        `SELECT DISTINCT ON (s.name)
           s.id,
           s.name,
           s.code,
           s.level,
           s.is_active
         FROM subjects s
         WHERE s.is_active = true
         ORDER BY s.name`,
        { type: QueryTypes.SELECT }
      );

      return res.status(200).json({
        success: true,
        count:   result.length,
        data:    result,
      });
    }

    // ── Normal mode (all other callers) ───────────────────────────────────────
    // When no exam_board filter is applied we deduplicate by name so the same
    // subject that exists under multiple exam boards only appears once in any
    // dropdown.  When an exam_board filter IS supplied we return all rows for
    // that board (the caller needs the board-specific id).
    const params = [];
    let pIdx = 1;

    const hasExamBoardFilter = !!(exam_board_id || exam_board_code);

    const join =
      `LEFT JOIN exam_boards eb
       ON eb.id = s.exam_board_id`;

    let where =
      `WHERE s.is_active = true`;

    if (level) {
      params.push(level);
      where += ` AND s.level = $${pIdx++}`;
    }

    if (category) {
      params.push(category);
      where += ` AND s.category = $${pIdx++}`;
    }

    if (exam_board_id) {
      params.push(exam_board_id);
      where += ` AND s.exam_board_id = $${pIdx++}`;
    }

    if (exam_board_code) {
      params.push(exam_board_code.toUpperCase());
      where += ` AND UPPER(eb.code) = $${pIdx++}`;
    }

    // Deduplicate by name when no board filter — pick one representative row
    const distinctClause = hasExamBoardFilter ? '' : 'DISTINCT ON (s.name)';

    const query = `
      SELECT ${distinctClause}
        s.*,
        eb.code AS exam_board_code,
        eb.name AS exam_board_name
      FROM subjects s
      ${join}
      ${where}
      ORDER BY s.name
    `;

    const result = await sequelize.query(query, {
      bind: params.length > 0 ? params : undefined,
      type: QueryTypes.SELECT,
    });

    res.status(200).json({
      success: true,
      count:   result.length,
      data:    result,
    });

  } catch (error) {
    console.error('Get subjects error:', error);
    res.status(500).json({
      success: false,
      error:   'Server error fetching subjects',
    });
  }
};

/**
 * GET /api/subjects/:id
 */
const getSubject = async (req, res) => {
  try {
    const result = await sequelize.query(
      `SELECT
         s.*,
         eb.code AS exam_board_code,
         eb.name AS exam_board_name
       FROM subjects s
       LEFT JOIN exam_boards eb
         ON eb.id = s.exam_board_id
       WHERE s.id = $1`,
      {
        bind: [req.params.id],
        type: QueryTypes.SELECT,
      }
    );

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        error:   'Subject not found',
      });
    }

    res.status(200).json({
      success: true,
      data:    result[0],
    });

  } catch (error) {
    console.error('Get subject error:', error);
    res.status(500).json({
      success: false,
      error:   'Server error fetching subject',
    });
  }
};

/**
 * POST /api/subjects
 */
const createSubject = async (req, res) => {
  try {
    const { name, code, description, level, exam_board_id } = req.body;

    if (!name || !code || !exam_board_id) {
      return res.status(400).json({
        success: false,
        error:   'name, code, and exam_board_id are required',
      });
    }

    const result = await sequelize.query(
      `INSERT INTO subjects (exam_board_id, name, code, description, level, is_active, created_at, updated_at)
       VALUES (:exam_board_id, :name, UPPER(:code), :description, :level, true, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          exam_board_id,
          name,
          code,
          description: description || null,
          level:       level       || null,
        },
        type: QueryTypes.SELECT,
      }
    );

    res.status(201).json({
      success: true,
      data:    result[0],
    });

  } catch (error) {
    console.error('Create subject error:', error);
    res.status(500).json({
      success: false,
      error:   'Server error creating subject',
    });
  }
};

module.exports = {
  getSubjects,
  getSubject,
  createSubject,
};
