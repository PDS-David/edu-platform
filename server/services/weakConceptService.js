// server/services/weakConceptService.js
// Identifies a student's weakest concepts by querying student_concept_mastery.
//
// Exported:
//   getWeakConcepts(studentId)  → Array<{ id, name, mastery_score }>
//   getRootConcepts(conceptId)  → Array<{ parent_concept_id }>
//
// Consumed by:
//   server/services/remediationService.js

'use strict';

const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');

// ---------------------------------------------------------------------------
// getWeakConcepts
// Returns the 10 concepts with mastery_score < 0.5 for a student,
// ordered from lowest mastery first (worst weakness first).
// ---------------------------------------------------------------------------
async function getWeakConcepts(studentId) {
  if (!studentId) throw new Error('studentId is required');

  const rows = await sequelize.query(
    `SELECT
       c.id,
       c.name,
       c.description,
       c.difficulty_level,
       scm.mastery_score,
       scm.attempts,
       scm.correct,
       scm.last_practiced
     FROM student_concept_mastery scm
     JOIN concepts c ON scm.concept_id = c.id
     WHERE scm.student_id = :studentId
       AND scm.mastery_score < 0.5
     ORDER BY scm.mastery_score ASC
     LIMIT 10`,
    {
      replacements: { studentId },
      type: QueryTypes.SELECT,
    }
  );

  return rows;
}

// ---------------------------------------------------------------------------
// getRootConcepts
// Recursively walks concept_dependencies to find all ancestor (prerequisite)
// concept IDs for a given conceptId.
// Returns an array of { parent_concept_id } objects.
// ---------------------------------------------------------------------------
async function getRootConcepts(conceptId) {
  if (!conceptId) throw new Error('conceptId is required');

  const rows = await sequelize.query(
    `WITH RECURSIVE dependency_chain AS (
       -- Seed: direct parents of the given concept
       SELECT parent_concept_id
       FROM   concept_dependencies
       WHERE  child_concept_id = :conceptId

       UNION ALL

       -- Recurse: walk further up the dependency tree
       SELECT cd.parent_concept_id
       FROM   concept_dependencies cd
       JOIN   dependency_chain dc ON cd.child_concept_id = dc.parent_concept_id
     )
     SELECT parent_concept_id
     FROM   dependency_chain`,
    {
      replacements: { conceptId },
      type: QueryTypes.SELECT,
    }
  );

  return rows; // [{ parent_concept_id: uuid }, ...]
}

module.exports = {
  getWeakConcepts,
  getRootConcepts,
};
