-- ================================================================
-- EAC LEARNING PLATFORM — TOPICS & SUBTOPICS SEED (v3)
-- Fix: topics.title column is NOT NULL in original schema.sql
-- We supply title = name to satisfy the constraint.
-- Also supplies course_id as NULL (nullable FK).
-- Safe to re-run: ON CONFLICT (id) DO NOTHING
-- ================================================================

BEGIN;

-- STEP 1: Insert topics
-- title = name to satisfy NOT NULL constraint from original schema
-- Biology
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'aa0f4569-8eaa-5cd4-95ad-f81f204c9c15'::uuid,
  NULL,
  'Cell Biology',
  'Cell Biology',
  'Cell Biology — Biology (JAMB)',
  1,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'd5ca56f0-de37-548c-8717-488a9ca8f8e9'::uuid,
  NULL,
  'Human Biology',
  'Human Biology',
  'Human Biology — Biology (JAMB)',
  2,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '43055fdd-7291-5700-9e9c-8c351314a556'::uuid,
  NULL,
  'Ecology',
  'Ecology',
  'Ecology — Biology (JAMB)',
  3,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '3092e05b-7b2a-53df-8bb1-46d7f0fc9a18'::uuid,
  NULL,
  'Genetics',
  'Genetics',
  'Genetics — Biology (JAMB)',
  4,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '081992ad-93ac-5389-9a17-bafa7b9e9107'::uuid,
  NULL,
  'Cell Division',
  'Cell Division',
  'Cell Division — Biology (JAMB)',
  5,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'f24e8398-651a-55cd-b99a-377411c0fc52'::uuid,
  NULL,
  'Excretion',
  'Excretion',
  'Excretion — Biology (JAMB)',
  6,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '0673fa4b-acc8-5457-a513-7c3b215d72d7'::uuid,
  NULL,
  'Photosynthesis',
  'Photosynthesis',
  'Photosynthesis — Biology (JAMB)',
  7,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'a38a0699-6a6f-5dc6-9994-a0d7806953e9'::uuid,
  NULL,
  'Digestion',
  'Digestion',
  'Digestion — Biology (JAMB)',
  8,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'adea851f-b454-59eb-8204-d8ba0ee6cf06'::uuid,
  NULL,
  'Respiration',
  'Respiration',
  'Respiration — Biology (JAMB)',
  9,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'cf2705c6-aad0-5237-84af-d545bd713844'::uuid,
  NULL,
  'Plant Biology',
  'Plant Biology',
  'Plant Biology — Biology (JAMB)',
  10,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;

-- Business Studies
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '32c96d66-57de-595d-95e9-aeaed095d53b'::uuid,
  NULL,
  'Accounting',
  'Accounting',
  'Accounting — Business Studies (JAMB)',
  1,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '7d390b9e-9667-535b-9470-b79a0b0228f7'::uuid,
  NULL,
  'Business Structures',
  'Business Structures',
  'Business Structures — Business Studies (JAMB)',
  2,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'a2ed1f5a-7d2e-5d85-86a0-152d2c3c9db8'::uuid,
  NULL,
  'Management',
  'Management',
  'Management — Business Studies (JAMB)',
  3,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'ab08834c-fc65-597a-bf52-6685d15018bb'::uuid,
  NULL,
  'Business Strategy',
  'Business Strategy',
  'Business Strategy — Business Studies (JAMB)',
  4,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '348e38b5-c43b-51b7-ada2-2b0549a422a9'::uuid,
  NULL,
  'Entrepreneurship',
  'Entrepreneurship',
  'Entrepreneurship — Business Studies (JAMB)',
  5,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'c711e61f-843f-5330-a4f9-5c92cdfbed5e'::uuid,
  NULL,
  'Finance',
  'Finance',
  'Finance — Business Studies (JAMB)',
  6,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'a3dcc3f8-ed2b-5c6e-b1f4-6ec9607440e4'::uuid,
  NULL,
  'Marketing',
  'Marketing',
  'Marketing — Business Studies (JAMB)',
  7,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '4e512af7-f6f2-569d-ae9e-5b306ccec72f'::uuid,
  NULL,
  'Business Basics',
  'Business Basics',
  'Business Basics — Business Studies (JAMB)',
  8,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '00d32850-9e50-513c-a382-1104c38fae7e'::uuid,
  NULL,
  'Production',
  'Production',
  'Production — Business Studies (JAMB)',
  9,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;

-- Chemistry
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '755f4eb9-ae2c-51c2-afb9-1e38890dd143'::uuid,
  NULL,
  'Chemical Reactions',
  'Chemical Reactions',
  'Chemical Reactions — Chemistry (JAMB)',
  1,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '3e998c9a-37df-54bf-bc8d-a1003af08114'::uuid,
  NULL,
  'Basic Chemistry',
  'Basic Chemistry',
  'Basic Chemistry — Chemistry (JAMB)',
  2,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '784903b5-2265-5374-81ce-99a5ac46d005'::uuid,
  NULL,
  'Atomic Structure',
  'Atomic Structure',
  'Atomic Structure — Chemistry (JAMB)',
  3,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '0d44fb7e-c343-5e02-94e4-162b19ce4ef5'::uuid,
  NULL,
  'Chemical Bonding',
  'Chemical Bonding',
  'Chemical Bonding — Chemistry (JAMB)',
  4,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '215170e9-f023-56e2-950b-731aaa1a723d'::uuid,
  NULL,
  'Mole Concept',
  'Mole Concept',
  'Mole Concept — Chemistry (JAMB)',
  5,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '626f7878-1b76-5ae8-a156-0bb18396e345'::uuid,
  NULL,
  'Periodic Table',
  'Periodic Table',
  'Periodic Table — Chemistry (JAMB)',
  6,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '1ccbc22d-1336-5ea6-9886-82f720b36610'::uuid,
  NULL,
  'Concentration',
  'Concentration',
  'Concentration — Chemistry (JAMB)',
  7,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '4d05be38-2ed5-53da-8921-d1939aecac2a'::uuid,
  NULL,
  'Equilibrium',
  'Equilibrium',
  'Equilibrium — Chemistry (JAMB)',
  8,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'd0ef2656-5c63-568b-89c1-998e298b0228'::uuid,
  NULL,
  'Acids and Bases',
  'Acids and Bases',
  'Acids and Bases — Chemistry (JAMB)',
  9,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '37ad5d83-9ec0-520b-a584-d9f4ff59f138'::uuid,
  NULL,
  'Redox Reactions',
  'Redox Reactions',
  'Redox Reactions — Chemistry (JAMB)',
  10,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '87544bc1-865f-5ffb-91ae-946cee850fab'::uuid,
  NULL,
  'Chemical Equations',
  'Chemical Equations',
  'Chemical Equations — Chemistry (JAMB)',
  11,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'e30aa52a-e562-5347-b019-f6d791187aea'::uuid,
  NULL,
  'Electrolysis',
  'Electrolysis',
  'Electrolysis — Chemistry (JAMB)',
  12,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'bb38bc95-781e-540d-a5fd-96c8a282e90c'::uuid,
  NULL,
  'Industrial Chemistry',
  'Industrial Chemistry',
  'Industrial Chemistry — Chemistry (JAMB)',
  13,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'a5253006-8487-5854-8c10-245d2079f45d'::uuid,
  NULL,
  'Separation Techniques',
  'Separation Techniques',
  'Separation Techniques — Chemistry (JAMB)',
  14,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;

