'use strict';

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * EXISTING: Topic-level weakness analysis (UNCHANGED CORE)
 */
async function analyzeWeakness(studentId) {
  const rows = await sequelize.query(
    `SELECT
       q.subject_id_uuid,
       q.topic,
       q.subtopic_id,
       COUNT(*)::INTEGER AS total,
       SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)::INTEGER AS correct,
       SUM(CASE WHEN NOT sa.is_correct THEN 1 ELSE 0 END)::INTEGER AS failed
     FROM student_answers sa
     JOIN questions q ON q.id = sa.question_id
     JOIN quiz_attempts qa ON qa.id = sa.attempt_id
     WHERE qa.student_id = :studentId
     GROUP BY q.subject_id_uuid, q.topic, q.subtopic_id`,
    { replacements: { studentId }, type: QueryTypes.SELECT }
  );

  return rows.map(r => {
    const accuracy = r.total === 0 ? 0 : r.correct / r.total;

    let severity = 'low';
    if (accuracy < 0.4) severity = 'critical';
    else if (accuracy < 0.6) severity = 'high';
    else if (accuracy < 0.8) severity = 'medium';

    return {
      subjectId: r.subject_id_uuid,
      topicName: r.topic,
      subtopicId: r.subtopic_id,
      accuracy,
      total: r.total,
      failed: r.failed,
      severity
    };
  });
}

/**
 * EXISTING: Persist learning gaps (UNCHANGED)
 */
async function updateLearningGaps(studentId, weaknesses) {
  if (!weaknesses?.length) return;

  for (const w of weaknesses) {
    await sequelize.query(
      `INSERT INTO learning_gaps (
        student_id, subject_id, topic_name, topic_id,
        gap_severity, accuracy_in_topic,
        questions_attempted, questions_failed, last_updated
      )
      VALUES (
        :studentId, :subjectId, :topicName, :subtopicId,
        :severity, :accuracy, :total, :failed, NOW()
      )
      ON CONFLICT (student_id, topic_name)
      DO UPDATE SET
        gap_severity = EXCLUDED.gap_severity,
        accuracy_in_topic = EXCLUDED.accuracy_in_topic,
        questions_attempted = EXCLUDED.questions_attempted,
        questions_failed = EXCLUDED.questions_failed,
        last_updated = NOW()`,
      {
        replacements: {
          studentId,
          subjectId: w.subjectId,
          topicName: w.topicName,
          subtopicId: w.subtopicId,
          severity: w.severity,
          accuracy: w.accuracy,
          total: w.total,
          failed: w.failed
        },
        type: QueryTypes.INSERT
      }
    );
  }
}

/**
 *  NEW: Concept-level weakness (for question engine)
 */
async function getWeakConcepts(student_id, subtopic_id, limit = 5) {
  const result = await sequelize.query(
    `SELECT 
        c.id,
        c.name,
        COALESCE(scm.mastery_score, 0) as mastery_score
     FROM concepts c
     LEFT JOIN student_concept_mastery scm
       ON scm.concept_id = c.id AND scm.student_id = :student_id
     WHERE c.subtopic_id = :subtopic_id
     ORDER BY mastery_score ASC
     LIMIT :limit`,
    {
      replacements: { student_id, subtopic_id, limit },
      type: QueryTypes.SELECT
    }
  );

  return result;
}

/**
 *  NEW: Split weak vs strong
 */
function splitConceptsByWeakness(concepts, weakConcepts) {
  const weakIds = new Set(weakConcepts.map(c => c.id));

  return {
    weak: concepts.filter(c => weakIds.has(c.id)),
    strong: concepts.filter(c => !weakIds.has(c.id))
  };
}

module.exports = {
  analyzeWeakness,
  updateLearningGaps,
  getWeakConcepts,
  splitConceptsByWeakness
};