-- ═══════════════════════════════════════════════════════════════
-- Add subjects for IELTS, TOEFL, and SAT exam boards
-- Run this in psql while connected to edu_platform
-- ═══════════════════════════════════════════════════════════════

-- ── IELTS Subjects (4 sections) ──────────────────────────────
INSERT INTO subjects (id, name, code, subject_code, description, icon_emoji, color, category, level, question_count, video_count, notes_count, past_papers_count, is_active, exam_board_id)
VALUES
  (gen_random_uuid(), 'Listening', 'IELTS-LISTEN', 'IELTS-01',
   'Master IELTS Listening with 4 sections: social conversations, monologues, academic discussions, and lectures. 40 questions in 30 minutes.',
   '', '#0EA5E9', 'Language Skills', 'International',
   500, 80, 150, 40, true,
   (SELECT id FROM exam_boards WHERE code = 'IELTS')),

  (gen_random_uuid(), 'Reading', 'IELTS-READ', 'IELTS-02',
   'Develop IELTS Reading skills across Academic and General Training. Three long passages with 40 questions covering comprehension, inference, and vocabulary.',
   '', '#F59E0B', 'Language Skills', 'International',
   500, 80, 150, 40, true,
   (SELECT id FROM exam_boards WHERE code = 'IELTS')),

  (gen_random_uuid(), 'Writing', 'IELTS-WRITE', 'IELTS-03',
   'Excel in IELTS Writing with Task 1 (data interpretation / letter writing) and Task 2 (academic essay). Covers structure, coherence, and lexical resource.',
   '', '#EF4444', 'Language Skills', 'International',
   300, 100, 200, 40, true,
   (SELECT id FROM exam_boards WHERE code = 'IELTS')),

  (gen_random_uuid(), 'Speaking', 'IELTS-SPEAK', 'IELTS-04',
   'Build confidence for the IELTS Speaking test: Part 1 introduction, Part 2 long turn (2-minute talk), and Part 3 abstract discussion with examiner.',
   '', '#10B981', 'Language Skills', 'International',
   300, 120, 100, 30, true,
   (SELECT id FROM exam_boards WHERE code = 'IELTS'));


-- ── TOEFL Subjects (4 sections) ──────────────────────────────
INSERT INTO subjects (id, name, code, subject_code, description, icon_emoji, color, category, level, question_count, video_count, notes_count, past_papers_count, is_active, exam_board_id)
VALUES
  (gen_random_uuid(), 'Reading', 'TOEFL-READ', 'TOEFL-01',
   'Master TOEFL iBT Reading with 2 academic passages and 20 questions. Focus on comprehension, vocabulary in context, and rhetorical purpose.',
   '', '#F59E0B', 'Language Skills', 'International',
   500, 80, 150, 35, true,
   (SELECT id FROM exam_boards WHERE code = 'TOEFL')),

  (gen_random_uuid(), 'Listening', 'TOEFL-LISTEN', 'TOEFL-02',
   'Develop TOEFL Listening skills with lectures and conversations. 3-4 lectures and 2-3 conversations testing comprehension, attitude, and organization.',
   '', '#0EA5E9', 'Language Skills', 'International',
   500, 80, 150, 35, true,
   (SELECT id FROM exam_boards WHERE code = 'TOEFL')),

  (gen_random_uuid(), 'Speaking', 'TOEFL-SPEAK', 'TOEFL-03',
   'Excel in TOEFL Speaking with 4 tasks: independent opinion task and 3 integrated tasks combining reading, listening, and speaking responses.',
   '', '#10B981', 'Language Skills', 'International',
   300, 100, 120, 30, true,
   (SELECT id FROM exam_boards WHERE code = 'TOEFL')),

  (gen_random_uuid(), 'Writing', 'TOEFL-WRITE', 'TOEFL-04',
   'Succeed in TOEFL Writing with the Integrated task (read-listen-write) and the Academic Discussion task. Scored 0-5 on language and ideas.',
   '', '#EF4444', 'Language Skills', 'International',
   300, 100, 150, 30, true,
   (SELECT id FROM exam_boards WHERE code = 'TOEFL'));


-- ── SAT Subjects (2 sections) ────────────────────────────────
INSERT INTO subjects (id, name, code, subject_code, description, icon_emoji, color, category, level, question_count, video_count, notes_count, past_papers_count, is_active, exam_board_id)
VALUES
  (gen_random_uuid(), 'Reading & Writing', 'SAT-RW', 'SAT-01',
   'Master SAT Reading & Writing: Craft & Structure, Information & Ideas, Standard English Conventions, and Expression of Ideas. 64 minutes, 54 questions.',
   '', '#3B82F6', 'Standardized Test', 'Pre-University',
   600, 100, 200, 45, true,
   (SELECT id FROM exam_boards WHERE code = 'SAT')),

  (gen_random_uuid(), 'Mathematics (SAT)', 'SAT-MATH', 'SAT-02',
   'Conquer SAT Math: Algebra, Advanced Math, Problem Solving & Data Analysis, and Geometry/Trigonometry. 70 minutes, 44 questions. Calculator allowed throughout.',
   '', '#8B5CF6', 'Standardized Test', 'Pre-University',
   600, 100, 200, 45, true,
   (SELECT id FROM exam_boards WHERE code = 'SAT'));


-- ── Verify ───────────────────────────────────────────────────
SELECT eb.code, COUNT(s.id) as subject_count
FROM exam_boards eb
LEFT JOIN subjects s ON eb.id = s.exam_board_id
GROUP BY eb.code
ORDER BY eb.display_order;
