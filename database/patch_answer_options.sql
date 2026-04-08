-- ============================================================
-- AISchoolonair — ANSWER OPTIONS PATCH
-- Fixes 19 questions that had special characters in text
-- Uses question UUIDs directly to avoid encoding issues
-- ============================================================

BEGIN;

-- a573fd83 | A circle has radius 7cm. What is its area? (pi = 22/7) | MATH-101
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), 'a573fd83-84b9-4827-a77f-3427a286d5d0', '144 cm2', false, 1),
  (gen_random_uuid(), 'a573fd83-84b9-4827-a77f-3427a286d5d0', '154 cm2', true,  2),
  (gen_random_uuid(), 'a573fd83-84b9-4827-a77f-3427a286d5d0', '164 cm2', false, 3),
  (gen_random_uuid(), 'a573fd83-84b9-4827-a77f-3427a286d5d0', '174 cm2', false, 4);

-- 097460ce | What is the value of log10(1000)? | MATH-101
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), '097460ce-505d-419c-b1c8-09870af1d616', '2', false, 1),
  (gen_random_uuid(), '097460ce-505d-419c-b1c8-09870af1d616', '3', true,  2),
  (gen_random_uuid(), '097460ce-505d-419c-b1c8-09870af1d616', '4', false, 3),
  (gen_random_uuid(), '097460ce-505d-419c-b1c8-09870af1d616', '10', false, 4);

-- c218277e | Solve for x: x^2 - 5x + 6 = 0 | MATH-101
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), 'c218277e-c3cc-4c02-90cc-7dc7a4ff4b63', 'x = 1 or x = 6', false, 1),
  (gen_random_uuid(), 'c218277e-c3cc-4c02-90cc-7dc7a4ff4b63', 'x = 2 or x = 3', true,  2),
  (gen_random_uuid(), 'c218277e-c3cc-4c02-90cc-7dc7a4ff4b63', 'x = -2 or x = -3', false, 3),
  (gen_random_uuid(), 'c218277e-c3cc-4c02-90cc-7dc7a4ff4b63', 'x = 4 or x = 2', false, 4);

-- afd2dbea | If sin theta = 3/5, find cos theta | MATH-101
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), 'afd2dbea-dd7a-420d-9b94-1cc95e943464', '3/4', false, 1),
  (gen_random_uuid(), 'afd2dbea-dd7a-420d-9b94-1cc95e943464', '4/5', true,  2),
  (gen_random_uuid(), 'afd2dbea-dd7a-420d-9b94-1cc95e943464', '5/4', false, 3),
  (gen_random_uuid(), 'afd2dbea-dd7a-420d-9b94-1cc95e943464', '5/3', false, 4);

-- 2e045bb3 | What is the pH of a neutral solution at 25C? | CHEM-101
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), '2e045bb3-8ee9-4f12-bdb3-72d2669bfa83', '0', false, 1),
  (gen_random_uuid(), '2e045bb3-8ee9-4f12-bdb3-72d2669bfa83', '7', true,  2),
  (gen_random_uuid(), '2e045bb3-8ee9-4f12-bdb3-72d2669bfa83', '10', false, 3),
  (gen_random_uuid(), '2e045bb3-8ee9-4f12-bdb3-72d2669bfa83', '14', false, 4);

-- 85ebaa17 | Balance this equation: Fe + O2 -> Fe2O3 | CHEM-101
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), '85ebaa17-6e6d-4954-9314-e1caa720b051', '2Fe + O2 -> Fe2O3', false, 1),
  (gen_random_uuid(), '85ebaa17-6e6d-4954-9314-e1caa720b051', '4Fe + 3O2 -> 2Fe2O3', true,  2),
  (gen_random_uuid(), '85ebaa17-6e6d-4954-9314-e1caa720b051', '3Fe + 2O2 -> Fe2O3', false, 3),
  (gen_random_uuid(), '85ebaa17-6e6d-4954-9314-e1caa720b051', 'Fe + 3O2 -> 2Fe2O3', false, 4);

