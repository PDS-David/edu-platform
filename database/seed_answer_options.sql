-- ============================================================
-- EAC LEARNING PLATFORM — ANSWER OPTIONS SEED
-- 4 options per question (A, B, C, D), 1 correct per question
-- Linked via question_text match to avoid UUID hardcoding
-- ============================================================

BEGIN;

-- Helper: insert 4 options for a question matched by text + subject code
-- Format: (question_text, subject_code, optionA, optionB, optionC, optionD, correct_index)
-- correct_index: 1=A, 2=B, 3=C, 4=D

-- ============================================================
-- JAMB MATHEMATICS
-- ============================================================
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index)
SELECT gen_random_uuid(), q.id, o.option_text, o.is_correct, o.order_index
FROM questions q
JOIN subjects s ON s.id = q.subject_id_uuid
JOIN (VALUES
  ('If 2x + 3 = 11, what is the value of x?', 'MATH-101', 'x = 2', false, 1),
  ('If 2x + 3 = 11, what is the value of x?', 'MATH-101', 'x = 4', true,  2),
  ('If 2x + 3 = 11, what is the value of x?', 'MATH-101', 'x = 6', false, 3),
  ('If 2x + 3 = 11, what is the value of x?', 'MATH-101', 'x = 8', false, 4),

  ('What is the value of log10(1000)?', 'MATH-101', '2', false, 1),
  ('What is the value of log10(1000)?', 'MATH-101', '3', true,  2),
  ('What is the value of log10(1000)?', 'MATH-101', '4', false, 3),
  ('What is the value of log10(1000)?', 'MATH-101', '10', false, 4),

  ('A circle has radius 7cm. What is its area? (pi = 22/7)', 'MATH-101', '144 cm2', false, 1),
  ('A circle has radius 7cm. What is its area? (pi = 22/7)', 'MATH-101', '154 cm2', true,  2),
  ('A circle has radius 7cm. What is its area? (pi = 22/7)', 'MATH-101', '164 cm2', false, 3),
  ('A circle has radius 7cm. What is its area? (pi = 22/7)', 'MATH-101', '174 cm2', false, 4),

  ('Solve for x: x2 - 5x + 6 = 0', 'MATH-101', 'x = 1 or x = 6', false, 1),
  ('Solve for x: x2 - 5x + 6 = 0', 'MATH-101', 'x = 2 or x = 3', true,  2),
  ('Solve for x: x2 - 5x + 6 = 0', 'MATH-101', 'x = -2 or x = -3', false, 3),
  ('Solve for x: x2 - 5x + 6 = 0', 'MATH-101', 'x = 4 or x = 2', false, 4),

  ('If sin theta = 3/5, find cos theta', 'MATH-101', '3/4', false, 1),
  ('If sin theta = 3/5, find cos theta', 'MATH-101', '4/5', true,  2),
  ('If sin theta = 3/5, find cos theta', 'MATH-101', '5/4', false, 3),
  ('If sin theta = 3/5, find cos theta', 'MATH-101', '5/3', false, 4)
) AS o(question_text, subject_code, option_text, is_correct, order_index)
ON q.question_text = o.question_text AND s.code = o.subject_code;

-- ============================================================
-- JAMB PHYSICS
-- ============================================================
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index)
SELECT gen_random_uuid(), q.id, o.option_text, o.is_correct, o.order_index
FROM questions q
JOIN subjects s ON s.id = q.subject_id_uuid
JOIN (VALUES
  ('What is the SI unit of force?', 'PHY-101', 'Watt', false, 1),
  ('What is the SI unit of force?', 'PHY-101', 'Newton', true,  2),
  ('What is the SI unit of force?', 'PHY-101', 'Joule', false, 3),
  ('What is the SI unit of force?', 'PHY-101', 'Pascal', false, 4),

  ('A body moves with velocity 20 m/s for 5 seconds. What distance does it cover?', 'PHY-101', '25 m', false, 1),
  ('A body moves with velocity 20 m/s for 5 seconds. What distance does it cover?', 'PHY-101', '100 m', true,  2),
  ('A body moves with velocity 20 m/s for 5 seconds. What distance does it cover?', 'PHY-101', '200 m', false, 3),
  ('A body moves with velocity 20 m/s for 5 seconds. What distance does it cover?', 'PHY-101', '4 m', false, 4),

  ('What type of wave is sound?', 'PHY-101', 'Transverse wave', false, 1),
  ('What type of wave is sound?', 'PHY-101', 'Longitudinal wave', true,  2),
  ('What type of wave is sound?', 'PHY-101', 'Electromagnetic wave', false, 3),
  ('What type of wave is sound?', 'PHY-101', 'Surface wave', false, 4),

  ('Calculate the kinetic energy of a 2kg object moving at 10 m/s', 'PHY-101', '20 J', false, 1),
  ('Calculate the kinetic energy of a 2kg object moving at 10 m/s', 'PHY-101', '100 J', true,  2),
  ('Calculate the kinetic energy of a 2kg object moving at 10 m/s', 'PHY-101', '200 J', false, 3),
  ('Calculate the kinetic energy of a 2kg object moving at 10 m/s', 'PHY-101', '50 J', false, 4),

  ('What is the refractive index of a medium if light travels at 2x10^8 m/s in it?', 'PHY-101', '1.0', false, 1),
  ('What is the refractive index of a medium if light travels at 2x10^8 m/s in it?', 'PHY-101', '1.5', true,  2),
  ('What is the refractive index of a medium if light travels at 2x10^8 m/s in it?', 'PHY-101', '2.0', false, 3),
  ('What is the refractive index of a medium if light travels at 2x10^8 m/s in it?', 'PHY-101', '2.5', false, 4)
) AS o(question_text, subject_code, option_text, is_correct, order_index)
ON q.question_text = o.question_text AND s.code = o.subject_code;

-- ============================================================
-- JAMB CHEMISTRY
-- ============================================================
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index)
SELECT gen_random_uuid(), q.id, o.option_text, o.is_correct, o.order_index
FROM questions q
JOIN subjects s ON s.id = q.subject_id_uuid
JOIN (VALUES
  ('What is the atomic number of Carbon?', 'CHEM-101', '4', false, 1),
  ('What is the atomic number of Carbon?', 'CHEM-101', '6', true,  2),
  ('What is the atomic number of Carbon?', 'CHEM-101', '8', false, 3),
  ('What is the atomic number of Carbon?', 'CHEM-101', '12', false, 4),

  ('Which gas is produced when zinc reacts with dilute HCl?', 'CHEM-101', 'Oxygen', false, 1),
  ('Which gas is produced when zinc reacts with dilute HCl?', 'CHEM-101', 'Hydrogen', true,  2),
  ('Which gas is produced when zinc reacts with dilute HCl?', 'CHEM-101', 'Chlorine', false, 3),
  ('Which gas is produced when zinc reacts with dilute HCl?', 'CHEM-101', 'Carbon dioxide', false, 4),

  ('What is the pH of a neutral solution at 25 degrees C?', 'CHEM-101', '0', false, 1),
  ('What is the pH of a neutral solution at 25 degrees C?', 'CHEM-101', '7', true,  2),
  ('What is the pH of a neutral solution at 25 degrees C?', 'CHEM-101', '10', false, 3),
  ('What is the pH of a neutral solution at 25 degrees C?', 'CHEM-101', '14', false, 4),

  ('Balance this equation: Fe + O2 -> Fe2O3', 'CHEM-101', '2Fe + O2 -> Fe2O3', false, 1),
  ('Balance this equation: Fe + O2 -> Fe2O3', 'CHEM-101', '4Fe + 3O2 -> 2Fe2O3', true,  2),
  ('Balance this equation: Fe + O2 -> Fe2O3', 'CHEM-101', '3Fe + 2O2 -> Fe2O3', false, 3),
  ('Balance this equation: Fe + O2 -> Fe2O3', 'CHEM-101', 'Fe + 3O2 -> 2Fe2O3', false, 4),

  ('Calculate the molar mass of H2SO4', 'CHEM-101', '49 g/mol', false, 1),
  ('Calculate the molar mass of H2SO4', 'CHEM-101', '98 g/mol', true,  2),
  ('Calculate the molar mass of H2SO4', 'CHEM-101', '64 g/mol', false, 3),
  ('Calculate the molar mass of H2SO4', 'CHEM-101', '80 g/mol', false, 4)
) AS o(question_text, subject_code, option_text, is_correct, order_index)
ON q.question_text = o.question_text AND s.code = o.subject_code;

-- ============================================================
-- JAMB BIOLOGY
-- ============================================================
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index)
SELECT gen_random_uuid(), q.id, o.option_text, o.is_correct, o.order_index
FROM questions q
JOIN subjects s ON s.id = q.subject_id_uuid
JOIN (VALUES
  ('What is the powerhouse of the cell?', 'BIO-101', 'Nucleus', false, 1),
  ('What is the powerhouse of the cell?', 'BIO-101', 'Mitochondria', true,  2),
  ('What is the powerhouse of the cell?', 'BIO-101', 'Ribosome', false, 3),
  ('What is the powerhouse of the cell?', 'BIO-101', 'Golgi apparatus', false, 4),

  ('Which blood group is the universal donor?', 'BIO-101', 'A', false, 1),
  ('Which blood group is the universal donor?', 'BIO-101', 'O', true,  2),
  ('Which blood group is the universal donor?', 'BIO-101', 'B', false, 3),
  ('Which blood group is the universal donor?', 'BIO-101', 'AB', false, 4),

  ('What is the process by which plants make food?', 'BIO-101', 'Respiration', false, 1),
  ('What is the process by which plants make food?', 'BIO-101', 'Photosynthesis', true,  2),
  ('What is the process by which plants make food?', 'BIO-101', 'Digestion', false, 3),
  ('What is the process by which plants make food?', 'BIO-101', 'Transpiration', false, 4),

  ('How many chambers does the human heart have?', 'BIO-101', 'Two', false, 1),
  ('How many chambers does the human heart have?', 'BIO-101', 'Four', true,  2),
  ('How many chambers does the human heart have?', 'BIO-101', 'Three', false, 3),
  ('How many chambers does the human heart have?', 'BIO-101', 'Six', false, 4),

  ('What is the role of ribosomes in a cell?', 'BIO-101', 'Energy production', false, 1),
  ('What is the role of ribosomes in a cell?', 'BIO-101', 'Protein synthesis', true,  2),
  ('What is the role of ribosomes in a cell?', 'BIO-101', 'DNA replication', false, 3),
  ('What is the role of ribosomes in a cell?', 'BIO-101', 'Cell division', false, 4)
) AS o(question_text, subject_code, option_text, is_correct, order_index)
ON q.question_text = o.question_text AND s.code = o.subject_code;

