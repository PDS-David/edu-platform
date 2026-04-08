-- ============================================================
-- AISchoolonair - Courses, Topics & Enrollments
-- Database: edu_platform
-- Run with: psql -U postgres -d edu_platform -f eac_courses_topics_enrollments.sql
-- ============================================================

SET client_encoding = 'UTF8';

-- ============================================================
-- KNOWN IDs
-- ============================================================
-- Teacher David  (Sciences):  a0ee242a-84dd-4ccf-819c-8e0eb8f59605
-- Teacher Mary   (Humanities): 2fc6d08e-6445-4790-9f83-2560f85f576c
-- Student John   (WAEC+JAMB): cd818b5c-24c2-46a4-ae0c-5635d7f671b0
-- Student Temitope (WAEC):    10429bfe-bb6b-4b01-99a1-f921bb956687
--
-- Exam boards  (from DB):
--   JAMB/UTME : 5f36f69f-078e-4a4f-951a-200d7f2c6623
--   WAEC      : 2c4f858c-43db-4e05-8333-c9e4d4839138
--
-- Subject codes  JAMB           WAEC
--   Mathematics  MATH-101       MATH-101-WAEC
--   Physics      PHY-101        PHY-101-WAEC
--   Chemistry    CHEM-101       CHEM-101-WAEC
--   Biology      BIO-101        BIO-101-WAEC
--   English      ENG-101        ENG-101-WAEC
--   Economics    ECON-101       ECON-101-WAEC
--   CS           CS-101         CS-101-WAEC
--   Business     BUS-101        BUS-101-WAEC
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: CREATE 16 COURSES
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- DAVID — Sciences — JAMB/UTME (4 courses)
-- ────────────────────────────────────────────────────────────

INSERT INTO courses (
  id, subject_id, teacher_id, title, description,
  difficulty_level, is_published, start_date, end_date, exam_board_id
)
SELECT
  gen_random_uuid(),
  s.id,
  'a0ee242a-84dd-4ccf-819c-8e0eb8f59605',
  v.title,
  v.description,
  'Intermediate',
  true,
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '6 months',
  '5f36f69f-078e-4a4f-951a-200d7f2c6623'
FROM subjects s
JOIN (VALUES
  ('MATH-101', 'JAMB Mathematics',
   'Comprehensive JAMB/UTME Mathematics covering algebra, geometry, statistics and calculus.'),
  ('PHY-101',  'JAMB Physics',
   'Complete JAMB/UTME Physics course covering mechanics, waves, electricity and modern physics.'),
  ('CHEM-101', 'JAMB Chemistry',
   'Full JAMB/UTME Chemistry covering atomic structure, bonding, reactions and organic chemistry.'),
  ('BIO-101',  'JAMB Biology',
   'In-depth JAMB/UTME Biology covering cell biology, genetics, ecology and human physiology.')
) AS v(code, title, description) ON s.code = v.code;

-- ────────────────────────────────────────────────────────────
-- DAVID — Sciences — WAEC (4 courses)
-- ────────────────────────────────────────────────────────────

INSERT INTO courses (
  id, subject_id, teacher_id, title, description,
  difficulty_level, is_published, start_date, end_date, exam_board_id
)
SELECT
  gen_random_uuid(),
  s.id,
  'a0ee242a-84dd-4ccf-819c-8e0eb8f59605',
  v.title,
  v.description,
  'Intermediate',
  true,
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '6 months',
  '2c4f858c-43db-4e05-8333-c9e4d4839138'
FROM subjects s
JOIN (VALUES
  ('MATH-101-WAEC', 'WAEC Mathematics',
   'Comprehensive WAEC Mathematics covering number theory, algebra, geometry and data handling.'),
  ('PHY-101-WAEC',  'WAEC Physics',
   'Complete WAEC Physics course covering mechanics, thermal physics, waves and electromagnetism.'),
  ('CHEM-101-WAEC', 'WAEC Chemistry',
   'Full WAEC Chemistry covering periodic table, chemical reactions, acids/bases and organic chemistry.'),
  ('BIO-101-WAEC',  'WAEC Biology',
   'In-depth WAEC Biology covering cell structure, reproduction, ecology and human biology.')
) AS v(code, title, description) ON s.code = v.code;

-- ────────────────────────────────────────────────────────────
-- MARY — Humanities — JAMB/UTME (4 courses)
-- ────────────────────────────────────────────────────────────

