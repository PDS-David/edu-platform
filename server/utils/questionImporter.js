// server/utils/questionImporter.js
// ─────────────────────────────────────────────────────────────────────────────
// Parses JSON/CSV question files and batch-inserts into DB with duplicate
// detection and full transaction rollback on fatal error.
//
// Expected JSON shape (single question object):
// {
//   "question_text": "What is...",
//   "question_type": "multiple_choice",          // optional, default "multiple_choice"
//   "exam_board_id": "5f36f69f-078e-4a4f-951a-200d7f2c6623",  // UUID
//   "subject_id": "3a1bc...",                    // UUID (optional)
//   "year": 2023,                                // optional
//   "topic": "Algebra",                          // optional
//   "difficulty": "medium",                      // optional: easy|medium|hard
//   "explanation": "Because...",                 // optional
//   "source": "admin_import",                    // optional, defaults to admin_import
//   "options": [
//     { "text": "Option A", "is_correct": false },
//     { "text": "Option B", "is_correct": true  },
//     { "text": "Option C", "is_correct": false },
//     { "text": "Option D", "is_correct": false }
//   ],
//   "hints": ["Hint 1", "Hint 2", "Hint 3"]     // optional, max 3
// }
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

// ── Constants ─────────────────────────────────────────────────────────────

const VALID_QUESTION_TYPES = ['multiple_choice', 'true_false', 'short_answer'];
const VALID_DIFFICULTIES   = ['easy', 'medium', 'hard'];
const VALID_SOURCES        = ['admin_import', 'community'];
const MAX_OPTIONS          = 6;
const MIN_OPTIONS          = 2;

// ── UUID helper ───────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(v) { return UUID_REGEX.test(String(v)); }

// ── Validation ────────────────────────────────────────────────────────────

/**
 * Validates a single question object.
 * Returns { valid: true } or { valid: false, reason: string }
 */
function validateQuestion(q, index) {
  const tag = `Question[${index}]`;

  if (!q.question_text || typeof q.question_text !== 'string' || q.question_text.trim().length < 5) {
    return { valid: false, reason: `${tag}: question_text is missing or too short` };
  }

  // FIX: exam_board_id is now a UUID string, not an integer
  if (!q.exam_board_id || !isValidUUID(q.exam_board_id)) {
    return { valid: false, reason: `${tag}: exam_board_id must be a valid UUID` };
  }

  if (!Array.isArray(q.options) || q.options.length < MIN_OPTIONS || q.options.length > MAX_OPTIONS) {
    return { valid: false, reason: `${tag}: options must be an array of ${MIN_OPTIONS}–${MAX_OPTIONS} items` };
  }

  for (let i = 0; i < q.options.length; i++) {
    const opt = q.options[i];
    if (!opt.text || typeof opt.text !== 'string' || opt.text.trim().length === 0) {
      return { valid: false, reason: `${tag} option[${i}]: text is empty` };
    }
    if (typeof opt.is_correct !== 'boolean') {
      return { valid: false, reason: `${tag} option[${i}]: is_correct must be boolean` };
    }
  }

  const correctCount = q.options.filter(o => o.is_correct).length;
  if (correctCount === 0) {
    return { valid: false, reason: `${tag}: no correct answer marked` };
  }

  if (q.difficulty && !VALID_DIFFICULTIES.includes(q.difficulty)) {
    return { valid: false, reason: `${tag}: difficulty must be easy|medium|hard` };
  }

  if (q.source && !VALID_SOURCES.includes(q.source)) {
    return { valid: false, reason: `${tag}: source must be admin_import|community` };
  }

  if (q.year && (Number(q.year) < 1990 || Number(q.year) > new Date().getFullYear() + 1)) {
    return { valid: false, reason: `${tag}: year ${q.year} is out of range` };
  }

  if (q.hints) {
    if (!Array.isArray(q.hints) || q.hints.length > 3) {
      return { valid: false, reason: `${tag}: hints must be an array of max 3 strings` };
    }
  }

  return { valid: true };
}

// ── Parse JSON ────────────────────────────────────────────────────────────

/**
 * parseJSON(filePath)
 * Reads a JSON file (array of question objects OR { questions: [...] })
 * Returns { questions: [], errors: [] }
 */
function parseJSON(filePath) {
  const errors   = [];
  const questions = [];

  if (!fs.existsSync(filePath)) {
    return { questions: [], errors: [`File not found: ${filePath}`] };
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return { questions: [], errors: [`Cannot read file: ${e.message}`] };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { questions: [], errors: [`Invalid JSON: ${e.message}`] };
  }

  // Support both array and { questions: [...] } wrapper
  const arr = Array.isArray(parsed) ? parsed : (parsed.questions || []);

  if (!Array.isArray(arr) || arr.length === 0) {
    return { questions: [], errors: ['JSON must contain a non-empty array of questions'] };
  }

  arr.forEach((q, i) => {
    const result = validateQuestion(q, i);
    if (result.valid) {
      questions.push(q);
    } else {
      errors.push(result.reason);
    }
  });

  return { questions, errors };
}

// ── Parse CSV ─────────────────────────────────────────────────────────────

/**
 * parseCSV(filePath)
 * Handles simple CSV with columns:
 * question_text, exam_board_id, subject_id, year, topic, difficulty,
 * explanation, option_a, option_b, option_c, option_d, correct_option
 * correct_option = "A"|"B"|"C"|"D"
 *
 * NOTE: exam_board_id and subject_id must be UUID strings in the CSV.
 */