-- ============================================================
-- JAMB ENGLISH LANGUAGE
-- ============================================================
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index)
SELECT gen_random_uuid(), q.id, o.option_text, o.is_correct, o.order_index
FROM questions q
JOIN subjects s ON s.id = q.subject_id_uuid
JOIN (VALUES
  ('Choose the word closest in meaning to "benevolent"', 'ENG-101', 'Cruel', false, 1),
  ('Choose the word closest in meaning to "benevolent"', 'ENG-101', 'Kind', true,  2),
  ('Choose the word closest in meaning to "benevolent"', 'ENG-101', 'Angry', false, 3),
  ('Choose the word closest in meaning to "benevolent"', 'ENG-101', 'Lazy', false, 4),

  ('Identify the figure of speech: "The wind whispered through the trees"', 'ENG-101', 'Simile', false, 1),
  ('Identify the figure of speech: "The wind whispered through the trees"', 'ENG-101', 'Personification', true,  2),
  ('Identify the figure of speech: "The wind whispered through the trees"', 'ENG-101', 'Metaphor', false, 3),
  ('Identify the figure of speech: "The wind whispered through the trees"', 'ENG-101', 'Hyperbole', false, 4),

  ('Which of these sentences is grammatically correct?', 'ENG-101', 'She go to school everyday', false, 1),
  ('Which of these sentences is grammatically correct?', 'ENG-101', 'She goes to school every day', true,  2),
  ('Which of these sentences is grammatically correct?', 'ENG-101', 'She going to school everyday', false, 3),
  ('Which of these sentences is grammatically correct?', 'ENG-101', 'She gone to school every day', false, 4),

  ('What is the plural of "phenomenon"?', 'ENG-101', 'Phenomenons', false, 1),
  ('What is the plural of "phenomenon"?', 'ENG-101', 'Phenomena', true,  2),
  ('What is the plural of "phenomenon"?', 'ENG-101', 'Phenomenas', false, 3),
  ('What is the plural of "phenomenon"?', 'ENG-101', 'Phenomenen', false, 4),

  ('Choose the word that best completes: "She was _____ by the complexity of the problem"', 'ENG-101', 'enlightened', false, 1),
  ('Choose the word that best completes: "She was _____ by the complexity of the problem"', 'ENG-101', 'baffled', true,  2),
  ('Choose the word that best completes: "She was _____ by the complexity of the problem"', 'ENG-101', 'amused', false, 3),
  ('Choose the word that best completes: "She was _____ by the complexity of the problem"', 'ENG-101', 'excited', false, 4)
) AS o(question_text, subject_code, option_text, is_correct, order_index)
ON q.question_text = o.question_text AND s.code = o.subject_code;

-- ============================================================
-- JAMB ECONOMICS
-- ============================================================
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index)
SELECT gen_random_uuid(), q.id, o.option_text, o.is_correct, o.order_index
FROM questions q
JOIN subjects s ON s.id = q.subject_id_uuid
JOIN (VALUES
  ('What does GDP stand for?', 'ECON-101', 'Gross Domestic Product', true,  1),
  ('What does GDP stand for?', 'ECON-101', 'General Demand Price', false, 2),
  ('What does GDP stand for?', 'ECON-101', 'Gross Development Plan', false, 3),
  ('What does GDP stand for?', 'ECON-101', 'Government Debt Policy', false, 4),

  ('Which of the following is an example of a public good?', 'ECON-101', 'A private car', false, 1),
  ('Which of the following is an example of a public good?', 'ECON-101', 'Street lighting', true,  2),
  ('Which of the following is an example of a public good?', 'ECON-101', 'A restaurant meal', false, 3),
  ('Which of the following is an example of a public good?', 'ECON-101', 'A cinema ticket', false, 4),

  ('When supply increases and demand remains constant, price will?', 'ECON-101', 'Increase', false, 1),
  ('When supply increases and demand remains constant, price will?', 'ECON-101', 'Decrease', true,  2),
  ('When supply increases and demand remains constant, price will?', 'ECON-101', 'Remain constant', false, 3),
  ('When supply increases and demand remains constant, price will?', 'ECON-101', 'Double', false, 4),

  ('What is opportunity cost?', 'ECON-101', 'The cost of production', false, 1),
  ('What is opportunity cost?', 'ECON-101', 'The value of the next best alternative foregone', true,  2),
  ('What is opportunity cost?', 'ECON-101', 'The price of goods in the market', false, 3),
  ('What is opportunity cost?', 'ECON-101', 'The total cost of all choices made', false, 4),

  ('Explain the concept of price elasticity of demand', 'ECON-101', 'How supply responds to price changes', false, 1),
  ('Explain the concept of price elasticity of demand', 'ECON-101', 'How quantity demanded responds to price changes', true,  2),
  ('Explain the concept of price elasticity of demand', 'ECON-101', 'How price responds to income changes', false, 3),
  ('Explain the concept of price elasticity of demand', 'ECON-101', 'How demand responds to supply changes', false, 4)
) AS o(question_text, subject_code, option_text, is_correct, order_index)
ON q.question_text = o.question_text AND s.code = o.subject_code;

-- ============================================================
-- JAMB COMPUTER SCIENCE
-- ============================================================
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index)
SELECT gen_random_uuid(), q.id, o.option_text, o.is_correct, o.order_index
FROM questions q
JOIN subjects s ON s.id = q.subject_id_uuid
JOIN (VALUES
  ('What does CPU stand for?', 'CS-101', 'Central Processing Unit', true,  1),
  ('What does CPU stand for?', 'CS-101', 'Computer Processing Unit', false, 2),
  ('What does CPU stand for?', 'CS-101', 'Central Program Unit', false, 3),
  ('What does CPU stand for?', 'CS-101', 'Core Processing Utility', false, 4),

  ('Which of these is NOT a programming language?', 'CS-101', 'Python', false, 1),
  ('Which of these is NOT a programming language?', 'CS-101', 'Microsoft Word', true,  2),
  ('Which of these is NOT a programming language?', 'CS-101', 'Java', false, 3),
  ('Which of these is NOT a programming language?', 'CS-101', 'C++', false, 4),

  ('What is the binary equivalent of decimal 10?', 'CS-101', '1010', true,  1),
  ('What is the binary equivalent of decimal 10?', 'CS-101', '1001', false, 2),
  ('What is the binary equivalent of decimal 10?', 'CS-101', '1100', false, 3),
  ('What is the binary equivalent of decimal 10?', 'CS-101', '0110', false, 4),

  ('What does HTML stand for?', 'CS-101', 'Hyper Text Markup Language', true,  1),
  ('What does HTML stand for?', 'CS-101', 'High Text Making Language', false, 2),
  ('What does HTML stand for?', 'CS-101', 'Hyper Transfer Markup Language', false, 3),
  ('What does HTML stand for?', 'CS-101', 'Home Tool Markup Language', false, 4),

  ('What is the time complexity of binary search?', 'CS-101', 'O(n)', false, 1),
  ('What is the time complexity of binary search?', 'CS-101', 'O(log n)', true,  2),
  ('What is the time complexity of binary search?', 'CS-101', 'O(n2)', false, 3),
  ('What is the time complexity of binary search?', 'CS-101', 'O(1)', false, 4)
) AS o(question_text, subject_code, option_text, is_correct, order_index)
ON q.question_text = o.question_text AND s.code = o.subject_code;

-- ============================================================
-- JAMB BUSINESS STUDIES
-- ============================================================
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index)
SELECT gen_random_uuid(), q.id, o.option_text, o.is_correct, o.order_index
FROM questions q
JOIN subjects s ON s.id = q.subject_id_uuid
JOIN (VALUES
  ('What does SWOT stand for in business analysis?', 'BUS-101', 'Strengths, Weaknesses, Opportunities, Threats', true,  1),
  ('What does SWOT stand for in business analysis?', 'BUS-101', 'Sales, Wages, Operations, Taxes', false, 2),
  ('What does SWOT stand for in business analysis?', 'BUS-101', 'Supply, Work, Output, Trade', false, 3),
  ('What does SWOT stand for in business analysis?', 'BUS-101', 'Strategy, Workforce, Options, Targets', false, 4),

  ('What type of business is owned by shareholders?', 'BUS-101', 'Sole trader', false, 1),
  ('What type of business is owned by shareholders?', 'BUS-101', 'Public limited company', true,  2),
  ('What type of business is owned by shareholders?', 'BUS-101', 'Partnership', false, 3),
  ('What type of business is owned by shareholders?', 'BUS-101', 'Cooperative', false, 4),

  ('What is the difference between a sole trader and a partnership?', 'BUS-101', 'A sole trader has more employees', false, 1),
  ('What is the difference between a sole trader and a partnership?', 'BUS-101', 'A sole trader is owned by one person while a partnership has two or more owners', true,  2),
  ('What is the difference between a sole trader and a partnership?', 'BUS-101', 'A partnership pays more taxes', false, 3),
  ('What is the difference between a sole trader and a partnership?', 'BUS-101', 'A sole trader cannot make a profit', false, 4),

  ('What is the purpose of a balance sheet?', 'BUS-101', 'To record daily sales', false, 1),
  ('What is the purpose of a balance sheet?', 'BUS-101', 'To show assets, liabilities and equity at a point in time', true,  2),
  ('What is the purpose of a balance sheet?', 'BUS-101', 'To calculate employee wages', false, 3),
  ('What is the purpose of a balance sheet?', 'BUS-101', 'To track customer orders', false, 4),

  ('Explain the concept of economies of scale', 'BUS-101', 'Costs rise as production increases', false, 1),
  ('Explain the concept of economies of scale', 'BUS-101', 'Cost per unit falls as production increases', true,  2),
  ('Explain the concept of economies of scale', 'BUS-101', 'Revenue increases as costs decrease', false, 3),
  ('Explain the concept of economies of scale', 'BUS-101', 'Profit doubles when output doubles', false, 4)
) AS o(question_text, subject_code, option_text, is_correct, order_index)
ON q.question_text = o.question_text AND s.code = o.subject_code;

