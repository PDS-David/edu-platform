-- migration_039_question_bank_classification.sql
-- Existing AI-generated questions without a subtopic are withdrawn from the
-- student-eligible pool and returned to the human Question Bank workflow.
-- They remain in the database; no historical question/test rows are deleted.

UPDATE questions
   SET status = 'pending',
       is_active = false,
       updated_at = NOW()
 WHERE is_ai_generated = true
   AND subtopic_id IS NULL;