-- 4199335c | Calculate the molar mass of H2SO4 | CHEM-101
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), '4199335c-a441-4fab-9bf6-fa3b0d81e376', '49 g/mol', false, 1),
  (gen_random_uuid(), '4199335c-a441-4fab-9bf6-fa3b0d81e376', '98 g/mol', true,  2),
  (gen_random_uuid(), '4199335c-a441-4fab-9bf6-fa3b0d81e376', '64 g/mol', false, 3),
  (gen_random_uuid(), '4199335c-a441-4fab-9bf6-fa3b0d81e376', '80 g/mol', false, 4);

-- 21586ced | What is the refractive index... 2x10^8 m/s | PHY-101
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), '21586ced-f9bf-462c-a623-736dfab25e0c', '1.0', false, 1),
  (gen_random_uuid(), '21586ced-f9bf-462c-a623-736dfab25e0c', '1.5', true,  2),
  (gen_random_uuid(), '21586ced-f9bf-462c-a623-736dfab25e0c', '2.0', false, 3),
  (gen_random_uuid(), '21586ced-f9bf-462c-a623-736dfab25e0c', '2.5', false, 4);

-- 349efce5 | Evaluate: 5C2 | MATH-101-WAEC
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), '349efce5-202b-4898-aa52-548472ba991e', '5', false, 1),
  (gen_random_uuid(), '349efce5-202b-4898-aa52-548472ba991e', '10', true,  2),
  (gen_random_uuid(), '349efce5-202b-4898-aa52-548472ba991e', '15', false, 3),
  (gen_random_uuid(), '349efce5-202b-4898-aa52-548472ba991e', '20', false, 4);

-- bbe18b2e | Differentiate y = 3x^2 + 2x - 5 | MATH-101-WAEC
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), 'bbe18b2e-1687-4ed4-a53d-9044804ee553', '3x + 2', false, 1),
  (gen_random_uuid(), 'bbe18b2e-1687-4ed4-a53d-9044804ee553', '6x + 2', true,  2),
  (gen_random_uuid(), 'bbe18b2e-1687-4ed4-a53d-9044804ee553', '6x - 5', false, 3),
  (gen_random_uuid(), 'bbe18b2e-1687-4ed4-a53d-9044804ee553', '3x2 + 2', false, 4);

-- 5d35e490 | Calculate pressure at bottom of 10m water column | PHY-101-WAEC
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), '5d35e490-fed7-492f-aa80-27ceef5bd152', '1000 Pa', false, 1),
  (gen_random_uuid(), '5d35e490-fed7-492f-aa80-27ceef5bd152', '100000 Pa', true,  2),
  (gen_random_uuid(), '5d35e490-fed7-492f-aa80-27ceef5bd152', '10000 Pa', false, 3),
  (gen_random_uuid(), '5d35e490-fed7-492f-aa80-27ceef5bd152', '1000000 Pa', false, 4);

-- 5c63809a | Calculate concentration of NaOH in 500cm3 | CHEM-101-WAEC
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), '5c63809a-4d81-4834-a678-8b7493ba233e', '0.1 mol/dm3', false, 1),
  (gen_random_uuid(), '5c63809a-4d81-4834-a678-8b7493ba233e', '0.2 mol/dm3', true,  2),
  (gen_random_uuid(), '5c63809a-4d81-4834-a678-8b7493ba233e', '0.4 mol/dm3', false, 3),
  (gen_random_uuid(), '5c63809a-4d81-4834-a678-8b7493ba233e', '0.5 mol/dm3', false, 4);

-- 0f8b36eb | Which is an oxidising agent: H2, O2, CO, N2? | CHEM-101-WAEC
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), '0f8b36eb-99c7-4c3c-a6c6-90e506e01e7b', 'H2', false, 1),
  (gen_random_uuid(), '0f8b36eb-99c7-4c3c-a6c6-90e506e01e7b', 'O2', true,  2),
  (gen_random_uuid(), '0f8b36eb-99c7-4c3c-a6c6-90e506e01e7b', 'CO', false, 3),
  (gen_random_uuid(), '0f8b36eb-99c7-4c3c-a6c6-90e506e01e7b', 'N2', false, 4);

