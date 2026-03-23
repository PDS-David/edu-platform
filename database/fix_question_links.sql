-- ================================================================
-- EAC — FIX QUESTION LINKS
-- Problem: each subject has 4 duplicate rows in subjects table.
-- Seed only linked topics to 1 UUID per subject, leaving 3 unlinked.
-- Fix: UPDATE questions by topic name only (ignore subject_id_uuid)
--      using the subtopic that already exists for each topic.
-- Safe: WHERE subtopic_id IS NULL prevents double-updating.
-- ================================================================

BEGIN;

-- Biology
UPDATE questions
  SET subtopic_id = '653e93f9-53d4-56fc-b4ff-ce357bd7eec1'::uuid
  WHERE topic = 'Cell Biology'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'de580a68-c5d4-507d-adf4-a47d66a4a1f9'::uuid
  WHERE topic = 'Human Biology'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '323b6951-35a7-5606-8bba-fe6512a7af7f'::uuid
  WHERE topic = 'Ecology'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '5965f4d6-a099-56d6-bd9b-914517371bed'::uuid
  WHERE topic = 'Genetics'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'df6e2c3a-906a-5d26-bb18-659e8b0cddcf'::uuid
  WHERE topic = 'Cell Division'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '11420023-d3a5-57be-a173-1ca635be9799'::uuid
  WHERE topic = 'Excretion'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '86b55307-a231-5b9b-a700-c142d69f4821'::uuid
  WHERE topic = 'Photosynthesis'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '5cba798d-756c-5a49-81e9-aa60880e6de0'::uuid
  WHERE topic = 'Digestion'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '2fa7f616-9fc3-58e1-a3b7-8bc43b022108'::uuid
  WHERE topic = 'Respiration'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '9643710a-cb94-5852-9349-8233ec16ad3d'::uuid
  WHERE topic = 'Plant Biology'
  AND subtopic_id IS NULL;

-- Business Studies
UPDATE questions
  SET subtopic_id = '2eeb4993-aa4f-5d11-ae7f-88ee1306891c'::uuid
  WHERE topic = 'Accounting'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'd3597182-14c4-56f7-91b3-84b1d493fd83'::uuid
  WHERE topic = 'Business Structures'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '46a1a2ce-b512-5e95-aece-d0caf3d8332b'::uuid
  WHERE topic = 'Management'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '525879c1-c29e-5f4f-bcbe-c9dedd65f92c'::uuid
  WHERE topic = 'Business Strategy'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '247f5234-a35f-5796-9f65-3d38a10d33d0'::uuid
  WHERE topic = 'Entrepreneurship'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'a5e53996-c3f9-515a-ae5b-77e082e279e1'::uuid
  WHERE topic = 'Finance'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'b7d8ccf4-95ae-589d-8372-21030f0199dd'::uuid
  WHERE topic = 'Marketing'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '557247e8-7539-55be-b2ff-51f378ce89b5'::uuid
  WHERE topic = 'Business Basics'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'f0fa8b2a-5bb6-5d84-bbc8-00b05f9624a6'::uuid
  WHERE topic = 'Production'
  AND subtopic_id IS NULL;

-- Chemistry
UPDATE questions
  SET subtopic_id = 'b14ad343-42b5-58be-acef-44c027788cf3'::uuid
  WHERE topic = 'Chemical Reactions'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '773978cb-4953-5489-adb2-5ff73c34b821'::uuid
  WHERE topic = 'Basic Chemistry'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '6f324737-e5c1-564b-94f8-402599f63ca9'::uuid
  WHERE topic = 'Atomic Structure'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'b67b8a2f-e4b3-5043-9dd4-c75c31340527'::uuid
  WHERE topic = 'Chemical Bonding'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '6d203aac-9223-5a9c-8ac1-42dfd0938f73'::uuid
  WHERE topic = 'Mole Concept'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '203b866c-7089-5250-8d06-2b06378cff56'::uuid
  WHERE topic = 'Periodic Table'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '20d5646b-040d-5e93-94bd-824a3f3f2237'::uuid
  WHERE topic = 'Concentration'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'ec3a318d-984b-5891-ba62-ffc5c9bd3602'::uuid
  WHERE topic = 'Equilibrium'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'fa1d4a07-cc60-5658-afc9-53693b2b184c'::uuid
  WHERE topic = 'Acids and Bases'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '83a5b730-5129-5fff-b9ab-fcde76bff42e'::uuid
  WHERE topic = 'Redox Reactions'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '84c62519-71a4-5ecf-a9ee-6a5b59e42aa3'::uuid
  WHERE topic = 'Chemical Equations'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'badd359b-4cf8-5a8a-adfd-872cd87f5148'::uuid
  WHERE topic = 'Electrolysis'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '6578879b-e1a3-5354-8f36-008a558bc208'::uuid
  WHERE topic = 'Industrial Chemistry'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '3583ed38-d0e0-507d-bb50-c16379b399ff'::uuid
  WHERE topic = 'Separation Techniques'
  AND subtopic_id IS NULL;