-- Computer Science
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'c1607c50-363a-5e75-bc0b-a2e03d596fc0'::uuid,
  NULL,
  'Programming',
  'Programming',
  'Programming — Computer Science (JAMB)',
  1,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'f31dad19-e4d1-5f36-89c9-b1b68c368d36'::uuid,
  NULL,
  'Algorithms',
  'Algorithms',
  'Algorithms — Computer Science (JAMB)',
  2,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '9ffa8b1d-75e9-57a2-a931-67b1c9ecc9c2'::uuid,
  NULL,
  'Computer Hardware',
  'Computer Hardware',
  'Computer Hardware — Computer Science (JAMB)',
  3,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '9c7ca981-36f1-57f7-8fdd-4804557e80af'::uuid,
  NULL,
  'Number Systems',
  'Number Systems',
  'Number Systems — Computer Science (JAMB)',
  4,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '0e3090ca-a21a-52d7-82e1-2223374f9128'::uuid,
  NULL,
  'Networks',
  'Networks',
  'Networks — Computer Science (JAMB)',
  5,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'b8360af2-1e14-5e09-90c7-030db60c2efe'::uuid,
  NULL,
  'Web Technology',
  'Web Technology',
  'Web Technology — Computer Science (JAMB)',
  6,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '33245887-d6a3-5463-b382-88e55f3d36e6'::uuid,
  NULL,
  'Databases',
  'Databases',
  'Databases — Computer Science (JAMB)',
  7,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'd5cb632d-d663-5304-8a79-e7ede48a9e8b'::uuid,
  NULL,
  'Logic',
  'Logic',
  'Logic — Computer Science (JAMB)',
  8,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '886c83f7-3f4b-5bc5-92d1-66d154ee9104'::uuid,
  NULL,
  'Operating Systems',
  'Operating Systems',
  'Operating Systems — Computer Science (JAMB)',
  9,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '251c4ff5-04cf-5bee-9525-4547958701d5'::uuid,
  NULL,
  'Computer Basics',
  'Computer Basics',
  'Computer Basics — Computer Science (JAMB)',
  10,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;

-- Economics
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '0b0a6e36-4a24-5484-bcd1-0639abb96157'::uuid,
  NULL,
  'Macroeconomics',
  'Macroeconomics',
  'Macroeconomics — Economics (JAMB)',
  1,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '6f6371d8-9407-534b-9841-8f928cf0903f'::uuid,
  NULL,
  'Basic Concepts',
  'Basic Concepts',
  'Basic Concepts — Economics (JAMB)',
  2,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'c161a362-e963-5114-a82c-39cbfbccdf1f'::uuid,
  NULL,
  'Microeconomics',
  'Microeconomics',
  'Microeconomics — Economics (JAMB)',
  3,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '152d23d4-d461-5798-be0a-289a2af2a7a0'::uuid,
  NULL,
  'International Trade',
  'International Trade',
  'International Trade — Economics (JAMB)',
  4,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '91ba0bc1-14c4-5e94-97da-dd65fc460a5f'::uuid,
  NULL,
  'Production Theory',
  'Production Theory',
  'Production Theory — Economics (JAMB)',
  5,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '7116026b-63a6-572d-9196-212366c74c55'::uuid,
  NULL,
  'Money and Banking',
  'Money and Banking',
  'Money and Banking — Economics (JAMB)',
  6,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '2c651bc4-ebec-5fec-848e-c800fb73375d'::uuid,
  NULL,
  'Supply and Demand',
  'Supply and Demand',
  'Supply and Demand — Economics (JAMB)',
  7,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '1041cad3-144b-580d-87be-4e0e21731ac8'::uuid,
  NULL,
  'Public Finance',
  'Public Finance',
  'Public Finance — Economics (JAMB)',
  8,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '9e7c0ace-5da9-5dfc-b80a-59e5fcc6ed08'::uuid,
  NULL,
  'Economic Systems',
  'Economic Systems',
  'Economic Systems — Economics (JAMB)',
  9,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;