-- ============================================================
-- WAEC MATHEMATICS
-- ============================================================
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index)
SELECT gen_random_uuid(), q.id, o.option_text, o.is_correct, o.order_index
FROM questions q
JOIN subjects s ON s.id = q.subject_id_uuid
JOIN (VALUES
  ('Simplify: 3(2x - 4) + 2(x + 5)', 'MATH-101-WAEC', '8x - 2', true,  1),
  ('Simplify: 3(2x - 4) + 2(x + 5)', 'MATH-101-WAEC', '6x + 2', false, 2),
  ('Simplify: 3(2x - 4) + 2(x + 5)', 'MATH-101-WAEC', '8x + 2', false, 3),
  ('Simplify: 3(2x - 4) + 2(x + 5)', 'MATH-101-WAEC', '10x - 2', false, 4),

  ('Find the gradient of the line joining (2,3) and (4,7)', 'MATH-101-WAEC', '1', false, 1),
  ('Find the gradient of the line joining (2,3) and (4,7)', 'MATH-101-WAEC', '2', true,  2),
  ('Find the gradient of the line joining (2,3) and (4,7)', 'MATH-101-WAEC', '3', false, 3),
  ('Find the gradient of the line joining (2,3) and (4,7)', 'MATH-101-WAEC', '4', false, 4),

  ('The sum of angles in a triangle is?', 'MATH-101-WAEC', '90 degrees', false, 1),
  ('The sum of angles in a triangle is?', 'MATH-101-WAEC', '180 degrees', true,  2),
  ('The sum of angles in a triangle is?', 'MATH-101-WAEC', '270 degrees', false, 3),
  ('The sum of angles in a triangle is?', 'MATH-101-WAEC', '360 degrees', false, 4),

  ('Evaluate: 5C2', 'MATH-101-WAEC', '5', false, 1),
  ('Evaluate: 5C2', 'MATH-101-WAEC', '10', true,  2),
  ('Evaluate: 5C2', 'MATH-101-WAEC', '15', false, 3),
  ('Evaluate: 5C2', 'MATH-101-WAEC', '20', false, 4),

  ('Differentiate y = 3x2 + 2x - 5 with respect to x', 'MATH-101-WAEC', '3x + 2', false, 1),
  ('Differentiate y = 3x2 + 2x - 5 with respect to x', 'MATH-101-WAEC', '6x + 2', true,  2),
  ('Differentiate y = 3x2 + 2x - 5 with respect to x', 'MATH-101-WAEC', '6x - 5', false, 3),
  ('Differentiate y = 3x2 + 2x - 5 with respect to x', 'MATH-101-WAEC', '3x2 + 2', false, 4)
) AS o(question_text, subject_code, option_text, is_correct, order_index)
ON q.question_text = o.question_text AND s.code = o.subject_code;

-- ============================================================
-- WAEC PHYSICS
-- ============================================================
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index)
SELECT gen_random_uuid(), q.id, o.option_text, o.is_correct, o.order_index
FROM questions q
JOIN subjects s ON s.id = q.subject_id_uuid
JOIN (VALUES
  ('What is the unit of electrical resistance?', 'PHY-101-WAEC', 'Ampere', false, 1),
  ('What is the unit of electrical resistance?', 'PHY-101-WAEC', 'Ohm', true,  2),
  ('What is the unit of electrical resistance?', 'PHY-101-WAEC', 'Volt', false, 3),
  ('What is the unit of electrical resistance?', 'PHY-101-WAEC', 'Watt', false, 4),

  ('State Newton''s first law of motion', 'PHY-101-WAEC', 'Force equals mass times acceleration', false, 1),
  ('State Newton''s first law of motion', 'PHY-101-WAEC', 'A body remains at rest or in uniform motion unless acted upon by an external force', true,  2),
  ('State Newton''s first law of motion', 'PHY-101-WAEC', 'Every action has an equal and opposite reaction', false, 3),
  ('State Newton''s first law of motion', 'PHY-101-WAEC', 'Energy can neither be created nor destroyed', false, 4),

  ('What is the frequency of a wave with period 0.02s?', 'PHY-101-WAEC', '20 Hz', false, 1),
  ('What is the frequency of a wave with period 0.02s?', 'PHY-101-WAEC', '50 Hz', true,  2),
  ('What is the frequency of a wave with period 0.02s?', 'PHY-101-WAEC', '100 Hz', false, 3),
  ('What is the frequency of a wave with period 0.02s?', 'PHY-101-WAEC', '200 Hz', false, 4),

  ('A transformer has 200 primary turns and 1000 secondary turns. If primary voltage is 50V, find secondary voltage', 'PHY-101-WAEC', '10 V', false, 1),
  ('A transformer has 200 primary turns and 1000 secondary turns. If primary voltage is 50V, find secondary voltage', 'PHY-101-WAEC', '250 V', true,  2),
  ('A transformer has 200 primary turns and 1000 secondary turns. If primary voltage is 50V, find secondary voltage', 'PHY-101-WAEC', '500 V', false, 3),
  ('A transformer has 200 primary turns and 1000 secondary turns. If primary voltage is 50V, find secondary voltage', 'PHY-101-WAEC', '1000 V', false, 4),

  ('Calculate the pressure at the bottom of a 10m deep water column (density = 1000 kg/m3)', 'PHY-101-WAEC', '1000 Pa', false, 1),
  ('Calculate the pressure at the bottom of a 10m deep water column (density = 1000 kg/m3)', 'PHY-101-WAEC', '100000 Pa', true,  2),
  ('Calculate the pressure at the bottom of a 10m deep water column (density = 1000 kg/m3)', 'PHY-101-WAEC', '10000 Pa', false, 3),
  ('Calculate the pressure at the bottom of a 10m deep water column (density = 1000 kg/m3)', 'PHY-101-WAEC', '1000000 Pa', false, 4)
) AS o(question_text, subject_code, option_text, is_correct, order_index)
ON q.question_text = o.question_text AND s.code = o.subject_code;

-- ============================================================
-- WAEC, NECO, O-LEVEL remaining subjects
-- (Biology, Chemistry, English, Economics, CS, Business)
-- Using same pattern — matched by question_text + subject code
-- ============================================================

INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index)
SELECT gen_random_uuid(), q.id, o.option_text, o.is_correct, o.order_index
FROM questions q
JOIN subjects s ON s.id = q.subject_id_uuid
JOIN (VALUES
  -- WAEC CHEMISTRY
  ('What type of bond exists in NaCl?', 'CHEM-101-WAEC', 'Covalent bond', false, 1),
  ('What type of bond exists in NaCl?', 'CHEM-101-WAEC', 'Ionic bond', true,  2),
  ('What type of bond exists in NaCl?', 'CHEM-101-WAEC', 'Metallic bond', false, 3),
  ('What type of bond exists in NaCl?', 'CHEM-101-WAEC', 'Hydrogen bond', false, 4),

  ('What is Avogadro''s number?', 'CHEM-101-WAEC', '6.02 x 10^21', false, 1),
  ('What is Avogadro''s number?', 'CHEM-101-WAEC', '6.02 x 10^23', true,  2),
  ('What is Avogadro''s number?', 'CHEM-101-WAEC', '6.02 x 10^25', false, 3),
  ('What is Avogadro''s number?', 'CHEM-101-WAEC', '6.02 x 10^20', false, 4),

  ('Which of these is an oxidising agent: H2, O2, CO, N2?', 'CHEM-101-WAEC', 'H2', false, 1),
  ('Which of these is an oxidising agent: H2, O2, CO, N2?', 'CHEM-101-WAEC', 'O2', true,  2),
  ('Which of these is an oxidising agent: H2, O2, CO, N2?', 'CHEM-101-WAEC', 'CO', false, 3),
  ('Which of these is an oxidising agent: H2, O2, CO, N2?', 'CHEM-101-WAEC', 'N2', false, 4),

  ('Calculate the concentration of a solution containing 4g of NaOH in 500cm3 of water', 'CHEM-101-WAEC', '0.1 mol/dm3', false, 1),
  ('Calculate the concentration of a solution containing 4g of NaOH in 500cm3 of water', 'CHEM-101-WAEC', '0.2 mol/dm3', true,  2),
  ('Calculate the concentration of a solution containing 4g of NaOH in 500cm3 of water', 'CHEM-101-WAEC', '0.4 mol/dm3', false, 3),
  ('Calculate the concentration of a solution containing 4g of NaOH in 500cm3 of water', 'CHEM-101-WAEC', '0.5 mol/dm3', false, 4),

  ('Describe the process of electrolysis of brine', 'CHEM-101-WAEC', 'Produces oxygen and hydrogen only', false, 1),
  ('Describe the process of electrolysis of brine', 'CHEM-101-WAEC', 'Produces chlorine at anode and hydrogen at cathode with NaOH solution', true,  2),
  ('Describe the process of electrolysis of brine', 'CHEM-101-WAEC', 'Produces sodium and chlorine only', false, 3),
  ('Describe the process of electrolysis of brine', 'CHEM-101-WAEC', 'Produces water and salt', false, 4),

  -- WAEC BIOLOGY
  ('What is osmosis?', 'BIO-101-WAEC', 'Movement of solute from high to low concentration', false, 1),
  ('What is osmosis?', 'BIO-101-WAEC', 'Movement of water through a semi-permeable membrane from low to high solute concentration', true,  2),
  ('What is osmosis?', 'BIO-101-WAEC', 'Movement of water from high to low concentration without a membrane', false, 3),
  ('What is osmosis?', 'BIO-101-WAEC', 'Active transport of ions across a membrane', false, 4),

  ('Name the enzyme that breaks down starch in saliva', 'BIO-101-WAEC', 'Pepsin', false, 1),
  ('Name the enzyme that breaks down starch in saliva', 'BIO-101-WAEC', 'Amylase', true,  2),
  ('Name the enzyme that breaks down starch in saliva', 'BIO-101-WAEC', 'Lipase', false, 3),
  ('Name the enzyme that breaks down starch in saliva', 'BIO-101-WAEC', 'Trypsin', false, 4),

  ('What is the function of the nephron?', 'BIO-101-WAEC', 'To produce blood cells', false, 1),
  ('What is the function of the nephron?', 'BIO-101-WAEC', 'To filter blood and produce urine', true,  2),
  ('What is the function of the nephron?', 'BIO-101-WAEC', 'To digest proteins', false, 3),
  ('What is the function of the nephron?', 'BIO-101-WAEC', 'To transport oxygen', false, 4),

  ('Describe the process of meiosis', 'BIO-101-WAEC', 'Cell division that produces 2 identical daughter cells', false, 1),
  ('Describe the process of meiosis', 'BIO-101-WAEC', 'Cell division that produces 4 genetically unique haploid cells', true,  2),
  ('Describe the process of meiosis', 'BIO-101-WAEC', 'Cell division that doubles chromosome number', false, 3),
  ('Describe the process of meiosis', 'BIO-101-WAEC', 'Cell division that only occurs in bacteria', false, 4),

  ('What is the role of auxins in plant growth?', 'BIO-101-WAEC', 'They inhibit all plant growth', false, 1),
  ('What is the role of auxins in plant growth?', 'BIO-101-WAEC', 'They promote cell elongation and control directional growth', true,  2),
  ('What is the role of auxins in plant growth?', 'BIO-101-WAEC', 'They are responsible for photosynthesis', false, 3),
  ('What is the role of auxins in plant growth?', 'BIO-101-WAEC', 'They transport water from roots to leaves', false, 4),

  -- WAEC ENGLISH
  ('What is a simile?', 'ENG-101-WAEC', 'Giving human qualities to non-human things', false, 1),
  ('What is a simile?', 'ENG-101-WAEC', 'A comparison using "like" or "as"', true,  2),
  ('What is a simile?', 'ENG-101-WAEC', 'An exaggerated statement', false, 3),
  ('What is a simile?', 'ENG-101-WAEC', 'A direct comparison without using like or as', false, 4),

  ('Choose the correct preposition: She is good ___ mathematics', 'ENG-101-WAEC', 'in', false, 1),
  ('Choose the correct preposition: She is good ___ mathematics', 'ENG-101-WAEC', 'at', true,  2),
  ('Choose the correct preposition: She is good ___ mathematics', 'ENG-101-WAEC', 'for', false, 3),
  ('Choose the correct preposition: She is good ___ mathematics', 'ENG-101-WAEC', 'with', false, 4),

  ('What is the passive voice of: "The cat chased the mouse"?', 'ENG-101-WAEC', 'The mouse chased the cat', false, 1),
  ('What is the passive voice of: "The cat chased the mouse"?', 'ENG-101-WAEC', 'The mouse was chased by the cat', true,  2),
  ('What is the passive voice of: "The cat chased the mouse"?', 'ENG-101-WAEC', 'The cat was chasing the mouse', false, 3),
  ('What is the passive voice of: "The cat chased the mouse"?', 'ENG-101-WAEC', 'The mouse has been chased', false, 4),

  ('Identify the clause type: "Although it was raining, we went out"', 'ENG-101-WAEC', 'Relative clause', false, 1),
  ('Identify the clause type: "Although it was raining, we went out"', 'ENG-101-WAEC', 'Adverbial clause of concession', true,  2),
  ('Identify the clause type: "Although it was raining, we went out"', 'ENG-101-WAEC', 'Noun clause', false, 3),
  ('Identify the clause type: "Although it was raining, we went out"', 'ENG-101-WAEC', 'Conditional clause', false, 4),

  ('What is the difference between a phrase and a clause?', 'ENG-101-WAEC', 'A phrase has a verb, a clause does not', false, 1),
  ('What is the difference between a phrase and a clause?', 'ENG-101-WAEC', 'A clause has a subject and verb, a phrase does not', true,  2),
  ('What is the difference between a phrase and a clause?', 'ENG-101-WAEC', 'They are the same thing', false, 3),
  ('What is the difference between a phrase and a clause?', 'ENG-101-WAEC', 'A phrase is longer than a clause', false, 4),

  -- WAEC ECONOMICS
  ('What is inflation?', 'ECON-101-WAEC', 'A decrease in the general price level', false, 1),
  ('What is inflation?', 'ECON-101-WAEC', 'A sustained increase in the general price level', true,  2),
  ('What is inflation?', 'ECON-101-WAEC', 'An increase in government spending', false, 3),
  ('What is inflation?', 'ECON-101-WAEC', 'A fall in unemployment', false, 4),

  ('What is the law of diminishing returns?', 'ECON-101-WAEC', 'Output increases proportionally with each input', false, 1),
  ('What is the law of diminishing returns?', 'ECON-101-WAEC', 'Adding more of one input while others are fixed eventually yields smaller increases in output', true,  2),
  ('What is the law of diminishing returns?', 'ECON-101-WAEC', 'Costs always fall as production increases', false, 3),
  ('What is the law of diminishing returns?', 'ECON-101-WAEC', 'Demand falls when supply increases', false, 4),

  ('Differentiate between microeconomics and macroeconomics', 'ECON-101-WAEC', 'They study the same things at different times', false, 1),
  ('Differentiate between microeconomics and macroeconomics', 'ECON-101-WAEC', 'Microeconomics studies individual units while macroeconomics studies the whole economy', true,  2),
  ('Differentiate between microeconomics and macroeconomics', 'ECON-101-WAEC', 'Macroeconomics is about small businesses', false, 3),
  ('Differentiate between microeconomics and macroeconomics', 'ECON-101-WAEC', 'Microeconomics is about government policy', false, 4),

  ('What are the functions of money?', 'ECON-101-WAEC', 'Only a medium of exchange', false, 1),
  ('What are the functions of money?', 'ECON-101-WAEC', 'Medium of exchange, store of value, unit of account, standard of deferred payment', true,  2),
  ('What are the functions of money?', 'ECON-101-WAEC', 'Only a store of value and unit of account', false, 3),
  ('What are the functions of money?', 'ECON-101-WAEC', 'A tool for taxation only', false, 4),

  ('Explain how the multiplier effect works in an economy', 'ECON-101-WAEC', 'Government spending reduces total output', false, 1),
  ('Explain how the multiplier effect works in an economy', 'ECON-101-WAEC', 'An initial injection of spending leads to a larger overall increase in national income', true,  2),
  ('Explain how the multiplier effect works in an economy', 'ECON-101-WAEC', 'Higher taxes lead to more spending', false, 3),
  ('Explain how the multiplier effect works in an economy', 'ECON-101-WAEC', 'Imports always exceed exports in a growing economy', false, 4),

  -- WAEC COMPUTER SCIENCE
  ('What is RAM used for?', 'CS-101-WAEC', 'Permanent storage of files', false, 1),
  ('What is RAM used for?', 'CS-101-WAEC', 'Temporary storage of data currently being used by the CPU', true,  2),
  ('What is RAM used for?', 'CS-101-WAEC', 'Processing graphics only', false, 3),
  ('What is RAM used for?', 'CS-101-WAEC', 'Storing the operating system permanently', false, 4),

  ('What is the difference between a compiler and an interpreter?', 'CS-101-WAEC', 'They are the same thing', false, 1),
  ('What is the difference between a compiler and an interpreter?', 'CS-101-WAEC', 'A compiler translates all code at once while an interpreter translates line by line', true,  2),
  ('What is the difference between a compiler and an interpreter?', 'CS-101-WAEC', 'An interpreter is faster than a compiler', false, 3),
  ('What is the difference between a compiler and an interpreter?', 'CS-101-WAEC', 'A compiler only works with Python', false, 4),

  ('Convert 255 from decimal to binary', 'CS-101-WAEC', '11111110', false, 1),
  ('Convert 255 from decimal to binary', 'CS-101-WAEC', '11111111', true,  2),
  ('Convert 255 from decimal to binary', 'CS-101-WAEC', '10111111', false, 3),
  ('Convert 255 from decimal to binary', 'CS-101-WAEC', '11110000', false, 4),

  ('What is a primary key in a database?', 'CS-101-WAEC', 'A key used to lock the database', false, 1),
  ('What is a primary key in a database?', 'CS-101-WAEC', 'A unique identifier for each record in a table', true,  2),
  ('What is a primary key in a database?', 'CS-101-WAEC', 'The first column in any table', false, 3),
  ('What is a primary key in a database?', 'CS-101-WAEC', 'A password for database access', false, 4),

  ('Describe how a bubble sort algorithm works', 'CS-101-WAEC', 'It sorts by selecting the minimum element repeatedly', false, 1),
  ('Describe how a bubble sort algorithm works', 'CS-101-WAEC', 'It repeatedly compares adjacent elements and swaps them if out of order', true,  2),
  ('Describe how a bubble sort algorithm works', 'CS-101-WAEC', 'It divides the list in half and sorts each half', false, 3),
  ('Describe how a bubble sort algorithm works', 'CS-101-WAEC', 'It uses a tree structure to sort elements', false, 4),

  -- WAEC BUSINESS STUDIES
  ('What is marketing?', 'BUS-101-WAEC', 'The process of manufacturing products', false, 1),
  ('What is marketing?', 'BUS-101-WAEC', 'The process of identifying, anticipating and satisfying customer needs profitably', true,  2),
  ('What is marketing?', 'BUS-101-WAEC', 'The process of hiring employees', false, 3),
  ('What is marketing?', 'BUS-101-WAEC', 'The process of managing accounts', false, 4),

  ('What are the 4 Ps of marketing?', 'BUS-101-WAEC', 'People, Place, Profit, Plan', false, 1),
  ('What are the 4 Ps of marketing?', 'BUS-101-WAEC', 'Product, Price, Place, Promotion', true,  2),
  ('What are the 4 Ps of marketing?', 'BUS-101-WAEC', 'Product, Profit, People, Process', false, 3),
  ('What are the 4 Ps of marketing?', 'BUS-101-WAEC', 'Price, Plan, Position, Promotion', false, 4),

  ('What is the difference between profit and revenue?', 'BUS-101-WAEC', 'They are the same thing', false, 1),
  ('What is the difference between profit and revenue?', 'BUS-101-WAEC', 'Revenue is total income while profit is income minus costs', true,  2),
  ('What is the difference between profit and revenue?', 'BUS-101-WAEC', 'Profit includes all costs while revenue does not', false, 3),
  ('What is the difference between profit and revenue?', 'BUS-101-WAEC', 'Revenue is always higher than profit by exactly 50%', false, 4),

  ('What is a limited liability company?', 'BUS-101-WAEC', 'A company where owners are personally liable for all debts', false, 1),
  ('What is a limited liability company?', 'BUS-101-WAEC', 'A company where owners liability is limited to their investment', true,  2),
  ('What is a limited liability company?', 'BUS-101-WAEC', 'A company with only one owner', false, 3),
  ('What is a limited liability company?', 'BUS-101-WAEC', 'A non-profit organisation', false, 4),

  ('Explain the role of entrepreneurship in economic development', 'BUS-101-WAEC', 'Entrepreneurs only benefit themselves', false, 1),
  ('Explain the role of entrepreneurship in economic development', 'BUS-101-WAEC', 'Entrepreneurs create jobs, drive innovation and generate wealth for the economy', true,  2),
  ('Explain the role of entrepreneurship in economic development', 'BUS-101-WAEC', 'Entrepreneurship slows economic growth', false, 3),
  ('Explain the role of entrepreneurship in economic development', 'BUS-101-WAEC', 'Entrepreneurs only operate in developed countries', false, 4)
) AS o(question_text, subject_code, option_text, is_correct, order_index)
ON q.question_text = o.question_text AND s.code = o.subject_code;

