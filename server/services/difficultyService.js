const db = require('../config/db');

async function getStudentDifficultyLevel(studentId, subtopicId) {
  const res = await db.query(
    `SELECT AVG(CASE WHEN is_correct THEN 1 ELSE 0 END) as accuracy
     FROM practice_attempts pa
     JOIN questions q ON pa.question_id = q.id
     WHERE pa.student_id = $1 AND q.subtopic_id = $2`,
    [studentId, subtopicId]
  );

  const accuracy = res.rows[0]?.accuracy || 0;

  if (accuracy > 0.8) return 4;
  if (accuracy > 0.6) return 3;
  if (accuracy > 0.4) return 2;
  return 1;
}

module.exports = { getStudentDifficultyLevel };