-- Computer Science
UPDATE questions
  SET subtopic_id = '865e21a9-a3fd-5314-907c-8cd15fd0f56b'::uuid
  WHERE topic = 'Programming'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '5a4b2331-2e5d-55ca-aa1f-20ac76b767a9'::uuid
  WHERE topic = 'Algorithms'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'f3b639e5-ea7d-5229-9182-708e387f0afa'::uuid
  WHERE topic = 'Computer Hardware'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'a886050d-bbc4-5fa5-93b8-2df38d1dd8ec'::uuid
  WHERE topic = 'Number Systems'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'c147d17b-1f0c-5c6c-833e-36f13f54b5d8'::uuid
  WHERE topic = 'Networks'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '8f00de4b-9deb-58cb-aabf-72043f28b103'::uuid
  WHERE topic = 'Web Technology'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '70618ee6-07bd-546b-99ca-727de9827e34'::uuid
  WHERE topic = 'Databases'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '11298dc2-0595-5191-a531-089e3c61c1ae'::uuid
  WHERE topic = 'Logic'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'afeb51b3-8df5-56a6-b789-15b7521a9b10'::uuid
  WHERE topic = 'Operating Systems'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'bd0f8c96-e14f-5669-82e0-d53f68e591a0'::uuid
  WHERE topic = 'Computer Basics'
  AND subtopic_id IS NULL;

-- Economics
UPDATE questions
  SET subtopic_id = 'a67d2ad2-2072-5597-84e8-300690f50a77'::uuid
  WHERE topic = 'Macroeconomics'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '03e341e9-6856-5461-8f8a-4c87fea0851e'::uuid
  WHERE topic = 'Basic Concepts'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '21ded4a5-23c4-57a1-b18c-7d9b834e17b6'::uuid
  WHERE topic = 'Microeconomics'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '374bbf6d-7843-50f5-aa1e-9c22869fc2d4'::uuid
  WHERE topic = 'International Trade'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'dc410b22-9d4e-50d2-9d0c-c2f7c8c67c23'::uuid
  WHERE topic = 'Production Theory'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'fa9d8823-6d53-5a38-a53e-863569f9c3e8'::uuid
  WHERE topic = 'Money and Banking'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '545b6cbd-18cb-5e91-b3ee-9cdf7aa9997a'::uuid
  WHERE topic = 'Supply and Demand'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'bb20f950-c7df-5e77-a73b-cecc2be970ed'::uuid
  WHERE topic = 'Public Finance'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '3ed16b6c-1338-56bf-b874-66a7442fc3dd'::uuid
  WHERE topic = 'Economic Systems'
  AND subtopic_id IS NULL;

-- English Language
UPDATE questions
  SET subtopic_id = '79d03046-931b-54f9-a35e-093b02dda759'::uuid
  WHERE topic = 'Grammar'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'f5cee718-b143-51fa-affe-ee136d628f47'::uuid
  WHERE topic = 'Vocabulary'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'aebcc248-e21b-5819-9595-22bcbc6acab1'::uuid
  WHERE topic = 'Figures of Speech'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '45a24166-6b23-5669-bf80-fc7e25fd20d3'::uuid
  WHERE topic = 'Parts of Speech'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'ee5151a6-27e4-5916-a326-254a551a8297'::uuid
  WHERE topic = 'Literary Analysis'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '1b0adf3f-23a6-5a78-8bed-1868e3dc269b'::uuid
  WHERE topic = 'Sentence Structure'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '912eb60b-272a-54bc-a005-2203f52b3a9b'::uuid
  WHERE topic = 'Comprehension'
  AND subtopic_id IS NULL;