-- ============================================================
-- NECO ALL SUBJECTS
-- ============================================================
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index)
SELECT gen_random_uuid(), q.id, o.option_text, o.is_correct, o.order_index
FROM questions q
JOIN subjects s ON s.id = q.subject_id_uuid
JOIN (VALUES
  -- NECO MATHEMATICS
  ('What is the LCM of 12 and 18?', 'MATH-101-NECO', '6', false, 1),
  ('What is the LCM of 12 and 18?', 'MATH-101-NECO', '36', true,  2),
  ('What is the LCM of 12 and 18?', 'MATH-101-NECO', '24', false, 3),
  ('What is the LCM of 12 and 18?', 'MATH-101-NECO', '72', false, 4),

  ('Find the area of a rectangle with length 8cm and width 5cm', 'MATH-101-NECO', '26 cm2', false, 1),
  ('Find the area of a rectangle with length 8cm and width 5cm', 'MATH-101-NECO', '40 cm2', true,  2),
  ('Find the area of a rectangle with length 8cm and width 5cm', 'MATH-101-NECO', '13 cm2', false, 3),
  ('Find the area of a rectangle with length 8cm and width 5cm', 'MATH-101-NECO', '80 cm2', false, 4),

  ('Solve: 3x - 7 = 2x + 4', 'MATH-101-NECO', 'x = 7', false, 1),
  ('Solve: 3x - 7 = 2x + 4', 'MATH-101-NECO', 'x = 11', true,  2),
  ('Solve: 3x - 7 = 2x + 4', 'MATH-101-NECO', 'x = 3', false, 3),
  ('Solve: 3x - 7 = 2x + 4', 'MATH-101-NECO', 'x = -3', false, 4),

  ('What is the median of: 3, 5, 7, 9, 11?', 'MATH-101-NECO', '5', false, 1),
  ('What is the median of: 3, 5, 7, 9, 11?', 'MATH-101-NECO', '7', true,  2),
  ('What is the median of: 3, 5, 7, 9, 11?', 'MATH-101-NECO', '9', false, 3),
  ('What is the median of: 3, 5, 7, 9, 11?', 'MATH-101-NECO', '6', false, 4),

  ('Find the equation of a line with slope 2 passing through (1, 3)', 'MATH-101-NECO', 'y = 2x', false, 1),
  ('Find the equation of a line with slope 2 passing through (1, 3)', 'MATH-101-NECO', 'y = 2x + 1', true,  2),
  ('Find the equation of a line with slope 2 passing through (1, 3)', 'MATH-101-NECO', 'y = x + 2', false, 3),
  ('Find the equation of a line with slope 2 passing through (1, 3)', 'MATH-101-NECO', 'y = 3x + 1', false, 4),

  -- NECO PHYSICS
  ('What is the speed of light in vacuum?', 'PHY-101-NECO', '2 x 10^8 m/s', false, 1),
  ('What is the speed of light in vacuum?', 'PHY-101-NECO', '3 x 10^8 m/s', true,  2),
  ('What is the speed of light in vacuum?', 'PHY-101-NECO', '1 x 10^8 m/s', false, 3),
  ('What is the speed of light in vacuum?', 'PHY-101-NECO', '4 x 10^8 m/s', false, 4),

  ('What is the formula for work done?', 'PHY-101-NECO', 'W = m x a', false, 1),
  ('What is the formula for work done?', 'PHY-101-NECO', 'W = F x d', true,  2),
  ('What is the formula for work done?', 'PHY-101-NECO', 'W = P x t', false, 3),
  ('What is the formula for work done?', 'PHY-101-NECO', 'W = v x t', false, 4),

  ('What happens to resistance when temperature increases in a conductor?', 'PHY-101-NECO', 'Resistance decreases', false, 1),
  ('What happens to resistance when temperature increases in a conductor?', 'PHY-101-NECO', 'Resistance increases', true,  2),
  ('What happens to resistance when temperature increases in a conductor?', 'PHY-101-NECO', 'Resistance stays the same', false, 3),
  ('What happens to resistance when temperature increases in a conductor?', 'PHY-101-NECO', 'Resistance becomes zero', false, 4),

  ('A stone is dropped from a height of 80m. How long does it take to reach the ground? (g=10m/s2)', 'PHY-101-NECO', '2 seconds', false, 1),
  ('A stone is dropped from a height of 80m. How long does it take to reach the ground? (g=10m/s2)', 'PHY-101-NECO', '4 seconds', true,  2),
  ('A stone is dropped from a height of 80m. How long does it take to reach the ground? (g=10m/s2)', 'PHY-101-NECO', '8 seconds', false, 3),
  ('A stone is dropped from a height of 80m. How long does it take to reach the ground? (g=10m/s2)', 'PHY-101-NECO', '10 seconds', false, 4),

  ('Explain the photoelectric effect', 'PHY-101-NECO', 'Light bending around objects', false, 1),
  ('Explain the photoelectric effect', 'PHY-101-NECO', 'Emission of electrons from a metal surface when light of sufficient frequency hits it', true,  2),
  ('Explain the photoelectric effect', 'PHY-101-NECO', 'Reflection of light from a shiny surface', false, 3),
  ('Explain the photoelectric effect', 'PHY-101-NECO', 'Absorption of light by a black body', false, 4),

  -- NECO CHEMISTRY
  ('What is the chemical formula of water?', 'CHEM-101-NECO', 'H2O2', false, 1),
  ('What is the chemical formula of water?', 'CHEM-101-NECO', 'H2O', true,  2),
  ('What is the chemical formula of water?', 'CHEM-101-NECO', 'HO2', false, 3),
  ('What is the chemical formula of water?', 'CHEM-101-NECO', 'H3O', false, 4),

  ('Which element has symbol Fe?', 'CHEM-101-NECO', 'Fluorine', false, 1),
  ('Which element has symbol Fe?', 'CHEM-101-NECO', 'Iron', true,  2),
  ('Which element has symbol Fe?', 'CHEM-101-NECO', 'Francium', false, 3),
  ('Which element has symbol Fe?', 'CHEM-101-NECO', 'Fermium', false, 4),

  ('What type of reaction is: acid + base -> salt + water?', 'CHEM-101-NECO', 'Decomposition reaction', false, 1),
  ('What type of reaction is: acid + base -> salt + water?', 'CHEM-101-NECO', 'Neutralisation reaction', true,  2),
  ('What type of reaction is: acid + base -> salt + water?', 'CHEM-101-NECO', 'Combustion reaction', false, 3),
  ('What type of reaction is: acid + base -> salt + water?', 'CHEM-101-NECO', 'Displacement reaction', false, 4),

  ('What is the difference between an atom and a molecule?', 'CHEM-101-NECO', 'They are the same', false, 1),
  ('What is the difference between an atom and a molecule?', 'CHEM-101-NECO', 'An atom is the smallest unit of an element; a molecule is two or more atoms bonded together', true,  2),
  ('What is the difference between an atom and a molecule?', 'CHEM-101-NECO', 'A molecule is smaller than an atom', false, 3),
  ('What is the difference between an atom and a molecule?', 'CHEM-101-NECO', 'Atoms only exist in gases', false, 4),

  ('Explain Le Chatelier''s principle with an example', 'CHEM-101-NECO', 'A system always moves in the direction of the applied change', false, 1),
  ('Explain Le Chatelier''s principle with an example', 'CHEM-101-NECO', 'If a system at equilibrium is disturbed it shifts to counteract the disturbance', true,  2),
  ('Explain Le Chatelier''s principle with an example', 'CHEM-101-NECO', 'Temperature has no effect on chemical equilibrium', false, 3),
  ('Explain Le Chatelier''s principle with an example', 'CHEM-101-NECO', 'Pressure only affects solid reactions', false, 4),

  -- NECO BIOLOGY
  ('What is the basic unit of life?', 'BIO-101-NECO', 'Tissue', false, 1),
  ('What is the basic unit of life?', 'BIO-101-NECO', 'Cell', true,  2),
  ('What is the basic unit of life?', 'BIO-101-NECO', 'Organ', false, 3),
  ('What is the basic unit of life?', 'BIO-101-NECO', 'Atom', false, 4),

  ('Which organ produces insulin?', 'BIO-101-NECO', 'Liver', false, 1),
  ('Which organ produces insulin?', 'BIO-101-NECO', 'Pancreas', true,  2),
  ('Which organ produces insulin?', 'BIO-101-NECO', 'Kidney', false, 3),
  ('Which organ produces insulin?', 'BIO-101-NECO', 'Stomach', false, 4),

  ('What is the difference between aerobic and anaerobic respiration?', 'BIO-101-NECO', 'They produce the same amount of energy', false, 1),
  ('What is the difference between aerobic and anaerobic respiration?', 'BIO-101-NECO', 'Aerobic uses oxygen and produces more ATP; anaerobic does not use oxygen', true,  2),
  ('What is the difference between aerobic and anaerobic respiration?', 'BIO-101-NECO', 'Anaerobic is only found in plants', false, 3),
  ('What is the difference between aerobic and anaerobic respiration?', 'BIO-101-NECO', 'Aerobic respiration only occurs at night', false, 4),

  ('Explain the process of DNA replication', 'BIO-101-NECO', 'DNA is destroyed and rebuilt from scratch', false, 1),
  ('Explain the process of DNA replication', 'BIO-101-NECO', 'The double helix unwinds and each strand serves as a template for a new complementary strand', true,  2),
  ('Explain the process of DNA replication', 'BIO-101-NECO', 'DNA replication only occurs in the cytoplasm', false, 3),
  ('Explain the process of DNA replication', 'BIO-101-NECO', 'Only RNA is involved in DNA replication', false, 4),

  ('What is ecological succession?', 'BIO-101-NECO', 'The extinction of species in an ecosystem', false, 1),
  ('What is ecological succession?', 'BIO-101-NECO', 'The gradual process by which ecosystems change and develop over time', true,  2),
  ('What is ecological succession?', 'BIO-101-NECO', 'The migration of animals to new habitats', false, 3),
  ('What is ecological succession?', 'BIO-101-NECO', 'The rapid change in climate of an area', false, 4),

  -- NECO ENGLISH
  ('What is a noun?', 'ENG-101-NECO', 'A word that describes an action', false, 1),
  ('What is a noun?', 'ENG-101-NECO', 'A word that names a person, place, thing or idea', true,  2),
  ('What is a noun?', 'ENG-101-NECO', 'A word that modifies an adjective', false, 3),
  ('What is a noun?', 'ENG-101-NECO', 'A word that connects clauses', false, 4),

  ('Identify the subject in: "The tall man ran quickly"', 'ENG-101-NECO', 'ran', false, 1),
  ('Identify the subject in: "The tall man ran quickly"', 'ENG-101-NECO', 'man', true,  2),
  ('Identify the subject in: "The tall man ran quickly"', 'ENG-101-NECO', 'tall', false, 3),
  ('Identify the subject in: "The tall man ran quickly"', 'ENG-101-NECO', 'quickly', false, 4),

  ('What is the difference between "affect" and "effect"?', 'ENG-101-NECO', 'They mean exactly the same thing', false, 1),
  ('What is the difference between "affect" and "effect"?', 'ENG-101-NECO', 'Affect is usually a verb; effect is usually a noun', true,  2),
  ('What is the difference between "affect" and "effect"?', 'ENG-101-NECO', 'Effect is a verb; affect is a noun', false, 3),
  ('What is the difference between "affect" and "effect"?', 'ENG-101-NECO', 'Both are only used in formal writing', false, 4),

  ('What is a metaphor? Give an example', 'ENG-101-NECO', 'A comparison using like or as', false, 1),
  ('What is a metaphor? Give an example', 'ENG-101-NECO', 'A direct comparison stating one thing is another, e.g. "Life is a journey"', true,  2),
  ('What is a metaphor? Give an example', 'ENG-101-NECO', 'An exaggeration for emphasis', false, 3),
  ('What is a metaphor? Give an example', 'ENG-101-NECO', 'Giving human traits to objects', false, 4),

  ('Write a summary of a given passage in your own words', 'ENG-101-NECO', 'Copy the passage word for word', false, 1),
  ('Write a summary of a given passage in your own words', 'ENG-101-NECO', 'Identify main ideas and restate them concisely using your own language', true,  2),
  ('Write a summary of a given passage in your own words', 'ENG-101-NECO', 'Add your own opinions to the passage', false, 3),
  ('Write a summary of a given passage in your own words', 'ENG-101-NECO', 'Write the passage backwards', false, 4),

  -- NECO ECONOMICS
  ('What is a budget deficit?', 'ECON-101-NECO', 'When government earns more than it spends', false, 1),
  ('What is a budget deficit?', 'ECON-101-NECO', 'When government spending exceeds its revenue', true,  2),
  ('What is a budget deficit?', 'ECON-101-NECO', 'When exports exceed imports', false, 3),
  ('What is a budget deficit?', 'ECON-101-NECO', 'When inflation falls below zero', false, 4),

  ('What are the factors of production?', 'ECON-101-NECO', 'Money, machines, marketing and management', false, 1),
  ('What are the factors of production?', 'ECON-101-NECO', 'Land, labour, capital and entrepreneurship', true,  2),
  ('What are the factors of production?', 'ECON-101-NECO', 'Supply, demand, price and output', false, 3),
  ('What are the factors of production?', 'ECON-101-NECO', 'Imports, exports, savings and investments', false, 4),

  ('What is the difference between fixed and variable costs?', 'ECON-101-NECO', 'Fixed costs change with output; variable costs do not', false, 1),
  ('What is the difference between fixed and variable costs?', 'ECON-101-NECO', 'Fixed costs do not change with output; variable costs do', true,  2),
  ('What is the difference between fixed and variable costs?', 'ECON-101-NECO', 'They are the same in the long run', false, 3),
  ('What is the difference between fixed and variable costs?', 'ECON-101-NECO', 'Variable costs are always higher than fixed costs', false, 4),

  ('Explain demand-pull inflation', 'ECON-101-NECO', 'Inflation caused by rising production costs', false, 1),
  ('Explain demand-pull inflation', 'ECON-101-NECO', 'Inflation caused by excess demand in the economy pulling prices up', true,  2),
  ('Explain demand-pull inflation', 'ECON-101-NECO', 'Inflation caused by a fall in government spending', false, 3),
  ('Explain demand-pull inflation', 'ECON-101-NECO', 'Inflation caused by a decrease in money supply', false, 4),

  ('Analyse the impact of foreign direct investment on a developing economy', 'ECON-101-NECO', 'FDI always harms developing economies', false, 1),
  ('Analyse the impact of foreign direct investment on a developing economy', 'ECON-101-NECO', 'FDI can bring capital, technology and jobs but may also cause profit repatriation', true,  2),
  ('Analyse the impact of foreign direct investment on a developing economy', 'ECON-101-NECO', 'FDI has no impact on developing economies', false, 3),
  ('Analyse the impact of foreign direct investment on a developing economy', 'ECON-101-NECO', 'FDI only benefits the investing country', false, 4),

  -- NECO COMPUTER SCIENCE
  ('What is an operating system?', 'CS-101-NECO', 'A word processing application', false, 1),
  ('What is an operating system?', 'CS-101-NECO', 'Software that manages hardware resources and provides services for programs', true,  2),
  ('What is an operating system?', 'CS-101-NECO', 'A type of computer hardware', false, 3),
  ('What is an operating system?', 'CS-101-NECO', 'A programming language', false, 4),

  ('What does LAN stand for?', 'CS-101-NECO', 'Large Area Network', false, 1),
  ('What does LAN stand for?', 'CS-101-NECO', 'Local Area Network', true,  2),
  ('What does LAN stand for?', 'CS-101-NECO', 'Linked Access Node', false, 3),
  ('What does LAN stand for?', 'CS-101-NECO', 'Long Access Network', false, 4),

  ('What is the difference between hardware and software?', 'CS-101-NECO', 'Hardware is the programs; software is the machine', false, 1),
  ('What is the difference between hardware and software?', 'CS-101-NECO', 'Hardware is the physical components; software is the programs and instructions', true,  2),
  ('What is the difference between hardware and software?', 'CS-101-NECO', 'They are the same thing', false, 3),
  ('What is the difference between hardware and software?', 'CS-101-NECO', 'Software can be touched; hardware cannot', false, 4),

  ('What is a recursive function?', 'CS-101-NECO', 'A function that never returns a value', false, 1),
  ('What is a recursive function?', 'CS-101-NECO', 'A function that calls itself until a base condition is met', true,  2),
  ('What is a recursive function?', 'CS-101-NECO', 'A function that only runs once', false, 3),
  ('What is a recursive function?', 'CS-101-NECO', 'A function used only in databases', false, 4),

  ('Explain how the internet works', 'CS-101-NECO', 'The internet works using only Bluetooth connections', false, 1),
  ('Explain how the internet works', 'CS-101-NECO', 'Devices communicate using TCP/IP protocols over a global network of interconnected computers', true,  2),
  ('Explain how the internet works', 'CS-101-NECO', 'The internet is a single large computer shared by everyone', false, 3),
  ('Explain how the internet works', 'CS-101-NECO', 'The internet only works through satellite connections', false, 4),

  -- NECO BUSINESS STUDIES
  ('What is a business plan?', 'BUS-101-NECO', 'A list of employees in a company', false, 1),
  ('What is a business plan?', 'BUS-101-NECO', 'A document outlining business goals, strategies and financial projections', true,  2),
  ('What is a business plan?', 'BUS-101-NECO', 'A daily record of sales transactions', false, 3),
  ('What is a business plan?', 'BUS-101-NECO', 'A legal agreement between two businesses', false, 4),

  ('What is the difference between gross profit and net profit?', 'BUS-101-NECO', 'They are the same', false, 1),
  ('What is the difference between gross profit and net profit?', 'BUS-101-NECO', 'Gross profit is revenue minus cost of goods sold; net profit deducts all other expenses too', true,  2),
  ('What is the difference between gross profit and net profit?', 'BUS-101-NECO', 'Net profit is always higher than gross profit', false, 3),
  ('What is the difference between gross profit and net profit?', 'BUS-101-NECO', 'Gross profit includes taxes while net profit does not', false, 4),

  ('What are the functions of management?', 'BUS-101-NECO', 'Only planning and controlling', false, 1),
  ('What are the functions of management?', 'BUS-101-NECO', 'Planning, organising, leading, controlling and staffing', true,  2),
  ('What are the functions of management?', 'BUS-101-NECO', 'Selling products and managing customers', false, 3),
  ('What are the functions of management?', 'BUS-101-NECO', 'Hiring and firing employees only', false, 4),

  ('What is working capital?', 'BUS-101-NECO', 'The total value of a company''s assets', false, 1),
  ('What is working capital?', 'BUS-101-NECO', 'Current assets minus current liabilities, used to fund day-to-day operations', true,  2),
  ('What is working capital?', 'BUS-101-NECO', 'The salary paid to all workers', false, 3),
  ('What is working capital?', 'BUS-101-NECO', 'The money spent on advertising', false, 4),

  ('Explain the importance of record keeping in business', 'BUS-101-NECO', 'Record keeping is not necessary for small businesses', false, 1),
  ('Explain the importance of record keeping in business', 'BUS-101-NECO', 'It helps track performance, supports tax compliance and aids decision making', true,  2),
  ('Explain the importance of record keeping in business', 'BUS-101-NECO', 'Records are only kept for legal purposes', false, 3),
  ('Explain the importance of record keeping in business', 'BUS-101-NECO', 'Only large companies need to keep records', false, 4)
) AS o(question_text, subject_code, option_text, is_correct, order_index)
ON q.question_text = o.question_text AND s.code = o.subject_code;