-- 3eb646b4 | acid + base -> salt + water | CHEM-101-NECO
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), '3eb646b4-6f47-4b87-8ee2-425fd072dbb5', 'Decomposition reaction', false, 1),
  (gen_random_uuid(), '3eb646b4-6f47-4b87-8ee2-425fd072dbb5', 'Neutralisation reaction', true,  2),
  (gen_random_uuid(), '3eb646b4-6f47-4b87-8ee2-425fd072dbb5', 'Combustion reaction', false, 3),
  (gen_random_uuid(), '3eb646b4-6f47-4b87-8ee2-425fd072dbb5', 'Displacement reaction', false, 4);

-- a6cee0c9 | Stone dropped from 80m, g=10m/s2 | PHY-101-NECO
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), 'a6cee0c9-47b7-4cdf-a21b-017c265e278c', '2 seconds', false, 1),
  (gen_random_uuid(), 'a6cee0c9-47b7-4cdf-a21b-017c265e278c', '4 seconds', true,  2),
  (gen_random_uuid(), 'a6cee0c9-47b7-4cdf-a21b-017c265e278c', '8 seconds', false, 3),
  (gen_random_uuid(), 'a6cee0c9-47b7-4cdf-a21b-017c265e278c', '10 seconds', false, 4);

-- 79aa1e3d | Copper reacts with concentrated H2SO4 | CHEM-101-OLEVEL
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), '79aa1e3d-f39f-48e4-a09a-90cdde0b302c', 'Hydrogen', false, 1),
  (gen_random_uuid(), '79aa1e3d-f39f-48e4-a09a-90cdde0b302c', 'Sulphur dioxide', true,  2),
  (gen_random_uuid(), '79aa1e3d-f39f-48e4-a09a-90cdde0b302c', 'Oxygen', false, 3),
  (gen_random_uuid(), '79aa1e3d-f39f-48e4-a09a-90cdde0b302c', 'Carbon dioxide', false, 4);

-- 565dc172 | Angles in quadrilateral sum to 360 degrees | MATH-101-OLEVEL
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), '565dc172-e457-4c2d-acb8-3cbcfc12e419', 'By dividing into 3 triangles each with 90 degrees', false, 1),
  (gen_random_uuid(), '565dc172-e457-4c2d-acb8-3cbcfc12e419', 'By dividing into 2 triangles each with 180 degrees giving 360 degrees total', true,  2),
  (gen_random_uuid(), '565dc172-e457-4c2d-acb8-3cbcfc12e419', 'This is a definition not a provable fact', false, 3),
  (gen_random_uuid(), '565dc172-e457-4c2d-acb8-3cbcfc12e419', 'By measuring all quadrilaterals and averaging', false, 4);

-- f5d1a1c5 | If f(x) = 2x^2 - 3, find f(3) | MATH-101-OLEVEL
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), 'f5d1a1c5-13f6-44cc-8d29-31fb6161bfca', '9', false, 1),
  (gen_random_uuid(), 'f5d1a1c5-13f6-44cc-8d29-31fb6161bfca', '15', true,  2),
  (gen_random_uuid(), 'f5d1a1c5-13f6-44cc-8d29-31fb6161bfca', '12', false, 3),
  (gen_random_uuid(), 'f5d1a1c5-13f6-44cc-8d29-31fb6161bfca', '6', false, 4);

-- e4ef4b38 | Two 6-ohm resistors in parallel | PHY-101-OLEVEL
INSERT INTO answer_options (id, question_id, option_text, is_correct, order_index) VALUES
  (gen_random_uuid(), 'e4ef4b38-cd43-4f18-9570-3eec9592666f', '12 ohm', false, 1),
  (gen_random_uuid(), 'e4ef4b38-cd43-4f18-9570-3eec9592666f', '3 ohm', true,  2),
  (gen_random_uuid(), 'e4ef4b38-cd43-4f18-9570-3eec9592666f', '6 ohm', false, 3),
  (gen_random_uuid(), 'e4ef4b38-cd43-4f18-9570-3eec9592666f', '1 ohm', false, 4);

-- ============================================================
-- FINAL VERIFY
-- ============================================================
SELECT
  COUNT(*) AS total_answer_options,
  COUNT(DISTINCT question_id) AS questions_with_options,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS total_correct_options
FROM answer_options;

COMMIT;
