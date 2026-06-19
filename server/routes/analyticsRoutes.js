'use strict';

// server/routes/analyticsRoutes.js
// All analytics — student dashboard + teacher/admin views.
// Key fix: questions join to subjects via subtopics→topics chain, not directly.
// practice_attempts columns: student_id, question_id, is_correct, attempted_at, time_taken_seconds

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');
const { ENROLLMENT_STATUS } = require('../constants/enrollmentConstants');
const { requireTeacherAnalyticsScope } = require('../middleware/teacherScope');

// Safe wrapper — returns fallback on any DB error.
// Classifies errors into three categories for actionable log output:
//
//   "Analytics table missing"  — Postgres 42P01 / "relation does not exist"
//   "Analytics column missing"  — Postgres 42703 / "column does not exist"
//   "Analytics query failed"    — everything else (syntax, type mismatch, etc.)
//
// Signature is unchanged: safeQuery(sql, replacements, fallback?)
// All callers continue to receive the fallback value; no endpoint crashes.
const safeQuery = async (sql, replacements, fallback = []) => {
  try {
    return await sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  } catch (e) {
    // Postgres SQLSTATE code is on err.original (Sequelize 6) or err.parent.
    // Fall back to message-pattern matching when the code is unavailable
    // (e.g. connection-level errors surfaced before reaching Postgres).
    const pgCode = e.original?.code ?? e.parent?.code ?? '';
    const msg    = e.message ?? '';

    if (pgCode === '42P01' || /relation .+ does not exist/i.test(msg)) {
      // Extract the table name from the Postgres message when possible.
      const match = msg.match(/relation "?([^"\s]+)"? does not exist/i);
      const table = match ? match[1] : 'unknown';
      console.warn(`[analytics] Analytics table missing: ${table}`);
    } else if (pgCode === '42703' || /column .+ does not exist/i.test(msg)) {
      // Extract the column name from the Postgres message when possible.
      const match = msg.match(/column "?([^"\s]+)"? does not exist/i);
      const column = match ? match[1] : 'unknown';
      console.warn(`[analytics] Analytics column missing: ${column}`);
    } else {
      // Unexpected failure — log the full message so it can be investigated.
      console.error(`[analytics] Analytics query failed: ${msg.slice(0, 200)}`);
    }

    return fallback;
  }
};

// Correct join chain: questions → subtopics → topics → subjects
const SUBJECT_JOIN = `
  JOIN subtopics st ON st.id = q.subtopic_id
  JOIN topics    t  ON t.id  = st.topic_id
  JOIN subjects  s  ON s.id  = t.subject_id
`;

// ── validateAnalyticsSchema() ─────────────────────────────────────────────────
// Queries the PostgreSQL information_schema to verify that all tables and
// critical columns required by analytics queries exist in the current DB.
//
// Returns: { valid: boolean, warnings: string[] }
//
// Rules:
//   - Never throws.  All errors are caught and turned into warnings.
//   - Missing tables/columns produce a warning entry; they do NOT crash the caller.
//   - valid === true  → every required table and column exists.
//   - valid === false → at least one item is missing; warnings lists which ones.
//
// Usage:
//   const { valid, warnings } = await validateAnalyticsSchema();
//   warnings.forEach(w => console.warn('[analytics]', w));
const ANALYTICS_TABLES = [
  'practice_attempts',
  'questions',
  'subtopics',
  'topics',
  'subjects',
];

// Critical columns verified by this helper.
// Each entry: [table, column, reason]
//   reason  — printed in the warning so operators know exactly what breaks
//             when the column is absent. Must be actionable.
const ANALYTICS_COLUMNS = [
  // users.last_activity_date is written by xpMiddleware after every practice
  // attempt and is read by scheduledJobs (weekly digest, re-engagement filter).
  // Missing → streak calculations silently return 0; re-engagement emails stop firing.
  ['users',            'last_activity_date',  'required by xpMiddleware streak calc and scheduledJobs digest/re-engage filter'],

  // practice_attempts core columns — every analytics query depends on these.
  ['practice_attempts', 'is_correct',         'required by every accuracy_pct calculation'],
  ['practice_attempts', 'attempted_at',        'required by active_days, today_attempts, score-trend, daily-study'],
  ['practice_attempts', 'time_taken_seconds',  'required by total_time_seconds and time-metrics benchmark'],

  // questions.subtopic_id is the root of the JOIN chain used by all analytics routes.
  // Missing → every query that joins to topics/subjects returns zero rows silently.
  ['questions',         'subtopic_id',         'required by the questions→subtopics→topics→subjects JOIN chain'],
];