-- ============================================================
-- O-LEVEL ALL SUBJECTS
-- ============================================================
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index)
SELECT gen_random_uuid(), q.id, o.option_text, o.is_correct, o.order_index
FROM questions q
JOIN subjects s ON s.id = q.subject_id_uuid
JOIN (VALUES
  -- O-LEVEL MATHEMATICS
  ('What is 15% of 200?', 'MATH-101-OLEVEL', '25', false, 1),
  ('What is 15% of 200?', 'MATH-101-OLEVEL', '30', true,  2),
  ('What is 15% of 200?', 'MATH-101-OLEVEL', '40', false, 3),
  ('What is 15% of 200?', 'MATH-101-OLEVEL', '15', false, 4),

  ('Expand: (x + 3)(x - 2)', 'MATH-101-OLEVEL', 'x2 - x - 6', false, 1),
  ('Expand: (x + 3)(x - 2)', 'MATH-101-OLEVEL', 'x2 + x - 6', true,  2),
  ('Expand: (x + 3)(x - 2)', 'MATH-101-OLEVEL', 'x2 + x + 6', false, 3),
  ('Expand: (x + 3)(x - 2)', 'MATH-101-OLEVEL', 'x2 - x + 6', false, 4),

  ('Find the volume of a cylinder with radius 4cm and height 10cm', 'MATH-101-OLEVEL', '160 pi cm3', false, 1),
  ('Find the volume of a cylinder with radius 4cm and height 10cm', 'MATH-101-OLEVEL', '160pi cm3 (approximately 502.4 cm3)', true,  2),
  ('Find the volume of a cylinder with radius 4cm and height 10cm', 'MATH-101-OLEVEL', '80 pi cm3', false, 3),
  ('Find the volume of a cylinder with radius 4cm and height 10cm', 'MATH-101-OLEVEL', '40 pi cm3', false, 4),

  ('If f(x) = 2x2 - 3, find f(3)', 'MATH-101-OLEVEL', '9', false, 1),
  ('If f(x) = 2x2 - 3, find f(3)', 'MATH-101-OLEVEL', '15', true,  2),
  ('If f(x) = 2x2 - 3, find f(3)', 'MATH-101-OLEVEL', '12', false, 3),
  ('If f(x) = 2x2 - 3, find f(3)', 'MATH-101-OLEVEL', '6', false, 4),

  ('Prove that the angles in a quadrilateral sum to 360 degrees', 'MATH-101-OLEVEL', 'By dividing into 3 triangles each with 90 degrees', false, 1),
  ('Prove that the angles in a quadrilateral sum to 360 degrees', 'MATH-101-OLEVEL', 'By dividing into 2 triangles each with 180 degrees giving 360 degrees total', true,  2),
  ('Prove that the angles in a quadrilateral sum to 360 degrees', 'MATH-101-OLEVEL', 'This is a definition not a provable fact', false, 3),
  ('Prove that the angles in a quadrilateral sum to 360 degrees', 'MATH-101-OLEVEL', 'By measuring all quadrilaterals and averaging', false, 4),

  -- O-LEVEL PHYSICS
  ('What is the formula for Ohm''s law?', 'PHY-101-OLEVEL', 'V = IR', true,  1),
  ('What is the formula for Ohm''s law?', 'PHY-101-OLEVEL', 'V = I/R', false, 2),
  ('What is the formula for Ohm''s law?', 'PHY-101-OLEVEL', 'V = I + R', false, 3),
  ('What is the formula for Ohm''s law?', 'PHY-101-OLEVEL', 'V = I x P', false, 4),

  ('What is the difference between mass and weight?', 'PHY-101-OLEVEL', 'Mass and weight are the same', false, 1),
  ('What is the difference between mass and weight?', 'PHY-101-OLEVEL', 'Mass is the amount of matter in an object; weight is the force of gravity on that mass', true,  2),
  ('What is the difference between mass and weight?', 'PHY-101-OLEVEL', 'Weight is measured in kilograms; mass in Newtons', false, 3),
  ('What is the difference between mass and weight?', 'PHY-101-OLEVEL', 'Mass changes with location; weight does not', false, 4),

  ('What is total internal reflection?', 'PHY-101-OLEVEL', 'When light reflects off an external surface', false, 1),
  ('What is total internal reflection?', 'PHY-101-OLEVEL', 'When light hits a boundary at an angle greater than the critical angle and reflects back entirely', true,  2),
  ('What is total internal reflection?', 'PHY-101-OLEVEL', 'When light passes through a prism', false, 3),
  ('What is total internal reflection?', 'PHY-101-OLEVEL', 'When light travels from a less dense to a more dense medium', false, 4),

  ('Calculate the equivalent resistance of two 6 ohm resistors in parallel', 'PHY-101-OLEVEL', '12 ohm', false, 1),
  ('Calculate the equivalent resistance of two 6 ohm resistors in parallel', 'PHY-101-OLEVEL', '3 ohm', true,  2),
  ('Calculate the equivalent resistance of two 6 ohm resistors in parallel', 'PHY-101-OLEVEL', '6 ohm', false, 3),
  ('Calculate the equivalent resistance of two 6 ohm resistors in parallel', 'PHY-101-OLEVEL', '1 ohm', false, 4),

  ('What is nuclear fission? Give an example of its application', 'PHY-101-OLEVEL', 'Combining two light nuclei to release energy; used in hydrogen bombs', false, 1),
  ('What is nuclear fission? Give an example of its application', 'PHY-101-OLEVEL', 'Splitting a heavy nucleus into smaller ones releasing energy; used in nuclear power plants', true,  2),
  ('What is nuclear fission? Give an example of its application', 'PHY-101-OLEVEL', 'The emission of electrons from a nucleus; used in X-rays', false, 3),
  ('What is nuclear fission? Give an example of its application', 'PHY-101-OLEVEL', 'The absorption of neutrons by a nucleus; used in MRI machines', false, 4),

  -- O-LEVEL CHEMISTRY
  ('What is a covalent bond?', 'CHEM-101-OLEVEL', 'Transfer of electrons between atoms', false, 1),
  ('What is a covalent bond?', 'CHEM-101-OLEVEL', 'Sharing of electrons between atoms', true,  2),
  ('What is a covalent bond?', 'CHEM-101-OLEVEL', 'Attraction between opposite ions', false, 3),
  ('What is a covalent bond?', 'CHEM-101-OLEVEL', 'Bond formed only in metals', false, 4),

  ('What is the difference between an element and a compound?', 'CHEM-101-OLEVEL', 'They are the same thing', false, 1),
  ('What is the difference between an element and a compound?', 'CHEM-101-OLEVEL', 'An element has one type of atom; a compound has two or more different elements chemically combined', true,  2),
  ('What is the difference between an element and a compound?', 'CHEM-101-OLEVEL', 'A compound is simpler than an element', false, 3),
  ('What is the difference between an element and a compound?', 'CHEM-101-OLEVEL', 'Elements can be broken down; compounds cannot', false, 4),

  ('What gas is produced when copper reacts with concentrated H2SO4?', 'CHEM-101-OLEVEL', 'Hydrogen', false, 1),
  ('What gas is produced when copper reacts with concentrated H2SO4?', 'CHEM-101-OLEVEL', 'Sulphur dioxide', true,  2),
  ('What gas is produced when copper reacts with concentrated H2SO4?', 'CHEM-101-OLEVEL', 'Oxygen', false, 3),
  ('What gas is produced when copper reacts with concentrated H2SO4?', 'CHEM-101-OLEVEL', 'Carbon dioxide', false, 4),

  ('What is chromatography used for?', 'CHEM-101-OLEVEL', 'Measuring temperature of substances', false, 1),
  ('What is chromatography used for?', 'CHEM-101-OLEVEL', 'Separating mixtures based on how far components travel through a medium', true,  2),
  ('What is chromatography used for?', 'CHEM-101-OLEVEL', 'Filtering large particles from liquids', false, 3),
  ('What is chromatography used for?', 'CHEM-101-OLEVEL', 'Measuring electrical conductivity', false, 4),

  ('Describe the industrial production of ammonia (Haber Process)', 'CHEM-101-OLEVEL', 'Ammonia is made by heating nitrogen with water', false, 1),
  ('Describe the industrial production of ammonia (Haber Process)', 'CHEM-101-OLEVEL', 'Nitrogen and hydrogen react at high temperature and pressure with an iron catalyst', true,  2),
  ('Describe the industrial production of ammonia (Haber Process)', 'CHEM-101-OLEVEL', 'Ammonia is extracted directly from the atmosphere', false, 3),
  ('Describe the industrial production of ammonia (Haber Process)', 'CHEM-101-OLEVEL', 'Ammonia is produced by burning coal with air', false, 4),

  -- O-LEVEL BIOLOGY
  ('What is the function of chlorophyll?', 'BIO-101-OLEVEL', 'To transport water in plants', false, 1),
  ('What is the function of chlorophyll?', 'BIO-101-OLEVEL', 'To absorb light energy for photosynthesis', true,  2),
  ('What is the function of chlorophyll?', 'BIO-101-OLEVEL', 'To store food in plant cells', false, 3),
  ('What is the function of chlorophyll?', 'BIO-101-OLEVEL', 'To produce oxygen during respiration', false, 4),

  ('What is the difference between veins and arteries?', 'BIO-101-OLEVEL', 'Veins carry blood away from the heart; arteries carry blood to the heart', false, 1),
  ('What is the difference between veins and arteries?', 'BIO-101-OLEVEL', 'Arteries carry oxygenated blood away from the heart; veins carry deoxygenated blood to the heart', true,  2),
  ('What is the difference between veins and arteries?', 'BIO-101-OLEVEL', 'They are the same type of blood vessel', false, 3),
  ('What is the difference between veins and arteries?', 'BIO-101-OLEVEL', 'Veins carry blood to organs; arteries carry blood from organs', false, 4),

  ('Explain the nitrogen cycle', 'BIO-101-OLEVEL', 'The movement of water through the ecosystem', false, 1),
  ('Explain the nitrogen cycle', 'BIO-101-OLEVEL', 'The process by which nitrogen is converted between its various chemical forms as it circulates through ecosystems', true,  2),
  ('Explain the nitrogen cycle', 'BIO-101-OLEVEL', 'The cycle by which plants absorb sunlight', false, 3),
  ('Explain the nitrogen cycle', 'BIO-101-OLEVEL', 'The movement of carbon dioxide through the atmosphere', false, 4),

  ('What is the difference between mitosis and meiosis?', 'BIO-101-OLEVEL', 'They are the same process', false, 1),
  ('What is the difference between mitosis and meiosis?', 'BIO-101-OLEVEL', 'Mitosis produces 2 identical diploid cells; meiosis produces 4 unique haploid cells', true,  2),
  ('What is the difference between mitosis and meiosis?', 'BIO-101-OLEVEL', 'Meiosis only occurs in plants', false, 3),
  ('What is the difference between mitosis and meiosis?', 'BIO-101-OLEVEL', 'Mitosis produces sex cells; meiosis produces body cells', false, 4),

  ('Describe the structure and function of the kidney', 'BIO-101-OLEVEL', 'The kidney produces blood and is located in the chest', false, 1),
  ('Describe the structure and function of the kidney', 'BIO-101-OLEVEL', 'The kidney contains nephrons that filter blood to remove waste and regulate water balance', true,  2),
  ('Describe the structure and function of the kidney', 'BIO-101-OLEVEL', 'The kidney is responsible for digesting fats', false, 3),
  ('Describe the structure and function of the kidney', 'BIO-101-OLEVEL', 'The kidney produces insulin to regulate blood sugar', false, 4),

  -- O-LEVEL ENGLISH
  ('What is an adjective?', 'ENG-101-OLEVEL', 'A word that describes a verb', false, 1),
  ('What is an adjective?', 'ENG-101-OLEVEL', 'A word that describes or modifies a noun', true,  2),
  ('What is an adjective?', 'ENG-101-OLEVEL', 'A word that connects two clauses', false, 3),
  ('What is an adjective?', 'ENG-101-OLEVEL', 'A word that names a person or place', false, 4),

  ('Change to indirect speech: He said "I am tired"', 'ENG-101-OLEVEL', 'He said that I am tired', false, 1),
  ('Change to indirect speech: He said "I am tired"', 'ENG-101-OLEVEL', 'He said that he was tired', true,  2),
  ('Change to indirect speech: He said "I am tired"', 'ENG-101-OLEVEL', 'He said I were tired', false, 3),
  ('Change to indirect speech: He said "I am tired"', 'ENG-101-OLEVEL', 'He told that he is tired', false, 4),

  ('What is the tone of a piece of writing?', 'ENG-101-OLEVEL', 'The length of the writing', false, 1),
  ('What is the tone of a piece of writing?', 'ENG-101-OLEVEL', 'The attitude or feeling conveyed by the writer toward the subject or audience', true,  2),
  ('What is the tone of a piece of writing?', 'ENG-101-OLEVEL', 'The punctuation used in the writing', false, 3),
  ('What is the tone of a piece of writing?', 'ENG-101-OLEVEL', 'The number of characters in the story', false, 4),

  ('What is the difference between denotation and connotation?', 'ENG-101-OLEVEL', 'They mean the same thing', false, 1),
  ('What is the difference between denotation and connotation?', 'ENG-101-OLEVEL', 'Denotation is the literal meaning; connotation is the emotional or cultural association', true,  2),
  ('What is the difference between denotation and connotation?', 'ENG-101-OLEVEL', 'Connotation is always positive; denotation is negative', false, 3),
  ('What is the difference between denotation and connotation?', 'ENG-101-OLEVEL', 'Denotation applies only to verbs', false, 4),

  ('Analyse the use of imagery in a given poem', 'ENG-101-OLEVEL', 'Count the number of lines in the poem', false, 1),
  ('Analyse the use of imagery in a given poem', 'ENG-101-OLEVEL', 'Identify descriptive language that appeals to the senses and explain its effect on the reader', true,  2),
  ('Analyse the use of imagery in a given poem', 'ENG-101-OLEVEL', 'Identify the rhyme scheme only', false, 3),
  ('Analyse the use of imagery in a given poem', 'ENG-101-OLEVEL', 'List all the nouns in the poem', false, 4),

  -- O-LEVEL ECONOMICS
  ('What is a market economy?', 'ECON-101-OLEVEL', 'An economy controlled entirely by the government', false, 1),
  ('What is a market economy?', 'ECON-101-OLEVEL', 'An economy where prices and production are determined by supply and demand with minimal government intervention', true,  2),
  ('What is a market economy?', 'ECON-101-OLEVEL', 'An economy where all goods are free', false, 3),
  ('What is a market economy?', 'ECON-101-OLEVEL', 'An economy with only one seller', false, 4),

  ('What is the difference between needs and wants?', 'ECON-101-OLEVEL', 'They are the same thing', false, 1),
  ('What is the difference between needs and wants?', 'ECON-101-OLEVEL', 'Needs are essential for survival; wants are desirable but not essential', true,  2),
  ('What is the difference between needs and wants?', 'ECON-101-OLEVEL', 'Wants are more important than needs', false, 3),
  ('What is the difference between needs and wants?', 'ECON-101-OLEVEL', 'Needs are always more expensive than wants', false, 4),

  ('Explain the concept of comparative advantage', 'ECON-101-OLEVEL', 'A country should produce everything it needs', false, 1),
  ('Explain the concept of comparative advantage', 'ECON-101-OLEVEL', 'A country should specialise in producing goods where it has a lower opportunity cost than others', true,  2),
  ('Explain the concept of comparative advantage', 'ECON-101-OLEVEL', 'Countries should never trade with each other', false, 3),
  ('Explain the concept of comparative advantage', 'ECON-101-OLEVEL', 'Only large countries can have a comparative advantage', false, 4),

  ('What causes unemployment?', 'ECON-101-OLEVEL', 'Only laziness causes unemployment', false, 1),
  ('What causes unemployment?', 'ECON-101-OLEVEL', 'Structural changes, economic downturns, seasonal factors and skills mismatches can cause unemployment', true,  2),
  ('What causes unemployment?', 'ECON-101-OLEVEL', 'Unemployment is always caused by government policy', false, 3),
  ('What causes unemployment?', 'ECON-101-OLEVEL', 'Only inflation causes unemployment', false, 4),

  ('Describe the role of the central bank in an economy', 'ECON-101-OLEVEL', 'The central bank only prints money', false, 1),
  ('Describe the role of the central bank in an economy', 'ECON-101-OLEVEL', 'It controls monetary policy, regulates commercial banks and manages inflation and currency', true,  2),
  ('Describe the role of the central bank in an economy', 'ECON-101-OLEVEL', 'The central bank lends money directly to individuals', false, 3),
  ('Describe the role of the central bank in an economy', 'ECON-101-OLEVEL', 'The central bank collects taxes on behalf of government', false, 4),

  -- O-LEVEL COMPUTER SCIENCE
  ('What is a flowchart?', 'CS-101-OLEVEL', 'A type of database', false, 1),
  ('What is a flowchart?', 'CS-101-OLEVEL', 'A diagram that represents the steps of an algorithm using symbols', true,  2),
  ('What is a flowchart?', 'CS-101-OLEVEL', 'A chart showing employee performance', false, 3),
  ('What is a flowchart?', 'CS-101-OLEVEL', 'A tool for measuring computer speed', false, 4),

  ('What is the difference between ROM and RAM?', 'CS-101-OLEVEL', 'ROM is temporary; RAM is permanent', false, 1),
  ('What is the difference between ROM and RAM?', 'CS-101-OLEVEL', 'ROM stores permanent data that cannot be changed; RAM is temporary and lost when power is off', true,  2),
  ('What is the difference between ROM and RAM?', 'CS-101-OLEVEL', 'They are the same type of memory', false, 3),
  ('What is the difference between ROM and RAM?', 'CS-101-OLEVEL', 'RAM is permanent; ROM is temporary', false, 4),

  ('What is pseudocode?', 'CS-101-OLEVEL', 'A programming language used for AI', false, 1),
  ('What is pseudocode?', 'CS-101-OLEVEL', 'An informal high-level description of an algorithm using plain language', true,  2),
  ('What is pseudocode?', 'CS-101-OLEVEL', 'A type of encryption method', false, 3),
  ('What is pseudocode?', 'CS-101-OLEVEL', 'A database query language', false, 4),

  ('What is a Boolean expression?', 'CS-101-OLEVEL', 'An expression that results in a number', false, 1),
  ('What is a Boolean expression?', 'CS-101-OLEVEL', 'An expression that evaluates to either true or false', true,  2),
  ('What is a Boolean expression?', 'CS-101-OLEVEL', 'An expression used only in databases', false, 3),
  ('What is a Boolean expression?', 'CS-101-OLEVEL', 'A mathematical formula for geometry', false, 4),

  ('Design an algorithm to sort a list of numbers', 'CS-101-OLEVEL', 'Print all numbers without ordering', false, 1),
  ('Design an algorithm to sort a list of numbers', 'CS-101-OLEVEL', 'Compare adjacent elements and swap if needed, repeating until the list is fully ordered', true,  2),
  ('Design an algorithm to sort a list of numbers', 'CS-101-OLEVEL', 'Delete all numbers and re-enter them in order', false, 3),
  ('Design an algorithm to sort a list of numbers', 'CS-101-OLEVEL', 'Use only if-else statements with no loops', false, 4),

  -- O-LEVEL BUSINESS STUDIES
  ('What is the difference between a product and a service?', 'BUS-101-OLEVEL', 'Products and services are identical', false, 1),
  ('What is the difference between a product and a service?', 'BUS-101-OLEVEL', 'A product is a physical tangible item; a service is an intangible activity provided to a customer', true,  2),
  ('What is the difference between a product and a service?', 'BUS-101-OLEVEL', 'Services are always cheaper than products', false, 3),
  ('What is the difference between a product and a service?', 'BUS-101-OLEVEL', 'Products cannot be sold; only services can', false, 4),

  ('What is cash flow?', 'BUS-101-OLEVEL', 'The total profit a business makes', false, 1),
  ('What is cash flow?', 'BUS-101-OLEVEL', 'The movement of money in and out of a business over a period of time', true,  2),
  ('What is cash flow?', 'BUS-101-OLEVEL', 'The amount of cash stored in a bank vault', false, 3),
  ('What is cash flow?', 'BUS-101-OLEVEL', 'The interest earned on business savings', false, 4),

  ('What is the role of a manager in a business?', 'BUS-101-OLEVEL', 'To only handle customer complaints', false, 1),
  ('What is the role of a manager in a business?', 'BUS-101-OLEVEL', 'To plan, organise, lead and control resources to achieve business objectives', true,  2),
  ('What is the role of a manager in a business?', 'BUS-101-OLEVEL', 'To only recruit and fire staff', false, 3),
  ('What is the role of a manager in a business?', 'BUS-101-OLEVEL', 'To manage only the finances of the business', false, 4),

  ('What is a break-even point?', 'BUS-101-OLEVEL', 'When a business makes its maximum profit', false, 1),
  ('What is a break-even point?', 'BUS-101-OLEVEL', 'The level of output where total revenue equals total costs and profit is zero', true,  2),
  ('What is a break-even point?', 'BUS-101-OLEVEL', 'When a business has no employees', false, 3),
  ('What is a break-even point?', 'BUS-101-OLEVEL', 'When revenue is double the cost', false, 4),

  ('Analyse the impact of technology on modern business operations', 'BUS-101-OLEVEL', 'Technology has no impact on business', false, 1),
  ('Analyse the impact of technology on modern business operations', 'BUS-101-OLEVEL', 'Technology improves efficiency, enables e-commerce, reduces costs and opens global markets', true,  2),
  ('Analyse the impact of technology on modern business operations', 'BUS-101-OLEVEL', 'Technology only affects manufacturing businesses', false, 3),
  ('Analyse the impact of technology on modern business operations', 'BUS-101-OLEVEL', 'Technology always increases business costs', false, 4)
) AS o(question_text, subject_code, option_text, is_correct, order_index)
ON q.question_text = o.question_text AND s.code = o.subject_code;

-- ============================================================
-- VERIFY
-- ============================================================
SELECT
  COUNT(*) AS total_answer_options,
  COUNT(DISTINCT question_id) AS questions_with_options,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS total_correct_options
FROM answer_options;

COMMIT;