INSERT INTO courses (
  id, subject_id, teacher_id, title, description,
  difficulty_level, is_published, start_date, end_date, exam_board_id
)
SELECT
  gen_random_uuid(),
  s.id,
  '2fc6d08e-6445-4790-9f83-2560f85f576c',
  v.title,
  v.description,
  'Intermediate',
  true,
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '6 months',
  '5f36f69f-078e-4a4f-951a-200d7f2c6623'
FROM subjects s
JOIN (VALUES
  ('ENG-101',  'JAMB English Language',
   'Complete JAMB/UTME English Language covering comprehension, grammar, oral English and summary.'),
  ('ECON-101', 'JAMB Economics',
   'Full JAMB/UTME Economics covering micro and macroeconomics, demand/supply and Nigerian economy.'),
  ('CS-101',   'JAMB Computer Science',
   'JAMB/UTME Computer Science covering hardware, software, programming concepts and data management.'),
  ('BUS-101',  'JAMB Business Studies',
   'JAMB/UTME Business Studies covering business organisation, marketing, finance and management.')
) AS v(code, title, description) ON s.code = v.code;

-- ────────────────────────────────────────────────────────────
-- MARY — Humanities — WAEC (4 courses)
-- ────────────────────────────────────────────────────────────

INSERT INTO courses (
  id, subject_id, teacher_id, title, description,
  difficulty_level, is_published, start_date, end_date, exam_board_id
)
SELECT
  gen_random_uuid(),
  s.id,
  '2fc6d08e-6445-4790-9f83-2560f85f576c',
  v.title,
  v.description,
  'Intermediate',
  true,
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '6 months',
  '2c4f858c-43db-4e05-8333-c9e4d4839138'
FROM subjects s
JOIN (VALUES
  ('ENG-101-WAEC',  'WAEC English Language',
   'Complete WAEC English Language covering essay writing, comprehension, summary and oral English.'),
  ('ECON-101-WAEC', 'WAEC Economics',
   'Full WAEC Economics covering economic systems, production, market structures and development economics.'),
  ('CS-101-WAEC',   'WAEC Computer Science',
   'WAEC Computer Science covering computer systems, networks, programming and information systems.'),
  ('BUS-101-WAEC',  'WAEC Business Studies',
   'WAEC Business Studies covering entrepreneurship, office practice, commerce and business finance.')
) AS v(code, title, description) ON s.code = v.code;


-- ============================================================
-- STEP 2: CREATE 3 TOPICS PER COURSE (48 topics total)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- JAMB Mathematics topics
-- ────────────────────────────────────────────────────────────
INSERT INTO topics (id, course_id, title, description, order_index, estimated_hours)
SELECT gen_random_uuid(), c.id, v.title, v.description, v.order_index, v.hours
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN (VALUES
  (1, 'Number & Numeration',        'Indices, logarithms, surds, number bases and standard form.',          3),
  (2, 'Algebra & Equations',        'Polynomials, quadratic equations, inequalities and progressions.',     4),
  (3, 'Geometry, Trig & Calculus',  'Plane geometry, trigonometry, differentiation and integration.',      4)
) AS v(order_index, title, description, hours) ON true
WHERE s.code = 'MATH-101'
  AND c.exam_board_id = '5f36f69f-078e-4a4f-951a-200d7f2c6623';

-- JAMB Physics topics
INSERT INTO topics (id, course_id, title, description, order_index, estimated_hours)
SELECT gen_random_uuid(), c.id, v.title, v.description, v.order_index, v.hours
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN (VALUES
  (1, 'Mechanics & Properties of Matter', 'Motion, forces, energy, pressure and elasticity.',              4),
  (2, 'Waves, Sound & Light',             'Wave properties, sound, reflection, refraction and optics.',    3),
  (3, 'Electricity & Modern Physics',     'Electric circuits, magnetism, radioactivity and electronics.',  4)
) AS v(order_index, title, description, hours) ON true
WHERE s.code = 'PHY-101'
  AND c.exam_board_id = '5f36f69f-078e-4a4f-951a-200d7f2c6623';

-- JAMB Chemistry topics
INSERT INTO topics (id, course_id, title, description, order_index, estimated_hours)
SELECT gen_random_uuid(), c.id, v.title, v.description, v.order_index, v.hours
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN (VALUES
  (1, 'Atomic Structure & Bonding',   'Atomic theory, electronic configuration, ionic and covalent bonds.', 3),
  (2, 'Chemical Reactions & Kinetics','Reaction types, rates, equilibrium, acids, bases and salts.',        4),
  (3, 'Organic Chemistry',            'Hydrocarbons, functional groups, polymers and organic reactions.',   4)
) AS v(order_index, title, description, hours) ON true
WHERE s.code = 'CHEM-101'
  AND c.exam_board_id = '5f36f69f-078e-4a4f-951a-200d7f2c6623';