-- English Language
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '47f9508c-7381-5605-a67a-663d71eb66e2'::uuid,
  NULL,
  'Grammar',
  'Grammar',
  'Grammar — English Language (JAMB)',
  1,
  (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'English Language' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '899cfa59-ab62-5883-830e-d9d9b42ba5b2'::uuid,
  NULL,
  'Vocabulary',
  'Vocabulary',
  'Vocabulary — English Language (JAMB)',
  2,
  (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'English Language' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'd3f33b80-f24c-5f68-9f95-6cacd03228cf'::uuid,
  NULL,
  'Figures of Speech',
  'Figures of Speech',
  'Figures of Speech — English Language (JAMB)',
  3,
  (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'English Language' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '8057f9f1-0695-527e-9eb3-77f19a4d84dd'::uuid,
  NULL,
  'Parts of Speech',
  'Parts of Speech',
  'Parts of Speech — English Language (JAMB)',
  4,
  (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'English Language' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'a96fa428-1415-558e-9b55-92a707b45b49'::uuid,
  NULL,
  'Literary Analysis',
  'Literary Analysis',
  'Literary Analysis — English Language (JAMB)',
  5,
  (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'English Language' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '93155430-0807-5852-8296-cb4b071a55b8'::uuid,
  NULL,
  'Sentence Structure',
  'Sentence Structure',
  'Sentence Structure — English Language (JAMB)',
  6,
  (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'English Language' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'ea1846ea-7df5-54de-9a55-55f93b7b80a2'::uuid,
  NULL,
  'Comprehension',
  'Comprehension',
  'Comprehension — English Language (JAMB)',
  7,
  (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'English Language' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;

-- Mathematics
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '22ab3401-498b-5d27-950d-5399abb354dd'::uuid,
  NULL,
  'Algebra',
  'Algebra',
  'Algebra — Mathematics (JAMB)',
  1,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'a25572a1-1cb8-5807-8127-c5733145af31'::uuid,
  NULL,
  'Geometry',
  'Geometry',
  'Geometry — Mathematics (JAMB)',
  2,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'a81219d4-1780-57d9-8b01-7e2e7290edf8'::uuid,
  NULL,
  'Coordinate Geometry',
  'Coordinate Geometry',
  'Coordinate Geometry — Mathematics (JAMB)',
  3,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'c37b12b4-4ccf-555a-b5f4-d94da151d669'::uuid,
  NULL,
  'Mensuration',
  'Mensuration',
  'Mensuration — Mathematics (JAMB)',
  4,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '1b9bd30c-ce7b-5914-b1e7-5fdda1086524'::uuid,
  NULL,
  'Percentages',
  'Percentages',
  'Percentages — Mathematics (JAMB)',
  5,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '9919d707-5bdb-5c9e-a5dd-ceecc6ae6c16'::uuid,
  NULL,
  'Quadratic Equations',
  'Quadratic Equations',
  'Quadratic Equations — Mathematics (JAMB)',
  6,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '293fcc4e-20f6-55ce-8a5f-9c426ff5fb4b'::uuid,
  NULL,
  'Trigonometry',
  'Trigonometry',
  'Trigonometry — Mathematics (JAMB)',
  7,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'e7bc261a-ca1e-56f6-aa50-f16ee1fa23e8'::uuid,
  NULL,
  'Logarithms',
  'Logarithms',
  'Logarithms — Mathematics (JAMB)',
  8,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '188d2d12-7160-5873-a913-34f42931c3c4'::uuid,
  NULL,
  'Permutation and Combination',
  'Permutation and Combination',
  'Permutation and Combination — Mathematics (JAMB)',
  9,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '35700058-eb06-52ff-bddd-71d3ddf5e724'::uuid,
  NULL,
  'Number Theory',
  'Number Theory',
  'Number Theory — Mathematics (JAMB)',
  10,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'a0922030-1c50-5047-90b4-d0373a168777'::uuid,
  NULL,
  'Statistics',
  'Statistics',
  'Statistics — Mathematics (JAMB)',
  11,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '8b886c02-5662-5330-bc1a-d31662060fbb'::uuid,
  NULL,
  'Functions',
  'Functions',
  'Functions — Mathematics (JAMB)',
  12,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'c23eb8e6-789f-5ca6-8750-1e437bfddb0b'::uuid,
  NULL,
  'Calculus',
  'Calculus',
  'Calculus — Mathematics (JAMB)',
  13,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;

-- Physics
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '6eb3b1cf-ffde-50e4-97fb-d0c269b145f2'::uuid,
  NULL,
  'Electricity',
  'Electricity',
  'Electricity — Physics (JAMB)',
  1,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'd42317f7-1199-511e-9031-f5b0343137d5'::uuid,
  NULL,
  'Mechanics',
  'Mechanics',
  'Mechanics — Physics (JAMB)',
  2,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'cbf62719-c067-51f4-b935-62ecc199263c'::uuid,
  NULL,
  'Optics',
  'Optics',
  'Optics — Physics (JAMB)',
  3,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '079cc9ee-faa9-5032-8a79-043ea3dbfeb4'::uuid,
  NULL,
  'Motion',
  'Motion',
  'Motion — Physics (JAMB)',
  4,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '558e39b4-1289-57f9-ac49-0d1e517a9cb1'::uuid,
  NULL,
  'Waves',
  'Waves',
  'Waves — Physics (JAMB)',
  5,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '69a8d8b1-5d78-5962-9dee-a835606c21e9'::uuid,
  NULL,
  'Electromagnetism',
  'Electromagnetism',
  'Electromagnetism — Physics (JAMB)',
  6,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'e55620a8-0bc8-5698-8953-886601a6c667'::uuid,
  NULL,
  'Energy',
  'Energy',
  'Energy — Physics (JAMB)',
  7,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'f90875f2-386f-5123-ae7c-d1c7e8f84353'::uuid,
  NULL,
  'Nuclear Physics',
  'Nuclear Physics',
  'Nuclear Physics — Physics (JAMB)',
  8,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  '783d61c2-e51e-55bb-8b38-16d9805c6f3b'::uuid,
  NULL,
  'Pressure',
  'Pressure',
  'Pressure — Physics (JAMB)',
  9,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;
INSERT INTO topics (id, course_id, title, name, description, order_index, subject_id, exam_board_id)
VALUES (
  'ddfad4c9-40d3-5e5b-b842-36755d7caf6e'::uuid,
  NULL,
  'Modern Physics',
  'Modern Physics',
  'Modern Physics — Physics (JAMB)',
  10,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1)
) ON CONFLICT (id) DO NOTHING;

-- STEP 2: Insert subtopics (one per topic)
-- Biology
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '653e93f9-53d4-56fc-b4ff-ce357bd7eec1'::uuid,
  'aa0f4569-8eaa-5cd4-95ad-f81f204c9c15'::uuid,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1),
  'Cell Biology',
  'Cell Biology — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'de580a68-c5d4-507d-adf4-a47d66a4a1f9'::uuid,
  'd5ca56f0-de37-548c-8717-488a9ca8f8e9'::uuid,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1),
  'Human Biology',
  'Human Biology — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '323b6951-35a7-5606-8bba-fe6512a7af7f'::uuid,
  '43055fdd-7291-5700-9e9c-8c351314a556'::uuid,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1),
  'Ecology',
  'Ecology — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '5965f4d6-a099-56d6-bd9b-914517371bed'::uuid,
  '3092e05b-7b2a-53df-8bb1-46d7f0fc9a18'::uuid,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1),
  'Genetics',
  'Genetics — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'df6e2c3a-906a-5d26-bb18-659e8b0cddcf'::uuid,
  '081992ad-93ac-5389-9a17-bafa7b9e9107'::uuid,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1),
  'Cell Division',
  'Cell Division — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '11420023-d3a5-57be-a173-1ca635be9799'::uuid,
  'f24e8398-651a-55cd-b99a-377411c0fc52'::uuid,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1),
  'Excretion',
  'Excretion — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '86b55307-a231-5b9b-a700-c142d69f4821'::uuid,
  '0673fa4b-acc8-5457-a513-7c3b215d72d7'::uuid,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1),
  'Photosynthesis',
  'Photosynthesis — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '5cba798d-756c-5a49-81e9-aa60880e6de0'::uuid,
  'a38a0699-6a6f-5dc6-9994-a0d7806953e9'::uuid,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1),
  'Digestion',
  'Digestion — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '2fa7f616-9fc3-58e1-a3b7-8bc43b022108'::uuid,
  'adea851f-b454-59eb-8204-d8ba0ee6cf06'::uuid,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1),
  'Respiration',
  'Respiration — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '9643710a-cb94-5852-9349-8233ec16ad3d'::uuid,
  'cf2705c6-aad0-5237-84af-d545bd713844'::uuid,
  (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Biology' LIMIT 1),
  'Plant Biology',
  'Plant Biology — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;

-- Business Studies
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '2eeb4993-aa4f-5d11-ae7f-88ee1306891c'::uuid,
  '32c96d66-57de-595d-95e9-aeaed095d53b'::uuid,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  'Accounting',
  'Accounting — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'd3597182-14c4-56f7-91b3-84b1d493fd83'::uuid,
  '7d390b9e-9667-535b-9470-b79a0b0228f7'::uuid,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  'Business Structures',
  'Business Structures — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '46a1a2ce-b512-5e95-aece-d0caf3d8332b'::uuid,
  'a2ed1f5a-7d2e-5d85-86a0-152d2c3c9db8'::uuid,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  'Management',
  'Management — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '525879c1-c29e-5f4f-bcbe-c9dedd65f92c'::uuid,
  'ab08834c-fc65-597a-bf52-6685d15018bb'::uuid,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  'Business Strategy',
  'Business Strategy — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '247f5234-a35f-5796-9f65-3d38a10d33d0'::uuid,
  '348e38b5-c43b-51b7-ada2-2b0549a422a9'::uuid,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  'Entrepreneurship',
  'Entrepreneurship — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'a5e53996-c3f9-515a-ae5b-77e082e279e1'::uuid,
  'c711e61f-843f-5330-a4f9-5c92cdfbed5e'::uuid,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  'Finance',
  'Finance — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'b7d8ccf4-95ae-589d-8372-21030f0199dd'::uuid,
  'a3dcc3f8-ed2b-5c6e-b1f4-6ec9607440e4'::uuid,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  'Marketing',
  'Marketing — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '557247e8-7539-55be-b2ff-51f378ce89b5'::uuid,
  '4e512af7-f6f2-569d-ae9e-5b306ccec72f'::uuid,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  'Business Basics',
  'Business Basics — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'f0fa8b2a-5bb6-5d84-bbc8-00b05f9624a6'::uuid,
  '00d32850-9e50-513c-a382-1104c38fae7e'::uuid,
  (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Business Studies' LIMIT 1),
  'Production',
  'Production — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;

-- Chemistry
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'b14ad343-42b5-58be-acef-44c027788cf3'::uuid,
  '755f4eb9-ae2c-51c2-afb9-1e38890dd143'::uuid,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  'Chemical Reactions',
  'Chemical Reactions — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '773978cb-4953-5489-adb2-5ff73c34b821'::uuid,
  '3e998c9a-37df-54bf-bc8d-a1003af08114'::uuid,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  'Basic Chemistry',
  'Basic Chemistry — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '6f324737-e5c1-564b-94f8-402599f63ca9'::uuid,
  '784903b5-2265-5374-81ce-99a5ac46d005'::uuid,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  'Atomic Structure',
  'Atomic Structure — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'b67b8a2f-e4b3-5043-9dd4-c75c31340527'::uuid,
  '0d44fb7e-c343-5e02-94e4-162b19ce4ef5'::uuid,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  'Chemical Bonding',
  'Chemical Bonding — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '6d203aac-9223-5a9c-8ac1-42dfd0938f73'::uuid,
  '215170e9-f023-56e2-950b-731aaa1a723d'::uuid,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  'Mole Concept',
  'Mole Concept — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '203b866c-7089-5250-8d06-2b06378cff56'::uuid,
  '626f7878-1b76-5ae8-a156-0bb18396e345'::uuid,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  'Periodic Table',
  'Periodic Table — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '20d5646b-040d-5e93-94bd-824a3f3f2237'::uuid,
  '1ccbc22d-1336-5ea6-9886-82f720b36610'::uuid,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  'Concentration',
  'Concentration — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'ec3a318d-984b-5891-ba62-ffc5c9bd3602'::uuid,
  '4d05be38-2ed5-53da-8921-d1939aecac2a'::uuid,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  'Equilibrium',
  'Equilibrium — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'fa1d4a07-cc60-5658-afc9-53693b2b184c'::uuid,
  'd0ef2656-5c63-568b-89c1-998e298b0228'::uuid,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  'Acids and Bases',
  'Acids and Bases — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '83a5b730-5129-5fff-b9ab-fcde76bff42e'::uuid,
  '37ad5d83-9ec0-520b-a584-d9f4ff59f138'::uuid,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  'Redox Reactions',
  'Redox Reactions — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '84c62519-71a4-5ecf-a9ee-6a5b59e42aa3'::uuid,
  '87544bc1-865f-5ffb-91ae-946cee850fab'::uuid,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  'Chemical Equations',
  'Chemical Equations — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'badd359b-4cf8-5a8a-adfd-872cd87f5148'::uuid,
  'e30aa52a-e562-5347-b019-f6d791187aea'::uuid,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  'Electrolysis',
  'Electrolysis — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '6578879b-e1a3-5354-8f36-008a558bc208'::uuid,
  'bb38bc95-781e-540d-a5fd-96c8a282e90c'::uuid,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  'Industrial Chemistry',
  'Industrial Chemistry — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '3583ed38-d0e0-507d-bb50-c16379b399ff'::uuid,
  'a5253006-8487-5854-8c10-245d2079f45d'::uuid,
  (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Chemistry' LIMIT 1),
  'Separation Techniques',
  'Separation Techniques — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;

-- Computer Science
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '865e21a9-a3fd-5314-907c-8cd15fd0f56b'::uuid,
  'c1607c50-363a-5e75-bc0b-a2e03d596fc0'::uuid,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  'Programming',
  'Programming — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '5a4b2331-2e5d-55ca-aa1f-20ac76b767a9'::uuid,
  'f31dad19-e4d1-5f36-89c9-b1b68c368d36'::uuid,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  'Algorithms',
  'Algorithms — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'f3b639e5-ea7d-5229-9182-708e387f0afa'::uuid,
  '9ffa8b1d-75e9-57a2-a931-67b1c9ecc9c2'::uuid,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  'Computer Hardware',
  'Computer Hardware — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'a886050d-bbc4-5fa5-93b8-2df38d1dd8ec'::uuid,
  '9c7ca981-36f1-57f7-8fdd-4804557e80af'::uuid,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  'Number Systems',
  'Number Systems — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'c147d17b-1f0c-5c6c-833e-36f13f54b5d8'::uuid,
  '0e3090ca-a21a-52d7-82e1-2223374f9128'::uuid,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  'Networks',
  'Networks — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '8f00de4b-9deb-58cb-aabf-72043f28b103'::uuid,
  'b8360af2-1e14-5e09-90c7-030db60c2efe'::uuid,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  'Web Technology',
  'Web Technology — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '70618ee6-07bd-546b-99ca-727de9827e34'::uuid,
  '33245887-d6a3-5463-b382-88e55f3d36e6'::uuid,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  'Databases',
  'Databases — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '11298dc2-0595-5191-a531-089e3c61c1ae'::uuid,
  'd5cb632d-d663-5304-8a79-e7ede48a9e8b'::uuid,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  'Logic',
  'Logic — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'afeb51b3-8df5-56a6-b789-15b7521a9b10'::uuid,
  '886c83f7-3f4b-5bc5-92d1-66d154ee9104'::uuid,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  'Operating Systems',
  'Operating Systems — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'bd0f8c96-e14f-5669-82e0-d53f68e591a0'::uuid,
  '251c4ff5-04cf-5bee-9525-4547958701d5'::uuid,
  (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Computer Science' LIMIT 1),
  'Computer Basics',
  'Computer Basics — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;

-- Economics
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'a67d2ad2-2072-5597-84e8-300690f50a77'::uuid,
  '0b0a6e36-4a24-5484-bcd1-0639abb96157'::uuid,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1),
  'Macroeconomics',
  'Macroeconomics — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '03e341e9-6856-5461-8f8a-4c87fea0851e'::uuid,
  '6f6371d8-9407-534b-9841-8f928cf0903f'::uuid,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1),
  'Basic Concepts',
  'Basic Concepts — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '21ded4a5-23c4-57a1-b18c-7d9b834e17b6'::uuid,
  'c161a362-e963-5114-a82c-39cbfbccdf1f'::uuid,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1),
  'Microeconomics',
  'Microeconomics — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '374bbf6d-7843-50f5-aa1e-9c22869fc2d4'::uuid,
  '152d23d4-d461-5798-be0a-289a2af2a7a0'::uuid,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1),
  'International Trade',
  'International Trade — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'dc410b22-9d4e-50d2-9d0c-c2f7c8c67c23'::uuid,
  '91ba0bc1-14c4-5e94-97da-dd65fc460a5f'::uuid,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1),
  'Production Theory',
  'Production Theory — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'fa9d8823-6d53-5a38-a53e-863569f9c3e8'::uuid,
  '7116026b-63a6-572d-9196-212366c74c55'::uuid,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1),
  'Money and Banking',
  'Money and Banking — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '545b6cbd-18cb-5e91-b3ee-9cdf7aa9997a'::uuid,
  '2c651bc4-ebec-5fec-848e-c800fb73375d'::uuid,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1),
  'Supply and Demand',
  'Supply and Demand — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'bb20f950-c7df-5e77-a73b-cecc2be970ed'::uuid,
  '1041cad3-144b-580d-87be-4e0e21731ac8'::uuid,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1),
  'Public Finance',
  'Public Finance — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '3ed16b6c-1338-56bf-b874-66a7442fc3dd'::uuid,
  '9e7c0ace-5da9-5dfc-b80a-59e5fcc6ed08'::uuid,
  (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Economics' LIMIT 1),
  'Economic Systems',
  'Economic Systems — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;

-- English Language
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '79d03046-931b-54f9-a35e-093b02dda759'::uuid,
  '47f9508c-7381-5605-a67a-663d71eb66e2'::uuid,
  (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'English Language' LIMIT 1),
  'Grammar',
  'Grammar — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'f5cee718-b143-51fa-affe-ee136d628f47'::uuid,
  '899cfa59-ab62-5883-830e-d9d9b42ba5b2'::uuid,
  (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'English Language' LIMIT 1),
  'Vocabulary',
  'Vocabulary — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'aebcc248-e21b-5819-9595-22bcbc6acab1'::uuid,
  'd3f33b80-f24c-5f68-9f95-6cacd03228cf'::uuid,
  (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'English Language' LIMIT 1),
  'Figures of Speech',
  'Figures of Speech — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '45a24166-6b23-5669-bf80-fc7e25fd20d3'::uuid,
  '8057f9f1-0695-527e-9eb3-77f19a4d84dd'::uuid,
  (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'English Language' LIMIT 1),
  'Parts of Speech',
  'Parts of Speech — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'ee5151a6-27e4-5916-a326-254a551a8297'::uuid,
  'a96fa428-1415-558e-9b55-92a707b45b49'::uuid,
  (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'English Language' LIMIT 1),
  'Literary Analysis',
  'Literary Analysis — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '1b0adf3f-23a6-5a78-8bed-1868e3dc269b'::uuid,
  '93155430-0807-5852-8296-cb4b071a55b8'::uuid,
  (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'English Language' LIMIT 1),
  'Sentence Structure',
  'Sentence Structure — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '912eb60b-272a-54bc-a005-2203f52b3a9b'::uuid,
  'ea1846ea-7df5-54de-9a55-55f93b7b80a2'::uuid,
  (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'English Language' LIMIT 1),
  'Comprehension',
  'Comprehension — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;

-- Mathematics
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '2d95a774-bd6a-57c3-b1e1-99fddf142081'::uuid,
  '22ab3401-498b-5d27-950d-5399abb354dd'::uuid,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  'Algebra',
  'Algebra — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'f1de6b68-347a-5f16-b712-efa75a1575bf'::uuid,
  'a25572a1-1cb8-5807-8127-c5733145af31'::uuid,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  'Geometry',
  'Geometry — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '8bb9a6e9-1454-51b1-bb83-f4fcd692cb45'::uuid,
  'a81219d4-1780-57d9-8b01-7e2e7290edf8'::uuid,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  'Coordinate Geometry',
  'Coordinate Geometry — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'e06b5309-2c2e-562f-ae47-acf6b61998fd'::uuid,
  'c37b12b4-4ccf-555a-b5f4-d94da151d669'::uuid,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  'Mensuration',
  'Mensuration — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '2fdec0a9-0cc6-58b9-834e-2970a7291440'::uuid,
  '1b9bd30c-ce7b-5914-b1e7-5fdda1086524'::uuid,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  'Percentages',
  'Percentages — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '0e571903-cb21-5f0e-b8f1-4f7b2bb1cf1d'::uuid,
  '9919d707-5bdb-5c9e-a5dd-ceecc6ae6c16'::uuid,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  'Quadratic Equations',
  'Quadratic Equations — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'ec5dc194-def5-5685-910f-f57cbd075152'::uuid,
  '293fcc4e-20f6-55ce-8a5f-9c426ff5fb4b'::uuid,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  'Trigonometry',
  'Trigonometry — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '9858fc0a-f71e-57f6-b836-1d803425ecd5'::uuid,
  'e7bc261a-ca1e-56f6-aa50-f16ee1fa23e8'::uuid,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  'Logarithms',
  'Logarithms — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '9d55d61b-963d-587e-bd4a-c7a43c5897dd'::uuid,
  '188d2d12-7160-5873-a913-34f42931c3c4'::uuid,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  'Permutation and Combination',
  'Permutation and Combination — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '32882e75-ccae-5a28-9aac-52f87fe215f2'::uuid,
  '35700058-eb06-52ff-bddd-71d3ddf5e724'::uuid,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  'Number Theory',
  'Number Theory — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '08ea0cbd-2a03-5d0e-a2ed-4df49697e9dc'::uuid,
  'a0922030-1c50-5047-90b4-d0373a168777'::uuid,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  'Statistics',
  'Statistics — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '2e161b30-25cd-5e30-80cf-ea644421d878'::uuid,
  '8b886c02-5662-5330-bc1a-d31662060fbb'::uuid,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  'Functions',
  'Functions — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '21910389-bc1d-5917-b46e-6ce6f0eaf71c'::uuid,
  'c23eb8e6-789f-5ca6-8750-1e437bfddb0b'::uuid,
  (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Mathematics' LIMIT 1),
  'Calculus',
  'Calculus — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;

-- Physics
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'b52f1682-a202-5fc7-a256-eb73ba31e34a'::uuid,
  '6eb3b1cf-ffde-50e4-97fb-d0c269b145f2'::uuid,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1),
  'Electricity',
  'Electricity — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'edfcf371-9c94-53da-b230-e79396703460'::uuid,
  'd42317f7-1199-511e-9031-f5b0343137d5'::uuid,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1),
  'Mechanics',
  'Mechanics — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '9f3dfe4d-3776-515c-9ad4-bf4a2c7af1bf'::uuid,
  'cbf62719-c067-51f4-b935-62ecc199263c'::uuid,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1),
  'Optics',
  'Optics — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '51e2609f-d62a-5cb2-b4c5-d48d039f5ae0'::uuid,
  '079cc9ee-faa9-5032-8a79-043ea3dbfeb4'::uuid,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1),
  'Motion',
  'Motion — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'ffdbacee-f095-5a3c-97a2-60dbf9f05b0a'::uuid,
  '558e39b4-1289-57f9-ac49-0d1e517a9cb1'::uuid,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1),
  'Waves',
  'Waves — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'b6dc4073-fe77-566f-ba27-be7ba63f7099'::uuid,
  '69a8d8b1-5d78-5962-9dee-a835606c21e9'::uuid,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1),
  'Electromagnetism',
  'Electromagnetism — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '4734b803-6876-5d36-85e6-25c6b188ce66'::uuid,
  'e55620a8-0bc8-5698-8953-886601a6c667'::uuid,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1),
  'Energy',
  'Energy — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'a85df9ef-62b6-5cae-82fb-4d17e944d9db'::uuid,
  'f90875f2-386f-5123-ae7c-d1c7e8f84353'::uuid,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1),
  'Nuclear Physics',
  'Nuclear Physics — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  '65bf36d8-bfe2-56eb-afc6-4475467b355a'::uuid,
  '783d61c2-e51e-55bb-8b38-16d9805c6f3b'::uuid,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1),
  'Pressure',
  'Pressure — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;