-- Mathematics
UPDATE questions
  SET subtopic_id = '2d95a774-bd6a-57c3-b1e1-99fddf142081'::uuid
  WHERE topic = 'Algebra'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'f1de6b68-347a-5f16-b712-efa75a1575bf'::uuid
  WHERE topic = 'Geometry'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '8bb9a6e9-1454-51b1-bb83-f4fcd692cb45'::uuid
  WHERE topic = 'Coordinate Geometry'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'e06b5309-2c2e-562f-ae47-acf6b61998fd'::uuid
  WHERE topic = 'Mensuration'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '2fdec0a9-0cc6-58b9-834e-2970a7291440'::uuid
  WHERE topic = 'Percentages'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '0e571903-cb21-5f0e-b8f1-4f7b2bb1cf1d'::uuid
  WHERE topic = 'Quadratic Equations'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'ec5dc194-def5-5685-910f-f57cbd075152'::uuid
  WHERE topic = 'Trigonometry'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '9858fc0a-f71e-57f6-b836-1d803425ecd5'::uuid
  WHERE topic = 'Logarithms'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '9d55d61b-963d-587e-bd4a-c7a43c5897dd'::uuid
  WHERE topic = 'Permutation and Combination'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '32882e75-ccae-5a28-9aac-52f87fe215f2'::uuid
  WHERE topic = 'Number Theory'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '08ea0cbd-2a03-5d0e-a2ed-4df49697e9dc'::uuid
  WHERE topic = 'Statistics'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '2e161b30-25cd-5e30-80cf-ea644421d878'::uuid
  WHERE topic = 'Functions'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '21910389-bc1d-5917-b46e-6ce6f0eaf71c'::uuid
  WHERE topic = 'Calculus'
  AND subtopic_id IS NULL;

-- Physics
UPDATE questions
  SET subtopic_id = 'b52f1682-a202-5fc7-a256-eb73ba31e34a'::uuid
  WHERE topic = 'Electricity'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'edfcf371-9c94-53da-b230-e79396703460'::uuid
  WHERE topic = 'Mechanics'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '9f3dfe4d-3776-515c-9ad4-bf4a2c7af1bf'::uuid
  WHERE topic = 'Optics'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '51e2609f-d62a-5cb2-b4c5-d48d039f5ae0'::uuid
  WHERE topic = 'Motion'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'ffdbacee-f095-5a3c-97a2-60dbf9f05b0a'::uuid
  WHERE topic = 'Waves'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'b6dc4073-fe77-566f-ba27-be7ba63f7099'::uuid
  WHERE topic = 'Electromagnetism'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '4734b803-6876-5d36-85e6-25c6b188ce66'::uuid
  WHERE topic = 'Energy'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'a85df9ef-62b6-5cae-82fb-4d17e944d9db'::uuid
  WHERE topic = 'Nuclear Physics'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = '65bf36d8-bfe2-56eb-afc6-4475467b355a'::uuid
  WHERE topic = 'Pressure'
  AND subtopic_id IS NULL;
UPDATE questions
  SET subtopic_id = 'd2677d0c-006d-51dd-888d-8297dabb47a0'::uuid
  WHERE topic = 'Modern Physics'
  AND subtopic_id IS NULL;

-- VERIFY
SELECT
  COUNT(*) FILTER (WHERE subtopic_id IS NOT NULL) AS linked,
  COUNT(*) FILTER (WHERE subtopic_id IS NULL)     AS still_unlinked,
  COUNT(*)                                        AS total
FROM questions;

-- Also confirm subtopics exist
SELECT 'topics' AS tbl, COUNT(*) FROM topics
UNION ALL SELECT 'subtopics', COUNT(*) FROM subtopics;

COMMIT;