// Module-level cache for validateAnalyticsSchema().
// Avoids hitting information_schema on every GET /analytics/summary request.
// TTL: 5 minutes (300,000 ms).
let schemaValidationCache   = null;
let schemaValidationCacheAt = 0;
const SCHEMA_CACHE_TTL_MS   = 5 * 60 * 1000; // 5 minutes

async function validateAnalyticsSchema() {
  // Return cached result if it is younger than 5 minutes.
  if (schemaValidationCache !== null && (Date.now() - schemaValidationCacheAt) < SCHEMA_CACHE_TTL_MS) {
    return schemaValidationCache;
  }

  const warnings = [];

  try {
    // ── 1. Table existence check ───────────────────────────────────────────
    // information_schema.tables is always present in PostgreSQL and Supabase.
    // table_schema = 'public' excludes pg_catalog / information_schema system tables.
    const tableRows = await sequelize.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name   = ANY(:tables)`,
      {
        replacements: { tables: ANALYTICS_TABLES },
        type: QueryTypes.SELECT,
      }
    );

    const foundTables = new Set(tableRows.map(r => r.table_name));

    for (const tbl of ANALYTICS_TABLES) {
      if (!foundTables.has(tbl)) {
        warnings.push(`Required analytics table is missing: "${tbl}" — run fix_live_schema.js to create it`);
      }
    }
  } catch (err) {
    // information_schema.tables query itself failed — likely a connection problem.
    warnings.push(`Schema table-check query failed: ${(err.message || '').slice(0, 200)}`);
  }

  try {
    // ── 2. Critical column existence check ────────────────────────────────
    // One query fetches all (table_name, column_name) pairs at once to avoid
    // N round-trips. We then cross-check against the expected list in JS.
    const tableNames   = ANALYTICS_COLUMNS.map(([t]) => t);
    const columnNames  = ANALYTICS_COLUMNS.map(([, c]) => c);

    const columnRows = await sequelize.query(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = ANY(:tables)
          AND column_name  = ANY(:columns)`,
      {
        replacements: { tables: tableNames, columns: columnNames },
        type: QueryTypes.SELECT,
      }
    );

    // Build a Set of "table.column" keys for O(1) lookup.
    const foundColumns = new Set(
      columnRows.map(r => `${r.table_name}.${r.column_name}`)
    );

    for (const [table, column, reason] of ANALYTICS_COLUMNS) {
      if (!foundColumns.has(`${table}.${column}`)) {
        warnings.push(
          `Required analytics column is missing: "${table}.${column}" — ${reason}`
        );
      }
    }
  } catch (err) {
    // information_schema.columns query itself failed.
    warnings.push(`Schema column-check query failed: ${(err.message || '').slice(0, 200)}`);
  }

  const result = { valid: warnings.length === 0, warnings };

  // Store in module-level cache with current timestamp.
  schemaValidationCache   = result;
  schemaValidationCacheAt = Date.now();

  return result;
}