-- JAMB Biology topics
INSERT INTO topics (id, course_id, title, description, order_index, estimated_hours)
SELECT gen_random_uuid(), c.id, v.title, v.description, v.order_index, v.hours
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN (VALUES
  (1, 'Cell Biology & Genetics',    'Cell structure, division, DNA, heredity and evolution.',               3),
  (2, 'Plant & Animal Physiology',  'Photosynthesis, nutrition, transport, respiration and excretion.',     4),
  (3, 'Ecology & Environment',      'Ecosystems, food chains, population, conservation and pollution.',     3)
) AS v(order_index, title, description, hours) ON true
WHERE s.code = 'BIO-101'
  AND c.exam_board_id = '5f36f69f-078e-4a4f-951a-200d7f2c6623';

-- JAMB English Language topics
INSERT INTO topics (id, course_id, title, description, order_index, estimated_hours)
SELECT gen_random_uuid(), c.id, v.title, v.description, v.order_index, v.hours
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN (VALUES
  (1, 'Comprehension & Summary',  'Reading skills, passage analysis, note-taking and summarising.',         3),
  (2, 'Grammar & Usage',          'Parts of speech, tenses, concord, sentence structure and punctuation.',  4),
  (3, 'Oral English & Vocabulary','Vowels, consonants, stress, intonation, idioms and register.',           3)
) AS v(order_index, title, description, hours) ON true
WHERE s.code = 'ENG-101'
  AND c.exam_board_id = '5f36f69f-078e-4a4f-951a-200d7f2c6623';

-- JAMB Economics topics
INSERT INTO topics (id, course_id, title, description, order_index, estimated_hours)
SELECT gen_random_uuid(), c.id, v.title, v.description, v.order_index, v.hours
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN (VALUES
  (1, 'Microeconomics',           'Demand, supply, elasticity, market structures and theory of the firm.',  4),
  (2, 'Macroeconomics',           'GDP, inflation, unemployment, fiscal and monetary policy.',              4),
  (3, 'Nigerian & World Economy', 'Nigeria''s economic history, trade, development and globalisation.',     3)
) AS v(order_index, title, description, hours) ON true
WHERE s.code = 'ECON-101'
  AND c.exam_board_id = '5f36f69f-078e-4a4f-951a-200d7f2c6623';

-- JAMB Computer Science topics
INSERT INTO topics (id, course_id, title, description, order_index, estimated_hours)
SELECT gen_random_uuid(), c.id, v.title, v.description, v.order_index, v.hours
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN (VALUES
  (1, 'Computer Systems & Hardware', 'CPU, memory, storage, input/output devices and number systems.',      3),
  (2, 'Software & Operating Systems','System software, application software, OS functions and networking.', 3),
  (3, 'Programming & Data',          'Algorithms, flowcharts, programming concepts and database basics.',   4)
) AS v(order_index, title, description, hours) ON true
WHERE s.code = 'CS-101'
  AND c.exam_board_id = '5f36f69f-078e-4a4f-951a-200d7f2c6623';

-- JAMB Business Studies topics
INSERT INTO topics (id, course_id, title, description, order_index, estimated_hours)
SELECT gen_random_uuid(), c.id, v.title, v.description, v.order_index, v.hours
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN (VALUES
  (1, 'Business Organisation',  'Types of business, ownership structures, objectives and management.',      3),
  (2, 'Marketing & Commerce',   'Marketing mix, trade, channels of distribution and consumer behaviour.',   3),
  (3, 'Finance & Accounting',   'Sources of finance, financial statements, banking and insurance.',         4)
) AS v(order_index, title, description, hours) ON true
WHERE s.code = 'BUS-101'
  AND c.exam_board_id = '5f36f69f-078e-4a4f-951a-200d7f2c6623';