function parseCSV(filePath) {
  const errors    = [];
  const questions = [];

  if (!fs.existsSync(filePath)) {
    return { questions: [], errors: [`File not found: ${filePath}`] };
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return { questions: [], errors: [`Cannot read CSV: ${e.message}`] };
  }

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { questions: [], errors: ['CSV must have a header row and at least one data row'] };
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const required = ['question_text', 'exam_board_id', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option'];

  for (const req of required) {
    if (!headers.includes(req)) {
      return { questions: [], errors: [`CSV missing required column: ${req}`] };
    }
  }

  for (let i = 1; i < lines.length; i++) {
    // Basic CSV split (does not handle quoted commas — use JSON for complex data)
    const values = lines[i].split(',').map(v => v.trim());
    const row    = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

    const correctMap = { a: 0, b: 1, c: 2, d: 3 };
    const correctIdx = correctMap[(row.correct_option || '').toLowerCase()];

    // FIX: exam_board_id and subject_id are UUIDs — store as-is, no parseInt
    const q = {
      question_text: row.question_text,
      question_type: 'multiple_choice',
      exam_board_id: row.exam_board_id || null,
      subject_id:    row.subject_id    || null,
      year:          row.year          ? parseInt(row.year, 10) : null,
      topic:         row.topic         || null,
      difficulty:    row.difficulty    || 'medium',
      explanation:   row.explanation   || null,
      source:        'admin_import',
      options: [
        { text: row.option_a, is_correct: correctIdx === 0 },
        { text: row.option_b, is_correct: correctIdx === 1 },
        { text: row.option_c, is_correct: correctIdx === 2 },
        { text: row.option_d, is_correct: correctIdx === 3 },
      ],
    };

    const result = validateQuestion(q, i);
    if (result.valid) {
      questions.push(q);
    } else {
      errors.push(result.reason);
    }
  }

  return { questions, errors };
}

// ── Batch Insert ──────────────────────────────────────────────────────────

/**
 * batchInsert(questions[], adminId)
 * Inserts validated question objects inside a single transaction.
 * Skips duplicates (same question_text + exam_board_id).
 * Returns { inserted, skipped, errors[] }
 */
async function batchInsert(questions, adminId) {
  let inserted = 0;
  let skipped  = 0;
  const errors = [];

  const transaction = await sequelize.transaction();

  try {
    for (const q of questions) {
      // ── Duplicate detection ──────────────────────────────────────────
      // FIX: exam_board_id is a UUID — compare directly as text, no cast needed
      const existing = await sequelize.query(
        `SELECT id FROM questions
         WHERE LOWER(TRIM(question_text)) = LOWER(TRIM(:text))
           AND exam_board_id = :board_id
         LIMIT 1`,
        {
          replacements: { text: q.question_text, board_id: q.exam_board_id },
          type: QueryTypes.SELECT,
          transaction,
        }
      );

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // ── Insert question ───────────────────────────────────────────────
      const insertedQ = await sequelize.query(
        `INSERT INTO questions
           (question_text, question_type, exam_board_id, subject_id, year,
            topic, difficulty, explanation, source, status, submitted_by,
            reviewed_by, reviewed_at, created_at, updated_at)
         VALUES
           (:question_text, :question_type, :exam_board_id, :subject_id, :year,
            :topic, :difficulty, :explanation, :source, 'approved', :submitted_by,
            :reviewed_by, NOW(), NOW(), NOW())
         RETURNING id`,
        {
          replacements: {
            question_text: q.question_text.trim(),
            question_type: q.question_type || 'multiple_choice',
            exam_board_id: q.exam_board_id,  // UUID string — no parseInt
            subject_id:    q.subject_id || null, // UUID string or null — no parseInt
            year:          q.year       || null,
            topic:         q.topic      || null,
            difficulty:    q.difficulty || 'medium',
            explanation:   q.explanation || null,
            source:        q.source     || 'admin_import',
            submitted_by:  adminId,
            reviewed_by:   adminId,
          },
          type: QueryTypes.SELECT,
          transaction,
        }
      );

      const questionId = insertedQ[0].id;

      // ── Insert answer options ─────────────────────────────────────────
      for (const opt of q.options) {
        await sequelize.query(
          `INSERT INTO answer_options (question_id, option_text, is_correct, created_at)
           VALUES (:question_id, :option_text, :is_correct, NOW())`,
          {
            replacements: {
              question_id:  questionId,
              option_text:  opt.text.trim(),
              is_correct:   opt.is_correct,
            },
            type: QueryTypes.INSERT,
            transaction,
          }
        );
      }

      // ── Insert hints (optional) ───────────────────────────────────────
      if (Array.isArray(q.hints)) {
        for (let hi = 0; hi < Math.min(q.hints.length, 3); hi++) {
          if (q.hints[hi] && q.hints[hi].trim()) {
            await sequelize.query(
              `INSERT INTO question_hints (question_id, hint_order, hint_text, created_at)
               VALUES (:question_id, :hint_order, :hint_text, NOW())
               ON CONFLICT (question_id, hint_order) DO NOTHING`,
              {
                replacements: {
                  question_id: questionId,
                  hint_order:  hi + 1,
                  hint_text:   q.hints[hi].trim(),
                },
                type: QueryTypes.INSERT,
                transaction,
              }
            );
          }
        }
      }

      inserted++;
    }

    await transaction.commit();
    return { inserted, skipped, errors };

  } catch (err) {
    await transaction.rollback();
    console.error('[questionImporter] batchInsert error:', err.message);
    return {
      inserted: 0,
      skipped:  0,
      errors:   [`Transaction rolled back: ${err.message}`],
    };
  }
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = { parseJSON, parseCSV, batchInsert, validateQuestion };
