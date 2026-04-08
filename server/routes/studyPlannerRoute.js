// server/routes/studyPlannerRoute.js
// ─────────────────────────────────────────────────────────────────────────────
// Study Planner — generates a personalised day-by-day study plan for a student
// and persists it to the study_plans table.
//
// Endpoint:
//   GET /api/study-planner/:user_id
//
// Query params (all optional):
//   start_date      — ISO date string, defaults to today (YYYY-MM-DD)
//   topics_per_day  — integer 1-5, how many topics to tackle per day (default 2)
//   skip_weekends   — 'true' | 'false', defaults to 'false'
//
// Response shape (unchanged, with saved_plan_id added):
// {
//   success:      true,
//   saved_plan_id: "<uuid>",
//   user:         { id, name },
//   generated_at: <ISO>,
//   plan:         [ ... ],
//   summary:      { ... }
// }
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const db             = require('../config/database');
const { protect }    = require('../middleware/auth');

const DUPLICATE_WINDOW_MINUTES = 5;

// ── helpers ───────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function addDays(date, n, skipWeekends = false) {
  const d = new Date(date);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (!skipWeekends || (d.getDay() !== 0 && d.getDay() !== 6)) {
      added++;
    }
  }
  return d;
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function buildTasks(topicName, subtopics = []) {
  const tasks = [
    { type: 'read',     label: `Read and understand notes on "${topicName}"` },
    { type: 'practice', label: `Solve practice questions on "${topicName}"` },
  ];

  if (subtopics.length > 0) {
    tasks.push({
      type:  'subtopics',
      label: `Cover subtopics: ${subtopics.slice(0, 3).join(', ')}${subtopics.length > 3 ? ` + ${subtopics.length - 3} more` : ''}`,
    });
  }

  tasks.push(
    { type: 'quiz',   label: `Take a quiz on "${topicName}" to test understanding` },
    { type: 'review', label: `Review mistakes and revisit weak areas in "${topicName}"` },
  );

  return tasks;
}

// ── persistence helpers ───────────────────────────────────────────────────────

/**
 * Returns the id of an existing study_plans row if the same user generated
 * a plan within the last DUPLICATE_WINDOW_MINUTES minutes, otherwise null.
 */
async function findRecentPlan(userId) {
  const rows = await db.query(
    `SELECT id
     FROM study_plans
     WHERE user_id      = :userId
       AND generated_at >= NOW() - INTERVAL '${DUPLICATE_WINDOW_MINUTES} minutes'
     ORDER BY generated_at DESC
     LIMIT 1`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  );
  return rows.length ? rows[0].id : null;
}

/**
 * Inserts a new study_plans row and returns its generated UUID.
 */
async function persistPlan({ userId, startDate, endDate, topicsPerDay, skipWeekends, plan, summary }) {
  const rows = await db.query(
    `INSERT INTO study_plans
       (user_id, generated_at, start_date, end_date, topics_per_day, skip_weekends, plan_json, summary_json)
     VALUES
       (:userId, NOW(), :startDate, :endDate, :topicsPerDay, :skipWeekends, :planJson::jsonb, :summaryJson::jsonb)
     RETURNING id`,
    {
      replacements: {
        userId,
        startDate,
        endDate,
        topicsPerDay,
        skipWeekends,
        planJson:     JSON.stringify(plan),
        summaryJson:  JSON.stringify(summary),
      },
      type: QueryTypes.SELECT,
    },
  );
  return rows[0].id;
}

// ── main handler ──────────────────────────────────────────────────────────────