-- ────────────────────────────────────────────────────────────
-- WAEC Mathematics topics
-- ────────────────────────────────────────────────────────────
INSERT INTO topics (id, course_id, title, description, order_index, estimated_hours)
SELECT gen_random_uuid(), c.id, v.title, v.description, v.order_index, v.hours
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN (VALUES
  (1, 'Number Theory & Fractions',  'LCM, HCF, fractions, percentages, ratios and standard form.',          3),
  (2, 'Algebra & Statistics',       'Expressions, equations, inequalities, mean, median, mode and graphs.',  4),
  (3, 'Geometry & Mensuration',     'Angles, triangles, circles, areas, volumes and trigonometry.',          4)
) AS v(order_index, title, description, hours) ON true
WHERE s.code = 'MATH-101-WAEC'
  AND c.exam_board_id = '2c4f858c-43db-4e05-8333-c9e4d4839138';

-- WAEC Physics topics
INSERT INTO topics (id, course_id, title, description, order_index, estimated_hours)
SELECT gen_random_uuid(), c.id, v.title, v.description, v.order_index, v.hours
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN (VALUES
  (1, 'Mechanics & Thermal Physics', 'Kinematics, Newton''s laws, energy, temperature and gas laws.',       4),
  (2, 'Waves & Optics',              'Wave motion, sound, light, reflection, refraction and lenses.',       3),
  (3, 'Electricity & Magnetism',     'Circuits, Ohm''s law, capacitors, electromagnetism and induction.',   4)
) AS v(order_index, title, description, hours) ON true
WHERE s.code = 'PHY-101-WAEC'
  AND c.exam_board_id = '2c4f858c-43db-4e05-8333-c9e4d4839138';

-- WAEC Chemistry topics
INSERT INTO topics (id, course_id, title, description, order_index, estimated_hours)
SELECT gen_random_uuid(), c.id, v.title, v.description, v.order_index, v.hours
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN (VALUES
  (1, 'Periodic Table & Bonding',    'Elements, periodic trends, ionic, covalent and metallic bonding.',    3),
  (2, 'Acids, Bases & Electrolysis', 'pH, neutralisation, salts, electrolysis and electrochemistry.',       4),
  (3, 'Organic & Industrial Chem',   'Alkanes, alkenes, alcohols, polymers and industrial processes.',      4)
) AS v(order_index, title, description, hours) ON true
WHERE s.code = 'CHEM-101-WAEC'
  AND c.exam_board_id = '2c4f858c-43db-4e05-8333-c9e4d4839138';

-- WAEC Biology topics
INSERT INTO topics (id, course_id, title, description, order_index, estimated_hours)
SELECT gen_random_uuid(), c.id, v.title, v.description, v.order_index, v.hours
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN (VALUES
  (1, 'Cell & Molecular Biology',  'Cell organelles, cell division, DNA, RNA and protein synthesis.',        3),
  (2, 'Human Biology & Health',    'Digestive, circulatory, respiratory, nervous and reproductive systems.', 4),
  (3, 'Ecology & Classification',  'Taxonomy, ecosystems, food webs, conservation and disease.',             3)
) AS v(order_index, title, description, hours) ON true
WHERE s.code = 'BIO-101-WAEC'
  AND c.exam_board_id = '2c4f858c-43db-4e05-8333-c9e4d4839138';

-- WAEC English Language topics
INSERT INTO topics (id, course_id, title, description, order_index, estimated_hours)
SELECT gen_random_uuid(), c.id, v.title, v.description, v.order_index, v.hours
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN (VALUES
  (1, 'Essay & Letter Writing',    'Formal and informal writing, argument, narration and description.',      3),
  (2, 'Comprehension & Summary',   'Reading strategies, inference, passage analysis and note-making.',       3),
  (3, 'Grammar, Oral & Vocab',     'Syntax, concord, phonetics, stress patterns and vocabulary building.',   4)
) AS v(order_index, title, description, hours) ON true
WHERE s.code = 'ENG-101-WAEC'
  AND c.exam_board_id = '2c4f858c-43db-4e05-8333-c9e4d4839138';

-- WAEC Economics topics
INSERT INTO topics (id, course_id, title, description, order_index, estimated_hours)
SELECT gen_random_uuid(), c.id, v.title, v.description, v.order_index, v.hours
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN (VALUES
  (1, 'Production & Market Theory', 'Factors of production, costs, market structures and pricing.',         4),
  (2, 'Money, Banking & Trade',     'Money supply, banking system, balance of payments and trade policy.',   3),
  (3, 'Development Economics',      'Economic growth, poverty, unemployment, taxation and budgeting.',       3)
) AS v(order_index, title, description, hours) ON true
WHERE s.code = 'ECON-101-WAEC'
  AND c.exam_board_id = '2c4f858c-43db-4e05-8333-c9e4d4839138';

