-- ============================================================
-- EAC LEARNING PLATFORM — SEED DATA
-- Tables: questions, teacher_subjects, student_exam_types,
--         student_analytics
-- Generated: 2025
-- ============================================================

BEGIN;

-- ============================================================
-- REFERENCE IDs (for clarity)
-- ============================================================
-- USERS
-- Admin:    fbbaaebd-f518-4394-9046-78c9b3317c1f
-- Student1: cd818b5c-24c2-46a4-ae0c-5635d7f671b0  (John Doe)
-- Student2: 10429bfe-bb6b-4b01-99a1-f921bb956687  (Temitope Oludotun)
-- Teacher1: a0ee242a-84dd-4ccf-819c-8e0eb8f59605  (David Oludotun)
-- Teacher2: 2fc6d08e-6445-4790-9f83-2560f85f576c  (Mary Doe)

-- EXAM BOARDS (from exam_boards table — UUIDs fetched via subjects)
-- WAEC, NECO, JAMB, OLEVEL subjects listed below

-- ============================================================
-- 1. QUESTIONS
-- 5 MCQ questions per subject per exam board
-- Total: 32 subjects × 5 = 160 questions
-- ============================================================

-- ── JAMB MATHEMATICS ────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('If 2x + 3 = 11, what is the value of x?', 'easy', 'Algebra', 2023),
  ('What is the value of log₁₀(1000)?', 'easy', 'Logarithms', 2022),
  ('A circle has radius 7cm. What is its area? (π = 22/7)', 'medium', 'Geometry', 2023),
  ('Solve for x: x² - 5x + 6 = 0', 'medium', 'Quadratic Equations', 2022),
  ('If sin θ = 3/5, find cos θ', 'hard', 'Trigonometry', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'MATH-101';

-- ── JAMB PHYSICS ────────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is the SI unit of force?', 'easy', 'Mechanics', 2023),
  ('A body moves with velocity 20 m/s for 5 seconds. What distance does it cover?', 'easy', 'Motion', 2022),
  ('What type of wave is sound?', 'easy', 'Waves', 2023),
  ('Calculate the kinetic energy of a 2kg object moving at 10 m/s', 'medium', 'Energy', 2022),
  ('What is the refractive index of a medium if light travels at 2×10⁸ m/s in it?', 'hard', 'Optics', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'PHY-101';

-- ── JAMB CHEMISTRY ──────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is the atomic number of Carbon?', 'easy', 'Atomic Structure', 2023),
  ('Which gas is produced when zinc reacts with dilute HCl?', 'easy', 'Chemical Reactions', 2022),
  ('What is the pH of a neutral solution at 25°C?', 'easy', 'Acids and Bases', 2023),
  ('Balance this equation: Fe + O₂ → Fe₂O₃', 'medium', 'Chemical Equations', 2022),
  ('Calculate the molar mass of H₂SO₄', 'medium', 'Mole Concept', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'CHEM-101';

-- ── JAMB BIOLOGY ────────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is the powerhouse of the cell?', 'easy', 'Cell Biology', 2023),
  ('Which blood group is the universal donor?', 'easy', 'Genetics', 2022),
  ('What is the process by which plants make food?', 'easy', 'Photosynthesis', 2023),
  ('How many chambers does the human heart have?', 'easy', 'Human Biology', 2022),
  ('What is the role of ribosomes in a cell?', 'medium', 'Cell Biology', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'BIO-101';

-- ── JAMB ENGLISH LANGUAGE ───────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('Choose the word closest in meaning to "benevolent"', 'easy', 'Vocabulary', 2023),
  ('Identify the figure of speech: "The wind whispered through the trees"', 'medium', 'Figures of Speech', 2022),
  ('Which of these sentences is grammatically correct?', 'easy', 'Grammar', 2023),
  ('What is the plural of "phenomenon"?', 'medium', 'Grammar', 2022),
  ('Choose the word that best completes: "She was _____ by the complexity of the problem"', 'hard', 'Vocabulary', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'ENG-101';

-- ── JAMB ECONOMICS ──────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What does GDP stand for?', 'easy', 'Macroeconomics', 2023),
  ('Which of the following is an example of a public good?', 'medium', 'Microeconomics', 2022),
  ('When supply increases and demand remains constant, price will?', 'easy', 'Supply and Demand', 2023),
  ('What is opportunity cost?', 'easy', 'Basic Concepts', 2022),
  ('Explain the concept of price elasticity of demand', 'hard', 'Microeconomics', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'ECON-101';

-- ── JAMB COMPUTER SCIENCE ───────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What does CPU stand for?', 'easy', 'Computer Hardware', 2023),
  ('Which of these is NOT a programming language?', 'easy', 'Programming', 2022),
  ('What is the binary equivalent of decimal 10?', 'medium', 'Number Systems', 2023),
  ('What does HTML stand for?', 'easy', 'Web Technology', 2022),
  ('What is the time complexity of binary search?', 'hard', 'Algorithms', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'CS-101';

-- ── JAMB BUSINESS STUDIES ───────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What does SWOT stand for in business analysis?', 'easy', 'Business Strategy', 2023),
  ('What type of business is owned by shareholders?', 'easy', 'Business Structures', 2022),
  ('What is the difference between a sole trader and a partnership?', 'medium', 'Business Structures', 2023),
  ('What is the purpose of a balance sheet?', 'medium', 'Accounting', 2022),
  ('Explain the concept of economies of scale', 'hard', 'Production', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'BUS-101';

-- ── WAEC MATHEMATICS ────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('Simplify: 3(2x - 4) + 2(x + 5)', 'easy', 'Algebra', 2023),
  ('Find the gradient of the line joining (2,3) and (4,7)', 'medium', 'Coordinate Geometry', 2022),
  ('The sum of angles in a triangle is?', 'easy', 'Geometry', 2023),
  ('Evaluate: ⁵C₂', 'medium', 'Permutation and Combination', 2022),
  ('Differentiate y = 3x² + 2x - 5 with respect to x', 'hard', 'Calculus', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'MATH-101-WAEC';

-- ── WAEC PHYSICS ────────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is the unit of electrical resistance?', 'easy', 'Electricity', 2023),
  ('State Newton''s first law of motion', 'easy', 'Mechanics', 2022),
  ('What is the frequency of a wave with period 0.02s?', 'medium', 'Waves', 2023),
  ('A transformer has 200 primary turns and 1000 secondary turns. If primary voltage is 50V, find secondary voltage', 'hard', 'Electromagnetism', 2022),
  ('Calculate the pressure at the bottom of a 10m deep water column (density = 1000 kg/m³)', 'hard', 'Pressure', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'PHY-101-WAEC';

-- ── WAEC CHEMISTRY ──────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What type of bond exists in NaCl?', 'easy', 'Chemical Bonding', 2023),
  ('What is Avogadro''s number?', 'easy', 'Mole Concept', 2022),
  ('Which of these is an oxidising agent: H₂, O₂, CO, N₂?', 'medium', 'Redox Reactions', 2023),
  ('Calculate the concentration of a solution containing 4g of NaOH in 500cm³ of water', 'hard', 'Concentration', 2022),
  ('Describe the process of electrolysis of brine', 'hard', 'Electrolysis', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'CHEM-101-WAEC';

-- ── WAEC BIOLOGY ────────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is osmosis?', 'easy', 'Cell Biology', 2023),
  ('Name the enzyme that breaks down starch in saliva', 'easy', 'Digestion', 2022),
  ('What is the function of the nephron?', 'medium', 'Excretion', 2023),
  ('Describe the process of meiosis', 'hard', 'Cell Division', 2022),
  ('What is the role of auxins in plant growth?', 'hard', 'Plant Biology', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'BIO-101-WAEC';

-- ── WAEC ENGLISH LANGUAGE ───────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is a simile?', 'easy', 'Figures of Speech', 2023),
  ('Choose the correct preposition: She is good ___ mathematics', 'easy', 'Grammar', 2022),
  ('What is the passive voice of: "The cat chased the mouse"?', 'medium', 'Grammar', 2023),
  ('Identify the clause type: "Although it was raining, we went out"', 'medium', 'Sentence Structure', 2022),
  ('What is the difference between a phrase and a clause?', 'hard', 'Grammar', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'ENG-101-WAEC';

-- ── WAEC ECONOMICS ──────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is inflation?', 'easy', 'Macroeconomics', 2023),
  ('What is the law of diminishing returns?', 'medium', 'Production Theory', 2022),
  ('Differentiate between microeconomics and macroeconomics', 'medium', 'Basic Concepts', 2023),
  ('What are the functions of money?', 'easy', 'Money and Banking', 2022),
  ('Explain how the multiplier effect works in an economy', 'hard', 'Macroeconomics', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'ECON-101-WAEC';

-- ── WAEC COMPUTER SCIENCE ───────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is RAM used for?', 'easy', 'Computer Hardware', 2023),
  ('What is the difference between a compiler and an interpreter?', 'medium', 'Programming', 2022),
  ('Convert 255 from decimal to binary', 'medium', 'Number Systems', 2023),
  ('What is a primary key in a database?', 'easy', 'Databases', 2022),
  ('Describe how a bubble sort algorithm works', 'hard', 'Algorithms', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'CS-101-WAEC';

-- ── WAEC BUSINESS STUDIES ───────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is marketing?', 'easy', 'Marketing', 2023),
  ('What are the 4 Ps of marketing?', 'easy', 'Marketing', 2022),
  ('What is the difference between profit and revenue?', 'medium', 'Accounting', 2023),
  ('What is a limited liability company?', 'medium', 'Business Structures', 2022),
  ('Explain the role of entrepreneurship in economic development', 'hard', 'Entrepreneurship', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'BUS-101-WAEC';

-- ── NECO MATHEMATICS ────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is the LCM of 12 and 18?', 'easy', 'Number Theory', 2023),
  ('Find the area of a rectangle with length 8cm and width 5cm', 'easy', 'Mensuration', 2022),
  ('Solve: 3x - 7 = 2x + 4', 'easy', 'Algebra', 2023),
  ('What is the median of: 3, 5, 7, 9, 11?', 'medium', 'Statistics', 2022),
  ('Find the equation of a line with slope 2 passing through (1, 3)', 'hard', 'Coordinate Geometry', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'MATH-101-NECO';

-- ── NECO PHYSICS ────────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is the speed of light in vacuum?', 'easy', 'Optics', 2023),
  ('What is the formula for work done?', 'easy', 'Mechanics', 2022),
  ('What happens to resistance when temperature increases in a conductor?', 'medium', 'Electricity', 2023),
  ('A stone is dropped from a height of 80m. How long does it take to reach the ground? (g=10m/s²)', 'hard', 'Motion', 2022),
  ('Explain the photoelectric effect', 'hard', 'Modern Physics', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'PHY-101-NECO';

-- ── NECO CHEMISTRY ──────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is the chemical formula of water?', 'easy', 'Basic Chemistry', 2023),
  ('Which element has symbol Fe?', 'easy', 'Periodic Table', 2022),
  ('What type of reaction is: acid + base → salt + water?', 'medium', 'Chemical Reactions', 2023),
  ('What is the difference between an atom and a molecule?', 'medium', 'Atomic Structure', 2022),
  ('Explain Le Chatelier''s principle with an example', 'hard', 'Equilibrium', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'CHEM-101-NECO';

-- ── NECO BIOLOGY ────────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is the basic unit of life?', 'easy', 'Cell Biology', 2023),
  ('Which organ produces insulin?', 'easy', 'Human Biology', 2022),
  ('What is the difference between aerobic and anaerobic respiration?', 'medium', 'Respiration', 2023),
  ('Explain the process of DNA replication', 'hard', 'Genetics', 2022),
  ('What is ecological succession?', 'hard', 'Ecology', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'BIO-101-NECO';

-- ── NECO ENGLISH LANGUAGE ───────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is a noun?', 'easy', 'Parts of Speech', 2023),
  ('Identify the subject in: "The tall man ran quickly"', 'easy', 'Sentence Structure', 2022),
  ('What is the difference between "affect" and "effect"?', 'medium', 'Vocabulary', 2023),
  ('What is a metaphor? Give an example', 'medium', 'Figures of Speech', 2022),
  ('Write a summary of a given passage in your own words', 'hard', 'Comprehension', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'ENG-101-NECO';

-- ── NECO ECONOMICS ──────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is a budget deficit?', 'easy', 'Public Finance', 2023),
  ('What are the factors of production?', 'easy', 'Basic Concepts', 2022),
  ('What is the difference between fixed and variable costs?', 'medium', 'Production Theory', 2023),
  ('Explain demand-pull inflation', 'medium', 'Macroeconomics', 2022),
  ('Analyse the impact of foreign direct investment on a developing economy', 'hard', 'International Trade', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'ECON-101-NECO';

-- ── NECO COMPUTER SCIENCE ───────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is an operating system?', 'easy', 'Operating Systems', 2023),
  ('What does LAN stand for?', 'easy', 'Networks', 2022),
  ('What is the difference between hardware and software?', 'easy', 'Computer Basics', 2023),
  ('What is a recursive function?', 'hard', 'Programming', 2022),
  ('Explain how the internet works', 'medium', 'Networks', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'CS-101-NECO';

-- ── NECO BUSINESS STUDIES ───────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is a business plan?', 'easy', 'Entrepreneurship', 2023),
  ('What is the difference between gross profit and net profit?', 'medium', 'Accounting', 2022),
  ('What are the functions of management?', 'medium', 'Management', 2023),
  ('What is working capital?', 'medium', 'Finance', 2022),
  ('Explain the importance of record keeping in business', 'hard', 'Accounting', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'BUS-101-NECO';

-- ── O-LEVEL MATHEMATICS ─────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is 15% of 200?', 'easy', 'Percentages', 2023),
  ('Expand: (x + 3)(x - 2)', 'medium', 'Algebra', 2022),
  ('Find the volume of a cylinder with radius 4cm and height 10cm', 'medium', 'Mensuration', 2023),
  ('If f(x) = 2x² - 3, find f(3)', 'easy', 'Functions', 2022),
  ('Prove that the angles in a quadrilateral sum to 360°', 'hard', 'Geometry', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'MATH-101-OLEVEL';

-- ── O-LEVEL PHYSICS ─────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is the formula for Ohm''s law?', 'easy', 'Electricity', 2023),
  ('What is the difference between mass and weight?', 'easy', 'Mechanics', 2022),
  ('What is total internal reflection?', 'medium', 'Optics', 2023),
  ('Calculate the equivalent resistance of two 6Ω resistors in parallel', 'medium', 'Electricity', 2022),
  ('What is nuclear fission? Give an example of its application', 'hard', 'Nuclear Physics', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'PHY-101-OLEVEL';

-- ── O-LEVEL CHEMISTRY ───────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is a covalent bond?', 'easy', 'Chemical Bonding', 2023),
  ('What is the difference between an element and a compound?', 'easy', 'Basic Chemistry', 2022),
  ('What gas is produced when copper reacts with concentrated H₂SO₄?', 'medium', 'Chemical Reactions', 2023),
  ('What is chromatography used for?', 'medium', 'Separation Techniques', 2022),
  ('Describe the industrial production of ammonia (Haber Process)', 'hard', 'Industrial Chemistry', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'CHEM-101-OLEVEL';

-- ── O-LEVEL BIOLOGY ─────────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is the function of chlorophyll?', 'easy', 'Photosynthesis', 2023),
  ('What is the difference between veins and arteries?', 'easy', 'Human Biology', 2022),
  ('Explain the nitrogen cycle', 'medium', 'Ecology', 2023),
  ('What is the difference between mitosis and meiosis?', 'hard', 'Cell Division', 2022),
  ('Describe the structure and function of the kidney', 'hard', 'Excretion', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'BIO-101-OLEVEL';

-- ── O-LEVEL ENGLISH LANGUAGE ────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is an adjective?', 'easy', 'Parts of Speech', 2023),
  ('Change to indirect speech: He said "I am tired"', 'medium', 'Grammar', 2022),
  ('What is the tone of a piece of writing?', 'medium', 'Literary Analysis', 2023),
  ('What is the difference between denotation and connotation?', 'hard', 'Vocabulary', 2022),
  ('Analyse the use of imagery in a given poem', 'hard', 'Literary Analysis', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'ENG-101-OLEVEL';

-- ── O-LEVEL ECONOMICS ───────────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is a market economy?', 'easy', 'Economic Systems', 2023),
  ('What is the difference between needs and wants?', 'easy', 'Basic Concepts', 2022),
  ('Explain the concept of comparative advantage', 'hard', 'International Trade', 2023),
  ('What causes unemployment?', 'medium', 'Macroeconomics', 2022),
  ('Describe the role of the central bank in an economy', 'hard', 'Money and Banking', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'ECON-101-OLEVEL';

-- ── O-LEVEL COMPUTER SCIENCE ────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is a flowchart?', 'easy', 'Algorithms', 2023),
  ('What is the difference between ROM and RAM?', 'easy', 'Computer Hardware', 2022),
  ('What is pseudocode?', 'medium', 'Programming', 2023),
  ('What is a Boolean expression?', 'medium', 'Logic', 2022),
  ('Design an algorithm to sort a list of numbers', 'hard', 'Algorithms', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'CS-101-OLEVEL';

-- ── O-LEVEL BUSINESS STUDIES ────────────────────────────────
INSERT INTO questions (id, subject_id_uuid, exam_board_id, question_text, question_type, difficulty, topic, year, source, status, submitted_by, created_at)
SELECT gen_random_uuid(), s.id, s.exam_board_id, q.question_text, 'multiple_choice', q.difficulty, q.topic, q.year, 'admin_import', 'approved', 'fbbaaebd-f518-4394-9046-78c9b3317c1f', NOW()
FROM subjects s,
(VALUES
  ('What is the difference between a product and a service?', 'easy', 'Business Basics', 2023),
  ('What is cash flow?', 'medium', 'Finance', 2022),
  ('What is the role of a manager in a business?', 'medium', 'Management', 2023),
  ('What is a break-even point?', 'medium', 'Accounting', 2022),
  ('Analyse the impact of technology on modern business operations', 'hard', 'Business Strategy', 2021)
) AS q(question_text, difficulty, topic, year)
WHERE s.code = 'BUS-101-OLEVEL';

-- ============================================================
-- 2. TEACHER SUBJECTS
-- David → Sciences (Maths, Physics, Chemistry, Biology) — WAEC & JAMB
-- Mary  → Humanities (English, Economics, Business, CS) — WAEC & JAMB
-- ============================================================

INSERT INTO teacher_subjects (teacher_id, subject_id, exam_board_id, assigned_by, assigned_at, is_active)
SELECT
  t.teacher_id,
  s.id AS subject_id,
  s.exam_board_id,
  'fbbaaebd-f518-4394-9046-78c9b3317c1f' AS assigned_by,
  NOW() AS assigned_at,
  true AS is_active
FROM subjects s
JOIN (VALUES
  ('a0ee242a-84dd-4ccf-819c-8e0eb8f59605'::uuid, 'MATH-101'),
  ('a0ee242a-84dd-4ccf-819c-8e0eb8f59605'::uuid, 'PHY-101'),
  ('a0ee242a-84dd-4ccf-819c-8e0eb8f59605'::uuid, 'CHEM-101'),
  ('a0ee242a-84dd-4ccf-819c-8e0eb8f59605'::uuid, 'BIO-101'),
  ('a0ee242a-84dd-4ccf-819c-8e0eb8f59605'::uuid, 'MATH-101-WAEC'),
  ('a0ee242a-84dd-4ccf-819c-8e0eb8f59605'::uuid, 'PHY-101-WAEC'),
  ('a0ee242a-84dd-4ccf-819c-8e0eb8f59605'::uuid, 'CHEM-101-WAEC'),
  ('a0ee242a-84dd-4ccf-819c-8e0eb8f59605'::uuid, 'BIO-101-WAEC'),
  ('2fc6d08e-6445-4790-9f83-2560f85f576c'::uuid, 'ENG-101'),
  ('2fc6d08e-6445-4790-9f83-2560f85f576c'::uuid, 'ECON-101'),
  ('2fc6d08e-6445-4790-9f83-2560f85f576c'::uuid, 'BUS-101'),
  ('2fc6d08e-6445-4790-9f83-2560f85f576c'::uuid, 'CS-101'),
  ('2fc6d08e-6445-4790-9f83-2560f85f576c'::uuid, 'ENG-101-WAEC'),
  ('2fc6d08e-6445-4790-9f83-2560f85f576c'::uuid, 'ECON-101-WAEC'),
  ('2fc6d08e-6445-4790-9f83-2560f85f576c'::uuid, 'BUS-101-WAEC'),
  ('2fc6d08e-6445-4790-9f83-2560f85f576c'::uuid, 'CS-101-WAEC')
) AS t(teacher_id, subject_code) ON s.code = t.subject_code
ON CONFLICT (teacher_id, subject_id) DO NOTHING;

-- ============================================================
-- 3. STUDENT EXAM TYPES
-- John Doe      → WAEC + JAMB
-- Temitope      → WAEC + NECO
-- Linked to their active subscriptions if any, else NULL
-- ============================================================

INSERT INTO student_exam_types (id, student_id, exam_board_id, subscription_id, granted_at, expires_at, is_active)
SELECT
  gen_random_uuid(),
  st.student_id,
  eb.id AS exam_board_id,
  (SELECT us.id FROM user_subscriptions us
   WHERE us.user_id = st.student_id
     AND us.status = 'active'
     AND us.end_date > NOW()
   ORDER BY us.end_date DESC LIMIT 1) AS subscription_id,
  NOW() AS granted_at,
  NOW() + INTERVAL '1 year' AS expires_at,
  true AS is_active
FROM
  (VALUES
    ('cd818b5c-24c2-46a4-ae0c-5635d7f671b0'::uuid, 'WAEC'),
    ('cd818b5c-24c2-46a4-ae0c-5635d7f671b0'::uuid, 'JAMB'),
    ('10429bfe-bb6b-4b01-99a1-f921bb956687'::uuid, 'WAEC'),
    ('10429bfe-bb6b-4b01-99a1-f921bb956687'::uuid, 'NECO')
  ) AS st(student_id, board_code)
JOIN exam_boards eb ON eb.code = st.board_code AND eb.is_active = true
ON CONFLICT (student_id, exam_board_id) DO NOTHING;

-- ============================================================
-- 4. STUDENT ANALYTICS
-- Baseline rows for John and Temitope
-- One row per student per exam board they have access to
-- ============================================================

INSERT INTO student_analytics (
  id, student_id, exam_board_id,
  total_questions_attempted, correct_answers, wrong_answers,
  accuracy_percentage, total_study_time_seconds, average_time_per_question,
  topics_started, topics_completed, topics_mastered,
  completion_percentage, current_streak_days, longest_streak_days,
  total_login_days, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  st.student_id,
  eb.id AS exam_board_id,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  NOW(), NOW()
FROM
  (VALUES
    ('cd818b5c-24c2-46a4-ae0c-5635d7f671b0'::uuid, 'WAEC'),
    ('cd818b5c-24c2-46a4-ae0c-5635d7f671b0'::uuid, 'JAMB'),
    ('10429bfe-bb6b-4b01-99a1-f921bb956687'::uuid, 'WAEC'),
    ('10429bfe-bb6b-4b01-99a1-f921bb956687'::uuid, 'NECO')
  ) AS st(student_id, board_code)
JOIN exam_boards eb ON eb.code = st.board_code AND eb.is_active = true
ON CONFLICT DO NOTHING;

-- ============================================================
-- VERIFY
-- ============================================================
SELECT 'questions'        AS tbl, COUNT(*) AS rows FROM questions
UNION ALL SELECT 'teacher_subjects',   COUNT(*) FROM teacher_subjects
UNION ALL SELECT 'student_exam_types', COUNT(*) FROM student_exam_types
UNION ALL SELECT 'student_analytics',  COUNT(*) FROM student_analytics;

COMMIT;