INSERT INTO subtopics (id, topic_id, subject_id, exam_board_id, name, description, order_index, created_at)
VALUES (
  'd2677d0c-006d-51dd-888d-8297dabb47a0'::uuid,
  'ddfad4c9-40d3-5e5b-b842-36755d7caf6e'::uuid,
  (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1),
  (SELECT exam_board_id FROM subjects WHERE name = 'Physics' LIMIT 1),
  'Modern Physics',
  'Modern Physics — Practice & Revision',
  1, NOW()
) ON CONFLICT (id) DO NOTHING;

-- STEP 3: Link questions.subtopic_id to matching subtopic
UPDATE questions SET subtopic_id = '653e93f9-53d4-56fc-b4ff-ce357bd7eec1'::uuid
  WHERE topic = 'Cell Biology'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'de580a68-c5d4-507d-adf4-a47d66a4a1f9'::uuid
  WHERE topic = 'Human Biology'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '323b6951-35a7-5606-8bba-fe6512a7af7f'::uuid
  WHERE topic = 'Ecology'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '5965f4d6-a099-56d6-bd9b-914517371bed'::uuid
  WHERE topic = 'Genetics'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'df6e2c3a-906a-5d26-bb18-659e8b0cddcf'::uuid
  WHERE topic = 'Cell Division'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '11420023-d3a5-57be-a173-1ca635be9799'::uuid
  WHERE topic = 'Excretion'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '86b55307-a231-5b9b-a700-c142d69f4821'::uuid
  WHERE topic = 'Photosynthesis'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '5cba798d-756c-5a49-81e9-aa60880e6de0'::uuid
  WHERE topic = 'Digestion'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '2fa7f616-9fc3-58e1-a3b7-8bc43b022108'::uuid
  WHERE topic = 'Respiration'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '9643710a-cb94-5852-9349-8233ec16ad3d'::uuid
  WHERE topic = 'Plant Biology'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Biology' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '2eeb4993-aa4f-5d11-ae7f-88ee1306891c'::uuid
  WHERE topic = 'Accounting'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'd3597182-14c4-56f7-91b3-84b1d493fd83'::uuid
  WHERE topic = 'Business Structures'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '46a1a2ce-b512-5e95-aece-d0caf3d8332b'::uuid
  WHERE topic = 'Management'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '525879c1-c29e-5f4f-bcbe-c9dedd65f92c'::uuid
  WHERE topic = 'Business Strategy'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '247f5234-a35f-5796-9f65-3d38a10d33d0'::uuid
  WHERE topic = 'Entrepreneurship'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'a5e53996-c3f9-515a-ae5b-77e082e279e1'::uuid
  WHERE topic = 'Finance'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'b7d8ccf4-95ae-589d-8372-21030f0199dd'::uuid
  WHERE topic = 'Marketing'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '557247e8-7539-55be-b2ff-51f378ce89b5'::uuid
  WHERE topic = 'Business Basics'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'f0fa8b2a-5bb6-5d84-bbc8-00b05f9624a6'::uuid
  WHERE topic = 'Production'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Business Studies' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'b14ad343-42b5-58be-acef-44c027788cf3'::uuid
  WHERE topic = 'Chemical Reactions'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '773978cb-4953-5489-adb2-5ff73c34b821'::uuid
  WHERE topic = 'Basic Chemistry'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '6f324737-e5c1-564b-94f8-402599f63ca9'::uuid
  WHERE topic = 'Atomic Structure'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'b67b8a2f-e4b3-5043-9dd4-c75c31340527'::uuid
  WHERE topic = 'Chemical Bonding'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '6d203aac-9223-5a9c-8ac1-42dfd0938f73'::uuid
  WHERE topic = 'Mole Concept'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '203b866c-7089-5250-8d06-2b06378cff56'::uuid
  WHERE topic = 'Periodic Table'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '20d5646b-040d-5e93-94bd-824a3f3f2237'::uuid
  WHERE topic = 'Concentration'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'ec3a318d-984b-5891-ba62-ffc5c9bd3602'::uuid
  WHERE topic = 'Equilibrium'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'fa1d4a07-cc60-5658-afc9-53693b2b184c'::uuid
  WHERE topic = 'Acids and Bases'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '83a5b730-5129-5fff-b9ab-fcde76bff42e'::uuid
  WHERE topic = 'Redox Reactions'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '84c62519-71a4-5ecf-a9ee-6a5b59e42aa3'::uuid
  WHERE topic = 'Chemical Equations'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'badd359b-4cf8-5a8a-adfd-872cd87f5148'::uuid
  WHERE topic = 'Electrolysis'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '6578879b-e1a3-5354-8f36-008a558bc208'::uuid
  WHERE topic = 'Industrial Chemistry'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '3583ed38-d0e0-507d-bb50-c16379b399ff'::uuid
  WHERE topic = 'Separation Techniques'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Chemistry' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '865e21a9-a3fd-5314-907c-8cd15fd0f56b'::uuid
  WHERE topic = 'Programming'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '5a4b2331-2e5d-55ca-aa1f-20ac76b767a9'::uuid
  WHERE topic = 'Algorithms'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'f3b639e5-ea7d-5229-9182-708e387f0afa'::uuid
  WHERE topic = 'Computer Hardware'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'a886050d-bbc4-5fa5-93b8-2df38d1dd8ec'::uuid
  WHERE topic = 'Number Systems'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'c147d17b-1f0c-5c6c-833e-36f13f54b5d8'::uuid
  WHERE topic = 'Networks'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '8f00de4b-9deb-58cb-aabf-72043f28b103'::uuid
  WHERE topic = 'Web Technology'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '70618ee6-07bd-546b-99ca-727de9827e34'::uuid
  WHERE topic = 'Databases'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '11298dc2-0595-5191-a531-089e3c61c1ae'::uuid
  WHERE topic = 'Logic'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'afeb51b3-8df5-56a6-b789-15b7521a9b10'::uuid
  WHERE topic = 'Operating Systems'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'bd0f8c96-e14f-5669-82e0-d53f68e591a0'::uuid
  WHERE topic = 'Computer Basics'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Computer Science' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'a67d2ad2-2072-5597-84e8-300690f50a77'::uuid
  WHERE topic = 'Macroeconomics'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '03e341e9-6856-5461-8f8a-4c87fea0851e'::uuid
  WHERE topic = 'Basic Concepts'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '21ded4a5-23c4-57a1-b18c-7d9b834e17b6'::uuid
  WHERE topic = 'Microeconomics'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '374bbf6d-7843-50f5-aa1e-9c22869fc2d4'::uuid
  WHERE topic = 'International Trade'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'dc410b22-9d4e-50d2-9d0c-c2f7c8c67c23'::uuid
  WHERE topic = 'Production Theory'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'fa9d8823-6d53-5a38-a53e-863569f9c3e8'::uuid
  WHERE topic = 'Money and Banking'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '545b6cbd-18cb-5e91-b3ee-9cdf7aa9997a'::uuid
  WHERE topic = 'Supply and Demand'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'bb20f950-c7df-5e77-a73b-cecc2be970ed'::uuid
  WHERE topic = 'Public Finance'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '3ed16b6c-1338-56bf-b874-66a7442fc3dd'::uuid
  WHERE topic = 'Economic Systems'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Economics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '79d03046-931b-54f9-a35e-093b02dda759'::uuid
  WHERE topic = 'Grammar'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'f5cee718-b143-51fa-affe-ee136d628f47'::uuid
  WHERE topic = 'Vocabulary'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'aebcc248-e21b-5819-9595-22bcbc6acab1'::uuid
  WHERE topic = 'Figures of Speech'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '45a24166-6b23-5669-bf80-fc7e25fd20d3'::uuid
  WHERE topic = 'Parts of Speech'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'ee5151a6-27e4-5916-a326-254a551a8297'::uuid
  WHERE topic = 'Literary Analysis'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '1b0adf3f-23a6-5a78-8bed-1868e3dc269b'::uuid
  WHERE topic = 'Sentence Structure'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '912eb60b-272a-54bc-a005-2203f52b3a9b'::uuid
  WHERE topic = 'Comprehension'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'English Language' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '2d95a774-bd6a-57c3-b1e1-99fddf142081'::uuid
  WHERE topic = 'Algebra'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'f1de6b68-347a-5f16-b712-efa75a1575bf'::uuid
  WHERE topic = 'Geometry'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '8bb9a6e9-1454-51b1-bb83-f4fcd692cb45'::uuid
  WHERE topic = 'Coordinate Geometry'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'e06b5309-2c2e-562f-ae47-acf6b61998fd'::uuid
  WHERE topic = 'Mensuration'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '2fdec0a9-0cc6-58b9-834e-2970a7291440'::uuid
  WHERE topic = 'Percentages'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '0e571903-cb21-5f0e-b8f1-4f7b2bb1cf1d'::uuid
  WHERE topic = 'Quadratic Equations'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'ec5dc194-def5-5685-910f-f57cbd075152'::uuid
  WHERE topic = 'Trigonometry'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '9858fc0a-f71e-57f6-b836-1d803425ecd5'::uuid
  WHERE topic = 'Logarithms'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '9d55d61b-963d-587e-bd4a-c7a43c5897dd'::uuid
  WHERE topic = 'Permutation and Combination'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '32882e75-ccae-5a28-9aac-52f87fe215f2'::uuid
  WHERE topic = 'Number Theory'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '08ea0cbd-2a03-5d0e-a2ed-4df49697e9dc'::uuid
  WHERE topic = 'Statistics'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '2e161b30-25cd-5e30-80cf-ea644421d878'::uuid
  WHERE topic = 'Functions'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '21910389-bc1d-5917-b46e-6ce6f0eaf71c'::uuid
  WHERE topic = 'Calculus'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Mathematics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'b52f1682-a202-5fc7-a256-eb73ba31e34a'::uuid
  WHERE topic = 'Electricity'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'edfcf371-9c94-53da-b230-e79396703460'::uuid
  WHERE topic = 'Mechanics'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '9f3dfe4d-3776-515c-9ad4-bf4a2c7af1bf'::uuid
  WHERE topic = 'Optics'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '51e2609f-d62a-5cb2-b4c5-d48d039f5ae0'::uuid
  WHERE topic = 'Motion'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'ffdbacee-f095-5a3c-97a2-60dbf9f05b0a'::uuid
  WHERE topic = 'Waves'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'b6dc4073-fe77-566f-ba27-be7ba63f7099'::uuid
  WHERE topic = 'Electromagnetism'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '4734b803-6876-5d36-85e6-25c6b188ce66'::uuid
  WHERE topic = 'Energy'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'a85df9ef-62b6-5cae-82fb-4d17e944d9db'::uuid
  WHERE topic = 'Nuclear Physics'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = '65bf36d8-bfe2-56eb-afc6-4475467b355a'::uuid
  WHERE topic = 'Pressure'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1)
  AND subtopic_id IS NULL;
UPDATE questions SET subtopic_id = 'd2677d0c-006d-51dd-888d-8297dabb47a0'::uuid
  WHERE topic = 'Modern Physics'
  AND subject_id_uuid = (SELECT id FROM subjects WHERE name = 'Physics' LIMIT 1)
  AND subtopic_id IS NULL;

-- STEP 4: Verify
SELECT 'topics'          AS tbl, COUNT(*) AS rows FROM topics
UNION ALL SELECT 'subtopics',    COUNT(*) FROM subtopics
UNION ALL SELECT 'q_linked',     COUNT(*) FROM questions WHERE subtopic_id IS NOT NULL;

COMMIT;