-- WAEC Computer Science topics
INSERT INTO topics (id, course_id, title, description, order_index, estimated_hours)
SELECT gen_random_uuid(), c.id, v.title, v.description, v.order_index, v.hours
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN (VALUES
  (1, 'Computer Organisation',     'Generations, components, number systems, Boolean algebra and logic gates.', 3),
  (2, 'Networks & Internet',        'LAN, WAN, internet, protocols, cybersecurity and e-commerce.',          3),
  (3, 'Programming & Databases',    'Problem-solving, flowcharts, pseudocode, SQL and spreadsheets.',        4)
) AS v(order_index, title, description, hours) ON true
WHERE s.code = 'CS-101-WAEC'
  AND c.exam_board_id = '2c4f858c-43db-4e05-8333-c9e4d4839138';

-- WAEC Business Studies topics
INSERT INTO topics (id, course_id, title, description, order_index, estimated_hours)
SELECT gen_random_uuid(), c.id, v.title, v.description, v.order_index, v.hours
FROM courses c
JOIN subjects s ON s.id = c.subject_id
JOIN (VALUES
  (1, 'Entrepreneurship & Mgmt',  'Business creation, management functions, leadership and decision-making.', 3),
  (2, 'Office Practice & Trade',  'Office procedures, communication, home trade and international trade.',   3),
  (3, 'Business Finance',         'Sources of capital, financial documents, insurance and the stock exchange.', 4)
) AS v(order_index, title, description, hours) ON true
WHERE s.code = 'BUS-101-WAEC'
  AND c.exam_board_id = '2c4f858c-43db-4e05-8333-c9e4d4839138';


-- ============================================================
-- STEP 3: ENROLL JOHN in all 16 JAMB + WAEC courses
-- ============================================================

INSERT INTO enrollments (id, student_id, course_id, enrollment_date, progress_percentage, status)
SELECT
  gen_random_uuid(),
  'cd818b5c-24c2-46a4-ae0c-5635d7f671b0',
  c.id,
  CURRENT_DATE,
  0,
  'active'
FROM courses c
JOIN exam_boards eb ON eb.id = c.exam_board_id
WHERE eb.name IN ('JAMB/UTME', 'WAEC')
  AND c.teacher_id IN (
    'a0ee242a-84dd-4ccf-819c-8e0eb8f59605',
    '2fc6d08e-6445-4790-9f83-2560f85f576c'
  );


-- ============================================================
-- STEP 4: ENROLL TEMITOPE in all 8 WAEC courses only
-- ============================================================

INSERT INTO enrollments (id, student_id, course_id, enrollment_date, progress_percentage, status)
SELECT
  gen_random_uuid(),
  '10429bfe-bb6b-4b01-99a1-f921bb956687',
  c.id,
  CURRENT_DATE,
  0,
  'active'
FROM courses c
JOIN exam_boards eb ON eb.id = c.exam_board_id
WHERE eb.name = 'WAEC'
  AND c.teacher_id IN (
    'a0ee242a-84dd-4ccf-819c-8e0eb8f59605',
    '2fc6d08e-6445-4790-9f83-2560f85f576c'
  );


COMMIT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Count courses per board and teacher
-- SELECT eb.name, u.full_name, COUNT(*) AS courses
-- FROM courses c
-- JOIN exam_boards eb ON eb.id = c.exam_board_id
-- JOIN users u ON u.id = c.teacher_id
-- WHERE eb.name IN ('JAMB/UTME','WAEC')
-- GROUP BY eb.name, u.full_name
-- ORDER BY eb.name, u.full_name;

-- Count topics per course
-- SELECT c.title, COUNT(t.id) AS topics
-- FROM courses c
-- LEFT JOIN topics t ON t.course_id = c.id
-- WHERE c.exam_board_id IN (
--   '5f36f69f-078e-4a4f-951a-200d7f2c6623',
--   '2c4f858c-43db-4e05-8333-c9e4d4839138'
-- )
-- GROUP BY c.title
-- ORDER BY c.title;

-- Count enrollments per student
-- SELECT u.full_name, COUNT(*) AS enrolled_courses
-- FROM enrollments e
-- JOIN users u ON u.id = e.student_id
-- WHERE e.student_id IN (
--   'cd818b5c-24c2-46a4-ae0c-5635d7f671b0',
--   '10429bfe-bb6b-4b01-99a1-f921bb956687'
-- )
-- GROUP BY u.full_name;