// ── GET /api/analytics/summary ────────────────────────────────────────────────
router.get('/summary', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate that all five tables exist before running the multi-table JOIN.
    // Warnings are logged but never cause a 500 — safeQuery handles missing tables
    // gracefully by returning the fallback value instead.
    const { valid, warnings } = await validateAnalyticsSchema();
    if (!valid) {
      warnings.forEach(w => console.warn('[analytics/summary]', w));
    }
    const [userRows, attemptRows] = await Promise.all([
      safeQuery(
        `SELECT
           -- Null-safe: users with no XP or streak return 0, not null
           COALESCE(xp_points, 0)          AS xp_points,
           COALESCE(study_streak_days, 0)  AS study_streak_days
         FROM users WHERE id = :userId`,
        { userId }, [{}]
      ),
      safeQuery(
        `SELECT
           -- Total rows in practice_attempts for this student
           COUNT(*)::INTEGER AS total_attempts,

           -- Accuracy: CASE avoids division-by-zero (COUNT(*) may be 0 at JS layer but
           -- AVG on an empty set returns NULL; COALESCE converts that to 0).
           -- Multiply by 100.0 (not 100) to keep ROUND precise to 1 decimal place.
           COALESCE(
             ROUND(
               AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0.0 END),
               1
             ),
             0
           )::NUMERIC AS accuracy_pct,

           -- subjects_practiced: distinct subjects reached via the correct join chain
           -- practice_attempts → questions → subtopics → topics → subjects
           COUNT(DISTINCT t.subject_id)::INTEGER AS subjects_practiced,

           -- total_time_seconds: SUM is NULL when no rows match; COALESCE to 0
           COALESCE(SUM(pa.time_taken_seconds), 0)::BIGINT AS total_time_seconds,

           -- today_attempts: attempts on the current server date (timezone-aware)
           COUNT(*) FILTER (
             WHERE pa.attempted_at >= CURRENT_DATE
               AND pa.attempted_at <  CURRENT_DATE + INTERVAL '1 day'
           )::INTEGER AS today_attempts

         FROM practice_attempts pa
         -- Join chain: questions → subtopics → topics (needed for subjects_practiced)
         JOIN questions  q  ON q.id  = pa.question_id
         JOIN subtopics  st ON st.id = q.subtopic_id
         JOIN topics     t  ON t.id  = st.topic_id
         WHERE pa.student_id = :userId`,
        { userId }, [{}]
      ),
    ]);
    const u = userRows[0]  || {};
    const a = attemptRows[0] || {};
    return res.json({ success: true, data: {
      total_attempts:     parseInt(a.total_attempts,     10) || 0,
      accuracy_pct:       parseFloat(a.accuracy_pct)        || 0,
      study_streak_days:  parseInt(u.study_streak_days,  10) || 0,
      xp_points:          parseInt(u.xp_points,          10) || 0,
      subjects_practiced: parseInt(a.subjects_practiced, 10) || 0,
      total_time_seconds: parseInt(a.total_time_seconds, 10) || 0,
      today_attempts:     parseInt(a.today_attempts,     10) || 0,
    }});
  } catch (err) {
    console.error('[GET /analytics/summary]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/weak-topics?limit=5 ───────────────────────────────────
router.get('/weak-topics', protect, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 5, 20);
  try {
    const rows = await safeQuery(
      `-- topic name + id come from the join chain:
       --   practice_attempts → questions → subtopics → topics → subjects
       -- q.topic (a plain text column) is NOT used; t.id/t.name are the authoritative source.
       -- st.id (subtopic_id) is included so the frontend can link directly to
       --   /student/subtopic/:subtopicId?tab=practice instead of a generic practice route.
       -- NOTE: selecting st.id means GROUP BY must also include st.id, so the result
       --   returns one row per (topic, subtopic, subject) rather than per topic alone.
       --   The HAVING + ORDER BY are unchanged; accuracy_pct still reflects that subtopic.
       SELECT
         t.id   AS topic_id,
         t.name AS topic,
         st.id  AS subtopic_id,
         s.name AS subject_name,
         COUNT(*)::INTEGER AS attempt_count,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS accuracy_pct
       FROM practice_attempts pa
       JOIN questions  q  ON q.id  = pa.question_id
       JOIN subtopics  st ON st.id = q.subtopic_id
       JOIN topics     t  ON t.id  = st.topic_id
       JOIN subjects   s  ON s.id  = t.subject_id
       WHERE pa.student_id = :userId
         AND pa.attempted_at > NOW() - INTERVAL '30 days'
       GROUP BY t.id, t.name, st.id, s.name
       HAVING COUNT(*) >= 2
       ORDER BY accuracy_pct ASC
       LIMIT :limit`,
      { userId: req.user.id, limit }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/score-trend?days=30 ───────────────────────────────────
router.get('/score-trend', protect, async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 30, 90);
  // safeQuery is the sole error boundary: missing tables/columns are caught
  // inside it and logged; the fallback [] is returned so the endpoint always
  // responds with HTTP 200 and an empty dataset rather than HTTP 500.
  const rows = await safeQuery(
    `SELECT
       DATE(pa.attempted_at) AS date,
       ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_score
     FROM practice_attempts pa
     WHERE pa.student_id = :userId
       AND pa.attempted_at > NOW() - (:days * INTERVAL '1 day')
     GROUP BY DATE(pa.attempted_at)
     ORDER BY date ASC`,
    { userId: req.user.id, days }
  );
  return res.json({ success: true, data: rows });
});

// ── GET /api/analytics/subject-breakdown ─────────────────────────────────────
// Join strategy:
//   student_subjects (anchor — guarantees every enrolled subject appears even
//                               with zero practice attempts)
//   → subjects           (subject name)
//   LEFT JOIN topics     (a subject may have no topics yet)
//   LEFT JOIN subtopics  (a topic may have no subtopics yet)
//   LEFT JOIN questions  (a subtopic may have no questions yet)
//   LEFT JOIN practice_attempts (filtered to this student — zero-attempt rows
//                                produce NULL which COALESCE converts to 0)
//
// COALESCE defaults ensure students with zero attempts still appear with
// attempts=0, accuracy_pct=0, avg_time_seconds=0 rather than being omitted.
router.get('/subject-breakdown', protect, async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT
         s.id   AS subject_id,
         s.name AS subject_name,
         COALESCE(COUNT(pa.id), 0)::INTEGER AS attempts,
         COALESCE(
           ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1),
           0
         ) AS accuracy_pct,
         COALESCE(ROUND(AVG(pa.time_taken_seconds), 1), 0) AS avg_time_seconds
       FROM student_subjects ss
       JOIN subjects s ON s.id = ss.subject_id
       LEFT JOIN topics     t  ON t.subject_id   = s.id
                               AND (t.is_active IS NULL OR t.is_active = true)
       LEFT JOIN subtopics  st ON st.topic_id    = t.id
                               AND (st.is_active IS NULL OR st.is_active = true)
       LEFT JOIN questions  q  ON q.subtopic_id  = st.id
                               AND (q.is_active IS NULL OR q.is_active = true)
       LEFT JOIN practice_attempts pa ON pa.question_id = q.id
                                     AND pa.student_id  = :userId
       WHERE ss.student_id = :userId
         AND ss.status     = :approvedStatus
         AND s.is_active   = true
       GROUP BY s.id, s.name
       ORDER BY attempts DESC NULLS LAST, s.name ASC`,
      { userId: req.user.id, approvedStatus: ENROLLMENT_STATUS.APPROVED }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /analytics/subject-breakdown]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/time-metrics ──────────────────────────────────────────
router.get('/time-metrics', protect, async (req, res) => {
  // safeQuery is the sole error boundary: missing tables/columns are caught
  // inside it and logged; the fallback [] is returned so the endpoint always
  // responds with HTTP 200 and an empty dataset rather than HTTP 500.
  const rows = await safeQuery(
    `WITH subject_bench AS (
       -- Aggregate per-subject average time across all students (benchmark).
       -- Runs without a student filter so every subject has a comparison point.
       SELECT t2.subject_id, AVG(pa2.time_taken_seconds) AS benchmark_seconds
       FROM practice_attempts pa2
       JOIN questions  q2 ON q2.id  = pa2.question_id
       JOIN subtopics  s2 ON s2.id  = q2.subtopic_id
       JOIN topics     t2 ON t2.id  = s2.topic_id
       GROUP BY t2.subject_id
     )
     SELECT
       s.name AS subject_name,
       COALESCE(ROUND(AVG(pa.time_taken_seconds), 1), 0)       AS avg_time_seconds,
       ROUND(sb.benchmark_seconds::NUMERIC, 1)    AS benchmark_time_seconds
     FROM practice_attempts pa
     JOIN questions  q  ON q.id  = pa.question_id
     JOIN subtopics  st ON st.id = q.subtopic_id
     JOIN topics     t  ON t.id  = st.topic_id
     JOIN subjects   s  ON s.id  = t.subject_id
     JOIN subject_bench sb ON sb.subject_id = t.subject_id
     WHERE pa.student_id = :userId
     GROUP BY s.name, sb.benchmark_seconds
     ORDER BY s.name`,
    { userId: req.user.id }
  );
  return res.json({ success: true, data: rows });
});

// ── GET /api/analytics/leaderboard?subject_id= ───────────────────────────────
router.get('/leaderboard', protect, async (req, res) => {
  const { subject_id } = req.query;
  try {
    const subjectClause = subject_id
      ? 'AND t.subject_id = :subject_id'
      : '';
    const replacements = { userId: req.user.id };
    if (subject_id) replacements.subject_id = subject_id;

    const rows = await safeQuery(
      `SELECT
         -- NULL-safe: COALESCE ensures a NULL first_name renders as '?***'
         -- rather than a blank entry. Existing non-null names are unaffected.
         COALESCE(SUBSTRING(u.first_name, 1, 3), '?') || '***' AS display_name,
         (u.id = :userId)::BOOLEAN AS is_me,
         COALESCE(u.xp_points, 0) AS xp_points,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS accuracy_pct,
         COUNT(pa.id)::INTEGER AS attempts
       FROM users u
       JOIN practice_attempts pa ON pa.student_id = u.id
       JOIN questions  q  ON q.id  = pa.question_id
       JOIN subtopics  st ON st.id = q.subtopic_id
       JOIN topics     t  ON t.id  = st.topic_id
       WHERE pa.attempted_at > NOW() - INTERVAL '7 days'
         ${subjectClause}
       GROUP BY u.id, u.first_name, u.xp_points
       ORDER BY xp_points DESC, accuracy_pct DESC
       LIMIT 10`,
      replacements
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/badges ─────────────────────────────────────────────────
router.get('/badges', protect, async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT badge_code, earned_at FROM user_badges
       WHERE user_id = :userId ORDER BY earned_at ASC`,
      { userId: req.user.id }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.json({ success: true, data: [] }); // table may not exist
  }
});