router.get('/:user_id', protect, async (req, res) => {
  const { user_id } = req.params;

  if (req.user.id !== user_id && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error:   'Forbidden — you can only view your own study plan',
    });
  }

  const topicsPerDay = Math.min(5, Math.max(1, parseInt(req.query.topics_per_day) || 2));
  const skipWeekends = req.query.skip_weekends === 'true';
  const startDateRaw = req.query.start_date;

  let startDate;
  try {
    startDate = startDateRaw ? new Date(startDateRaw) : new Date();
    if (isNaN(startDate.getTime())) throw new Error('invalid');
    startDate.setHours(0, 0, 0, 0);
  } catch {
    return res.status(400).json({
      success: false,
      error:   'Invalid start_date — use ISO format YYYY-MM-DD',
    });
  }

  try {
    // ── 1. Verify user exists ─────────────────────────────────────────────────
    const [user] = await db.query(
      `SELECT id,
              first_name || ' ' || last_name AS name,
              preferred_study_days,
              preferred_study_time
       FROM users
       WHERE id = :userId AND is_active = true
       LIMIT 1`,
      { replacements: { userId: user_id }, type: QueryTypes.SELECT },
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // ── 2. Duplicate guard ────────────────────────────────────────────────────
    const existingPlanId = await findRecentPlan(user_id);
    if (existingPlanId) {
      console.log(`[StudyPlanner] Duplicate request for user ${user_id} — returning existing plan ${existingPlanId}`);

      const [existing] = await db.query(
        `SELECT plan_json, summary_json, generated_at
         FROM study_plans
         WHERE id = :planId`,
        { replacements: { planId: existingPlanId }, type: QueryTypes.SELECT },
      );

      return res.status(200).json({
        success:       true,
        saved_plan_id: existingPlanId,
        from_cache:    true,
        user:          { id: user.id, name: user.name },
        generated_at:  existing.generated_at,
        plan:          existing.plan_json,
        summary:       existing.summary_json,
      });
    }

    // ── 3. Fetch active enrollments ───────────────────────────────────────────
    const enrollments = await db.query(
      `SELECT
         e.id               AS enrollment_id,
         e.course_id,
         e.progress_percentage,
         e.status           AS enrollment_status,
         c.title            AS course_title,
         c.start_date       AS course_start,
         c.end_date         AS course_end,
         c.difficulty_level,
         s.name             AS subject_name,
         s.code             AS subject_code
       FROM enrollments e
       JOIN courses  c ON c.id = e.course_id
       JOIN subjects s ON s.id = c.subject_id
       WHERE e.student_id  = :userId
         AND e.status      = 'active'
         AND c.is_published = true
       ORDER BY e.enrollment_date ASC`,
      { replacements: { userId: user_id }, type: QueryTypes.SELECT },
    );

    if (enrollments.length === 0) {
      const emptyPlan    = [];
      const emptySummary = {
        total_days:   0,
        total_topics: 0,
        courses:      [],
        enrollments:  0,
        message:      'No active enrollments found. Enrol in a course to generate a study plan.',
      };

      const savedId = await persistPlan({
        userId:       user_id,
        startDate:    fmtDate(startDate),
        endDate:      fmtDate(startDate),
        topicsPerDay,
        skipWeekends,
        plan:         emptyPlan,
        summary:      emptySummary,
      });

      return res.status(200).json({
        success:       true,
        saved_plan_id: savedId,
        user:          { id: user.id, name: user.name },
        generated_at:  new Date().toISOString(),
        plan:          emptyPlan,
        summary:       emptySummary,
      });
    }

    // ── 4. Fetch topics for all enrolled courses ───────────────────────────────
    const courseIds = enrollments.map(e => e.course_id);

    const topics = await db.query(
      `SELECT
         t.id,
         t.course_id,
         COALESCE(t.name, t.title, 'Untitled Topic') AS name,
         t.description,
         COALESCE(t.order_index, 0)                  AS order_index,
         t.estimated_hours
       FROM topics t
       WHERE t.course_id IN (:courseIds)
       ORDER BY t.course_id, COALESCE(t.order_index, 0) ASC`,
      { replacements: { courseIds }, type: QueryTypes.SELECT },
    );

    // ── 5. Fetch subtopics ────────────────────────────────────────────────────
    let subtopicMap = {};
    if (topics.length > 0) {
      const topicIds = topics.map(t => t.id);
      const subtopics = await db.query(
        `SELECT
           st.id,
           st.topic_id,
           st.name,
           COALESCE(st.order_index, 0) AS order_index
         FROM subtopics st
         WHERE st.topic_id IN (:topicIds)
         ORDER BY COALESCE(st.order_index, 0) ASC, st.name ASC`,
        { replacements: { topicIds }, type: QueryTypes.SELECT },
      );
      subtopics.forEach(st => {
        if (!subtopicMap[st.topic_id]) subtopicMap[st.topic_id] = [];
        subtopicMap[st.topic_id].push(st.name);
      });
    }

    // ── 6. Enrich topics with course and subtopic data ────────────────────────
    const courseMap = {};
    enrollments.forEach(e => { courseMap[e.course_id] = e; });

    const enrichedTopics = topics.map(t => ({
      ...t,
      subtopics:    subtopicMap[t.id] || [],
      course_title: courseMap[t.course_id]?.course_title ?? 'Unknown Course',
      subject_name: courseMap[t.course_id]?.subject_name ?? 'Unknown Subject',
    }));

    // ── 7. Round-robin interleave topics across courses ───────────────────────
    const byCourse = {};
    enrichedTopics.forEach(t => {
      if (!byCourse[t.course_id]) byCourse[t.course_id] = [];
      byCourse[t.course_id].push(t);
    });

    const queues  = Object.values(byCourse);
    const ordered = [];
    let qi = 0;
    while (ordered.length < enrichedTopics.length) {
      const q = queues[qi % queues.length];
      if (q.length > 0) ordered.push(q.shift());
      qi++;
      if (queues.every(q => q.length === 0)) break;
    }

    // ── 8. Lay out day-by-day plan ────────────────────────────────────────────
    const plan = [];
    let dayNumber   = 1;
    let currentDate = new Date(startDate);

    if (skipWeekends) {
      while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    for (let i = 0; i < ordered.length; i += topicsPerDay) {
      const dayTopics = ordered.slice(i, i + topicsPerDay);

      dayTopics.forEach(topic => {
        plan.push({
          day:     dayNumber,
          date:    fmtDate(currentDate),
          weekday: WEEKDAYS[currentDate.getDay()],
          course:  topic.course_title,
          subject: topic.subject_name,
          topic: {
            id:              topic.id,
            name:            topic.name,
            description:     topic.description || null,
            estimated_hours: topic.estimated_hours
              ? parseFloat(topic.estimated_hours)
              : null,
            subtopics: topic.subtopics,
          },
          tasks: buildTasks(topic.name, topic.subtopics),
        });
      });

      dayNumber++;
      currentDate = addDays(currentDate, 1, skipWeekends);
    }

    // ── 9. Build summary ──────────────────────────────────────────────────────
    const uniqueDays  = [...new Set(plan.map(p => p.day))];
    const courseNames = enrollments.map(e => e.course_title);
    const endDate     = plan.length ? plan[plan.length - 1].date : fmtDate(startDate);

    const summary = {
      total_days:     uniqueDays.length,
      total_topics:   enrichedTopics.length,
      topics_per_day: topicsPerDay,
      start_date:     fmtDate(startDate),
      end_date:       endDate,
      skip_weekends:  skipWeekends,
      courses:        courseNames,
      enrollments:    enrollments.length,
    };

    // ── 10. Persist to study_plans ────────────────────────────────────────────
    const savedPlanId = await persistPlan({
      userId:       user_id,
      startDate:    fmtDate(startDate),
      endDate,
      topicsPerDay,
      skipWeekends,
      plan,
      summary,
    });

    return res.status(200).json({
      success:       true,
      saved_plan_id: savedPlanId,
      user:          { id: user.id, name: user.name },
      generated_at:  new Date().toISOString(),
      plan,
      summary,
    });

  } catch (err) {
    console.error('[GET /api/study-planner/:user_id] Error:', err.message);
    return res.status(500).json({
      success: false,
      error:   'Failed to generate study plan',
      ...(process.env.NODE_ENV === 'development' && { detail: err.message }),
    });
  }
});

module.exports = router;
