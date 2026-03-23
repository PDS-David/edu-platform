-- ═══════════════════════════════════════════════════════════════
-- EAC Learning Platform — Migration 003
-- Add: A-Levels, JUPEB, IJMB, English Language Lab,
--      French Language Lab, Yoruba Eko Ede as TOP-LEVEL TYPES
-- Run: psql -d edu_platform -f migration_003_new_types.sql
-- ═══════════════════════════════════════════════════════════════

-- ── 1. NEW EXAMINATION TYPES (Level 1) ───────────────────────

INSERT INTO exam_boards
  (code, name, full_name, description, country, display_order, icon_emoji, is_active)
VALUES
  (
    'ALEVEL',
    'A-Levels',
    'Cambridge International A-Levels',
    'Advanced Level qualifications for university entrance. Covers Cambridge International AS & A Level examinations across all major subjects.',
    'International',
    8,
    '🎓',
    true
  ),
  (
    'JUPEB',
    'JUPEB',
    'Joint Universities Preliminary Examinations Board',
    'Nigerian pre-degree programme qualifying students for 200-level direct entry into Nigerian universities.',
    'Nigeria',
    9,
    '🏛️',
    true
  ),
  (
    'IJMB',
    'IJMB',
    'Interim Joint Matriculation Board',
    'Advanced level programme accepted for direct entry into 200-level in Nigerian universities. Run by Ahmadu Bello University.',
    'Nigeria',
    10,
    '📐',
    true
  ),
  (
    'ENG-LAB',
    'English Language Lab',
    'English Language Laboratory',
    'Interactive English Language Laboratory. Sub-categories are defined by the admin and cover all aspects of English language learning and examination preparation.',
    'Nigeria',
    11,
    '🎙️',
    true
  ),
  (
    'FRE-LAB',
    'French Language Lab',
    'French Language Laboratory',
    'Interactive French Language Laboratory. Sub-categories are defined by the admin and cover all aspects of French language learning from beginner to advanced.',
    'International',
    12,
    '🇫🇷',
    true
  ),
  (
    'YOR-LAB',
    'Yoruba Eko Ede',
    'Yoruba Language Laboratory — Eko Ede',
    'Yoruba Language Laboratory. Sub-categories are defined by the admin and cover all aspects of Yoruba language, literature and culture.',
    'Nigeria',
    13,
    '🗣️',
    true
  )
ON CONFLICT (code) DO NOTHING;

-- ── 2. VERIFICATION ──────────────────────────────────────────

SELECT
  id,
  code,
  name,
  display_order,
  icon_emoji,
  is_active
FROM exam_boards
ORDER BY display_order;

-- Expected: 13 rows total (7 original + 6 new)
SELECT COUNT(*) AS total_exam_types FROM exam_boards WHERE is_active = true;