// ── GET /api/analytics/daily-study ───────────────────────────────────────────
router.get('/daily-study', protect, async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT DISTINCT DATE(attempted_at) AS study_date
       FROM practice_attempts
       WHERE student_id = :userId
         AND attempted_at >= NOW() - INTERVAL '60 days'
       ORDER BY study_date ASC`,
      { userId: req.user.id }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/cohort-gaps ───────────────────────────────────────────
// MUST stay before /cohort/:subjectId/topics to avoid Express matching 'gaps' as :subjectId
router.get('/cohort-gaps', protect, async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Teacher access required' });
  }
  const { subject_id } = req.query;
  try {
    const rows = await safeQuery(
      `-- topic name comes from the join chain:
       --   practice_attempts → questions → subtopics → topics
       -- Aliased as "topic" to preserve the existing response shape consumed by the
       -- frontend (r.topic in the .map() below remains valid).
       SELECT
         t.id   AS topic_id,
         t.name AS topic,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_accuracy,
         COUNT(DISTINCT pa.student_id)::INTEGER AS student_count
       FROM practice_attempts pa
       JOIN questions  q  ON q.id  = pa.question_id
       JOIN subtopics  st ON st.id = q.subtopic_id
       JOIN topics     t  ON t.id  = st.topic_id
       WHERE true
         ${subject_id ? 'AND t.subject_id = :subject_id' : ''}
       GROUP BY t.id, t.name
       HAVING COUNT(*) >= 3
       ORDER BY avg_accuracy ASC
       LIMIT 15`,
      subject_id ? { subject_id } : {}
    );
    const gaps = rows.map(r => ({
      topic:          r.topic,
      avg_accuracy:   Math.round(r.avg_accuracy),
      student_count:  r.student_count,
      recommendation: r.avg_accuracy < 40
        ? `Critical gap — re-teach ${r.topic} from first principles.`
        : r.avg_accuracy < 60
        ? `Moderate gap in ${r.topic} — targeted revision recommended.`
        : `Minor weakness in ${r.topic} — a quick recap may help.`,
    }));
    return res.json({ success: true, data: { gaps } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/student/:studentId/topics ─────────────────────────────
router.get('/student/:studentId/topics', protect, requireTeacherAnalyticsScope, async (req, res) => {
  const { studentId } = req.params;
  if (req.user.role === 'student' && String(req.user.id) !== String(studentId)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  const { subject_id } = req.query;
  try {
    const rows = await safeQuery(
      `-- topic name + id come from the join chain:
       --   practice_attempts → questions → subtopics → topics → subjects
       -- Aliased as "topic" so the frontend response shape is unchanged.
       SELECT
         t.id   AS topic_id,
         t.name AS topic,
         s.name AS subject_name,
         COUNT(pa.id)::INTEGER AS attempt_count,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS accuracy_pct,
         COALESCE(ROUND(AVG(pa.time_taken_seconds), 1), 0) AS avg_time_seconds
       FROM practice_attempts pa
       JOIN questions  q  ON q.id  = pa.question_id
       JOIN subtopics  st ON st.id = q.subtopic_id
       JOIN topics     t  ON t.id  = st.topic_id
       JOIN subjects   s  ON s.id  = t.subject_id
       WHERE pa.student_id = :studentId
         ${subject_id ? 'AND t.subject_id = :subject_id' : ''}
       GROUP BY t.id, t.name, s.name
       ORDER BY accuracy_pct ASC`,
      { studentId, ...(subject_id ? { subject_id } : {}) }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/student/:studentId/summary ────────────────────────────
router.get('/student/:studentId/summary', protect, requireTeacherAnalyticsScope, async (req, res) => {
  const { studentId } = req.params;
  // Authorization unchanged: students can only see their own summary.
  if (req.user.role === 'student' && String(req.user.id) !== String(studentId)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  try {
    // userRows and attemptRows run in parallel — neither depends on
    // subtopic_progress, so they are not penalised if that table is absent.
    const [userRows, attemptRows] = await Promise.all([
      safeQuery(
        `SELECT COALESCE(xp_points,0) AS xp_points, COALESCE(study_streak_days,0) AS study_streak_days
         FROM users WHERE id = :studentId`,
        { studentId }, [{}]
      ),
      safeQuery(
        `SELECT
           COUNT(*)::INTEGER AS total_attempts,
           COALESCE(ROUND(AVG(CASE WHEN is_correct THEN 100 ELSE 0 END))::INTEGER,0) AS accuracy_pct,
           COALESCE(SUM(time_taken_seconds),0)::BIGINT AS total_time_seconds
         FROM practice_attempts WHERE student_id = :studentId`,
        { studentId }, [{}]
      ),
    ]);

    // subtopic_progress is optional: the table may not exist, or the
    // quiz_completed column may be absent on older schema revisions.
    // safeQuery returns the fallback [{quizzes_completed:0}] in both cases,
    // keeping the endpoint at HTTP 200 regardless of table availability.
    const progressRows = await safeQuery(
      `SELECT COUNT(*) FILTER (WHERE quiz_completed)::INTEGER AS quizzes_completed
       FROM subtopic_progress WHERE student_id = :studentId`,
      { studentId }, [{ quizzes_completed: 0 }]
    );

    const u = userRows[0]   || {};
    const a = attemptRows[0] || {};
    const p = progressRows[0] || {};
    const totalSecs = parseInt(a.total_time_seconds) || 0;
    return res.json({ success: true, data: {
      total_attempts:     a.total_attempts    || 0,
      accuracy_pct:       a.accuracy_pct      || 0,
      study_streak_days:  u.study_streak_days || 0,
      xp_points:          u.xp_points         || 0,
      quizzes_completed:  p.quizzes_completed || 0,
      time_spent_minutes: Math.floor(totalSecs / 60),
      time_spent_seconds: totalSecs % 60,
    }});
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics/cohort/:subjectId/topics ──────────────────────────────
router.get('/cohort/:subjectId/topics', protect, async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  const { subjectId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  try {
    const rows = await safeQuery(
      `-- topic name + id come from the join chain:
       --   practice_attempts → questions → subtopics → topics
       -- topics is filtered by subject via t.subject_id = :subjectId.
       SELECT
         t.id   AS topic_id,
         t.name AS topic,
         COUNT(DISTINCT pa.student_id)::INTEGER AS student_count,
         COUNT(pa.id)::INTEGER AS attempt_count,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_accuracy,
         COALESCE(ROUND(AVG(pa.time_taken_seconds), 1), 0) AS avg_time_seconds
       FROM practice_attempts pa
       JOIN questions  q  ON q.id  = pa.question_id
       JOIN subtopics  st ON st.id = q.subtopic_id
       JOIN topics     t  ON t.id  = st.topic_id
       WHERE t.subject_id = :subjectId
       GROUP BY t.id, t.name
       HAVING COUNT(*) >= 3
       ORDER BY avg_accuracy ASC
       LIMIT :limit`,
      { subjectId, limit }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
