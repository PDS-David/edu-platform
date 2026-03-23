-- ============================================================
-- EAC Learning Platform - Question Explanations
-- Generated from exact question text export
-- Run with: psql -U postgres -d edu_platform -f eac_explanations.sql
-- ============================================================

SET client_encoding = 'UTF8';

-- ============================================================
-- JAMB/UTME QUESTIONS
-- ============================================================

-- JAMB: Biology (BIO-101)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What is the role of ribosomes in a cell?',
   'BIO-101', 'Ribosomes are the sites of protein synthesis; they translate mRNA sequences into amino acid chains that form proteins.'),
  ('What is the powerhouse of the cell?',
   'BIO-101', 'Mitochondria carry out cellular respiration, producing ATP — the cell''s energy currency — earning them the title of powerhouse.'),
  ('Which blood group is the universal donor?',
   'BIO-101', 'Blood group O has no A or B surface antigens, so it cannot trigger an immune reaction in recipients of any blood group.'),
  ('What is the process by which plants make food?',
   'BIO-101', 'Photosynthesis uses sunlight, CO₂, and water to synthesise glucose and oxygen inside the chloroplasts of plant cells.'),
  ('How many chambers does the human heart have?',
   'BIO-101', 'The human heart has four chambers — two atria (upper) and two ventricles (lower) — which work together to circulate blood.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'JAMB/UTME'
  AND eb.id = q.exam_board_id;

-- JAMB: Business Studies (BUS-101)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What does SWOT stand for in business analysis?',
   'BUS-101', 'SWOT stands for Strengths, Weaknesses, Opportunities, and Threats — a framework for evaluating a business''s internal and external position.'),
  ('Explain the concept of economies of scale',
   'BUS-101', 'Economies of scale occur when a business reduces its cost per unit by increasing output, because fixed costs are spread over more units.'),
  ('What is the purpose of a balance sheet?',
   'BUS-101', 'A balance sheet shows a company''s assets, liabilities, and equity at a specific date, giving a snapshot of its financial position.'),
  ('What is the difference between a sole trader and a partnership?',
   'BUS-101', 'A sole trader is owned by one person who bears all risks alone; a partnership is owned by two or more people who share responsibility and profits.'),
  ('What type of business is owned by shareholders?',
   'BUS-101', 'A limited company (public or private) is owned by shareholders who have limited liability proportional to their investment.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'JAMB/UTME'
  AND eb.id = q.exam_board_id;

-- JAMB: Chemistry (CHEM-101)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What is the atomic number of Carbon?',
   'CHEM-101', 'The atomic number equals the number of protons; carbon has 6 protons, so its atomic number is 6.'),
  ('Which gas is produced when zinc reacts with dilute HCl?',
   'CHEM-101', 'Zinc displaces hydrogen: Zn + 2HCl → ZnCl₂ + H₂; the gas produced is hydrogen (H₂), which burns with a squeaky pop.'),
  ('What is the pH of a neutral solution at 25°C?',
   'CHEM-101', 'At 25°C, a neutral solution has equal [H⁺] and [OH⁻] concentrations, giving a pH of exactly 7.'),
  ('Balance this equation: Fe + O₂ → Fe₂O₃',
   'CHEM-101', 'The balanced equation is 4Fe + 3O₂ → 2Fe₂O₃; balancing ensures equal numbers of each atom on both sides.'),
  ('Calculate the molar mass of H₂SO₄',
   'CHEM-101', 'H₂SO₄: (2×1) + 32 + (4×16) = 2 + 32 + 64 = 98 g/mol; molar mass is the sum of atomic masses of all atoms in the formula.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'JAMB/UTME'
  AND eb.id = q.exam_board_id;

-- JAMB: Computer Science (CS-101)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What does CPU stand for?',
   'CS-101', 'CPU stands for Central Processing Unit — the primary chip that executes program instructions and performs all arithmetic and logic operations.'),
  ('What is the time complexity of binary search?',
   'CS-101', 'Binary search repeatedly halves the search space, giving a time complexity of O(log n) — far more efficient than linear search for sorted data.'),
  ('What does HTML stand for?',
   'CS-101', 'HTML stands for HyperText Markup Language — the standard language for creating and structuring content on web pages.'),
  ('What is the binary equivalent of decimal 10?',
   'CS-101', '10 in decimal = 8+2 = 1×2³ + 0×2² + 1×2¹ + 0×2⁰ = 1010 in binary.'),
  ('Which of these is NOT a programming language?',
   'CS-101', 'HTML is a markup language used to structure web content, not a programming language; it has no logic, loops, or conditionals.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'JAMB/UTME'
  AND eb.id = q.exam_board_id;

-- JAMB: Economics (ECON-101)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('Explain the concept of price elasticity of demand',
   'ECON-101', 'Price elasticity of demand measures how much quantity demanded changes in response to a price change; elastic goods (PED > 1) see large demand shifts while inelastic goods (PED < 1) see small ones.'),
  ('What does GDP stand for?',
   'ECON-101', 'GDP stands for Gross Domestic Product — the total monetary value of all goods and services produced within a country in a given period.'),
  ('Which of the following is an example of a public good?',
   'ECON-101', 'A public good is non-excludable and non-rivalrous (e.g. street lighting); once provided, no one can be excluded and one person''s use does not reduce availability for others.'),
  ('When supply increases and demand remains constant, price will?',
   'ECON-101', 'When supply rises with no change in demand, the supply curve shifts right, creating a surplus at the old price and pushing the equilibrium price down.'),
  ('What is opportunity cost?',
   'ECON-101', 'Opportunity cost is the value of the next best alternative forgone when making a decision — the true cost of any economic choice.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'JAMB/UTME'
  AND eb.id = q.exam_board_id;

-- JAMB: English Language (ENG-101)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('Choose the word that best completes: "She was _____ by the complexity of the problem"',
   'ENG-101', 'The correct word is "baffled" or "perplexed" — both mean confused or puzzled, which fits the context of encountering a complex problem.'),
  ('What is the plural of "phenomenon"?',
   'ENG-101', 'Phenomenon is of Greek origin; its correct plural is "phenomena" — irregular plurals like this must be memorised.'),
  ('Which of these sentences is grammatically correct?',
   'ENG-101', 'A grammatically correct sentence must have subject-verb agreement, correct tense, and proper punctuation; identifying errors requires checking each of these elements.'),
  ('Identify the figure of speech: "The wind whispered through the trees"',
   'ENG-101', 'Giving the wind the human ability to whisper is personification — attributing human qualities or actions to a non-human thing.'),
  ('Choose the word closest in meaning to "benevolent"',
   'ENG-101', 'Benevolent means kind and generous; its closest synonym is "charitable" or "philanthropic" — all describe a disposition to do good.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'JAMB/UTME'
  AND eb.id = q.exam_board_id;

-- JAMB: Mathematics (MATH-101)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What is the value of log₁₀(1000)?',
   'MATH-101', 'log₁₀(1000) asks: to what power must 10 be raised to get 1000? Since 10³ = 1000, the answer is 3.'),
  ('If 2x + 3 = 11, what is the value of x?',
   'MATH-101', 'Subtract 3 from both sides: 2x = 8; divide by 2: x = 4.'),
  ('If sin θ = 3/5, find cos θ',
   'MATH-101', 'Using the identity sin²θ + cos²θ = 1: cos²θ = 1 − 9/25 = 16/25, so cos θ = 4/5.'),
  ('Solve for x: x² - 5x + 6 = 0',
   'MATH-101', 'Factorising: (x − 2)(x − 3) = 0, giving x = 2 or x = 3; these are the two values that satisfy the equation.'),
  ('A circle has radius 7cm. What is its area? (π = 22/7)',
   'MATH-101', 'Area = πr² = (22/7) × 7² = (22/7) × 49 = 154 cm².')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'JAMB/UTME'
  AND eb.id = q.exam_board_id;

-- JAMB: Physics (PHY-101)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('A body moves with velocity 20 m/s for 5 seconds. What distance does it cover?',
   'PHY-101', 'Distance = speed × time = 20 × 5 = 100 m; this applies when velocity is constant throughout the motion.'),
  ('What is the SI unit of force?',
   'PHY-101', 'Force = mass × acceleration; with mass in kg and acceleration in m/s², the SI unit of force is the Newton (N).'),
  ('What is the refractive index of a medium if light travels at 2×10⁸ m/s in it?',
   'PHY-101', 'Refractive index n = c/v = (3×10⁸)/(2×10⁸) = 1.5; it measures how much light slows down when entering a medium.'),
  ('Calculate the kinetic energy of a 2kg object moving at 10 m/s',
   'PHY-101', 'KE = ½mv² = ½ × 2 × 10² = ½ × 2 × 100 = 100 J.'),
  ('What type of wave is sound?',
   'PHY-101', 'Sound travels as compressions and rarefactions in the direction of propagation, making it a longitudinal mechanical wave.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'JAMB/UTME'
  AND eb.id = q.exam_board_id;


-- ============================================================
-- NECO QUESTIONS
-- ============================================================

-- NECO: Biology (BIO-101-NECO)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('Explain the process of DNA replication',
   'BIO-101-NECO', 'DNA replication is semi-conservative: the double helix unwinds, each strand acts as a template, and complementary bases are added by DNA polymerase, producing two identical daughter strands.'),
  ('What is the basic unit of life?',
   'BIO-101-NECO', 'The cell is the basic structural and functional unit of all living organisms; all life processes occur within cells.'),
  ('Which organ produces insulin?',
   'BIO-101-NECO', 'The pancreas contains beta cells in the islets of Langerhans that secrete insulin to lower blood glucose levels after meals.'),
  ('What is the difference between aerobic and anaerobic respiration?',
   'BIO-101-NECO', 'Aerobic respiration uses oxygen to fully oxidise glucose, producing 38 ATP; anaerobic respiration occurs without oxygen, producing only 2 ATP and lactic acid or ethanol.'),
  ('What is ecological succession?',
   'BIO-101-NECO', 'Ecological succession is the gradual process by which an ecosystem changes over time, with communities of organisms replacing one another until a stable climax community is reached.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'NECO'
  AND eb.id = q.exam_board_id;

-- NECO: Business Studies (BUS-101-NECO)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What is the difference between gross profit and net profit?',
   'BUS-101-NECO', 'Gross profit = Revenue − Cost of Goods Sold; net profit deducts all other operating expenses (rent, wages, taxes) from gross profit.'),
  ('What is a business plan?',
   'BUS-101-NECO', 'A business plan is a written document outlining a company''s goals, strategies, market analysis, and financial projections, used to guide operations and attract investors.'),
  ('Explain the importance of record keeping in business',
   'BUS-101-NECO', 'Accurate records enable a business to track income and expenses, meet tax obligations, make informed decisions, and detect fraud or errors early.'),
  ('What is working capital?',
   'BUS-101-NECO', 'Working capital = Current Assets − Current Liabilities; it measures whether a business can meet its short-term financial obligations.'),
  ('What are the functions of management?',
   'BUS-101-NECO', 'The four core management functions are Planning, Organising, Leading, and Controlling (POLC) — together they ensure organisational goals are achieved efficiently.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'NECO'
  AND eb.id = q.exam_board_id;

-- NECO: Chemistry (CHEM-101-NECO)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('Explain Le Chatelier''s principle with an example',
   'CHEM-101-NECO', 'Le Chatelier''s principle states that if a stress (pressure, temperature, concentration) is applied to a system at equilibrium, it shifts to oppose that stress; e.g. increasing pressure in N₂ + 3H₂ ⇌ 2NH₃ shifts the equilibrium right.'),
  ('What is the difference between an atom and a molecule?',
   'CHEM-101-NECO', 'An atom is the smallest unit of an element; a molecule is formed when two or more atoms bond chemically, e.g. O₂ is a molecule of two oxygen atoms.'),
  ('What type of reaction is: acid + base → salt + water?',
   'CHEM-101-NECO', 'This is a neutralisation reaction; an acid and a base react to form a salt and water, e.g. HCl + NaOH → NaCl + H₂O.'),
  ('Which element has symbol Fe?',
   'CHEM-101-NECO', 'Fe is the symbol for iron, derived from its Latin name "Ferrum"; it is a transition metal in group 8, period 4 of the periodic table.'),
  ('What is the chemical formula of water?',
   'CHEM-101-NECO', 'Each water molecule has two hydrogen atoms covalently bonded to one oxygen atom, giving the formula H₂O.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'NECO'
  AND eb.id = q.exam_board_id;

-- NECO: Computer Science (CS-101-NECO)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What is the difference between hardware and software?',
   'CS-101-NECO', 'Hardware refers to the physical components of a computer (CPU, keyboard, RAM); software refers to the programs and data that run on that hardware.'),
  ('What does LAN stand for?',
   'CS-101-NECO', 'LAN stands for Local Area Network — a network connecting computers within a limited area such as a school, office, or building.'),
  ('What is an operating system?',
   'CS-101-NECO', 'An operating system (e.g. Windows, Linux) is system software that manages hardware resources and provides a platform for application programs to run.'),
  ('Explain how the internet works',
   'CS-101-NECO', 'The internet is a global network of computers communicating via standardised protocols (TCP/IP); data is broken into packets, routed across networks, and reassembled at the destination.'),
  ('What is a recursive function?',
   'CS-101-NECO', 'A recursive function is one that calls itself within its own definition to solve a smaller instance of the same problem, terminating when a base case is reached.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'NECO'
  AND eb.id = q.exam_board_id;

-- NECO: Economics (ECON-101-NECO)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What are the factors of production?',
   'ECON-101-NECO', 'The four factors of production are Land, Labour, Capital, and Entrepreneurship — the resources combined to produce goods and services.'),
  ('What is a budget deficit?',
   'ECON-101-NECO', 'A budget deficit occurs when a government''s total expenditure exceeds its total revenue in a given fiscal year, requiring borrowing to cover the shortfall.'),
  ('Analyse the impact of foreign direct investment on a developing economy',
   'ECON-101-NECO', 'FDI brings capital, technology, and employment to developing economies, boosting growth; however it can also lead to profit repatriation and reduced local business competitiveness.'),
  ('Explain demand-pull inflation',
   'ECON-101-NECO', 'Demand-pull inflation occurs when aggregate demand in an economy exceeds aggregate supply, causing prices to rise as "too much money chases too few goods."'),
  ('What is the difference between fixed and variable costs?',
   'ECON-101-NECO', 'Fixed costs (rent, salaries) remain constant regardless of output level; variable costs (raw materials, utilities) rise and fall directly with production volume.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'NECO'
  AND eb.id = q.exam_board_id;

-- NECO: English Language (ENG-101-NECO)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What is a metaphor? Give an example',
   'ENG-101-NECO', 'A metaphor directly equates two unlike things without using "like" or "as", e.g. "Life is a journey" — life is compared to a journey to suggest it involves progress and challenges.'),
  ('Write a summary of a given passage in your own words',
   'ENG-101-NECO', 'A good summary identifies the main idea and key supporting points of a passage, expressed concisely in the writer''s own words without including personal opinion.'),
  ('What is a noun?',
   'ENG-101-NECO', 'A noun is a word that names a person, place, thing, or idea (e.g. teacher, Lagos, book, freedom); it functions as the subject or object in a sentence.'),
  ('Identify the subject in: "The tall man ran quickly"',
   'ENG-101-NECO', 'The subject is the noun phrase that performs the action; "The tall man" is the subject because it is the one doing the running.'),
  ('What is the difference between "affect" and "effect"?',
   'ENG-101-NECO', '"Affect" is usually a verb meaning to influence (e.g. "Rain affects mood"); "effect" is usually a noun meaning the result (e.g. "The effect was positive").')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'NECO'
  AND eb.id = q.exam_board_id;

-- NECO: Mathematics (MATH-101-NECO)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('Find the equation of a line with slope 2 passing through (1, 3)',
   'MATH-101-NECO', 'Using y − y₁ = m(x − x₁): y − 3 = 2(x − 1) → y = 2x + 1; substitute the point and slope into the point-slope form.'),
  ('Solve: 3x - 7 = 2x + 4',
   'MATH-101-NECO', 'Subtract 2x from both sides: x − 7 = 4; add 7: x = 11.'),
  ('What is the LCM of 12 and 18?',
   'MATH-101-NECO', '12 = 2²×3, 18 = 2×3²; LCM takes the highest power of each prime: 2²×3² = 4×9 = 36.'),
  ('Find the area of a rectangle with length 8cm and width 5cm',
   'MATH-101-NECO', 'Area of a rectangle = length × width = 8 × 5 = 40 cm².'),
  ('What is the median of: 3, 5, 7, 9, 11?',
   'MATH-101-NECO', 'The data is already sorted; with 5 values the median is the middle (3rd) value, which is 7.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'NECO'
  AND eb.id = q.exam_board_id;

-- NECO: Physics (PHY-101-NECO)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What is the formula for work done?',
   'PHY-101-NECO', 'Work = Force × Distance (W = Fd); work is done when a force causes an object to move in the direction of that force, measured in Joules.'),
  ('What is the speed of light in vacuum?',
   'PHY-101-NECO', 'The speed of light in a vacuum is approximately 3 × 10⁸ m/s, denoted c — a fundamental constant used in relativity and optics.'),
  ('Explain the photoelectric effect',
   'PHY-101-NECO', 'The photoelectric effect is the emission of electrons from a metal surface when light of sufficient frequency strikes it; it proved that light behaves as discrete photons (particles), not just waves.'),
  ('A stone is dropped from a height of 80m. How long does it take to reach the ground? (g=10m/s²)',
   'PHY-101-NECO', 'Using s = ½gt²: 80 = ½ × 10 × t² → t² = 16 → t = 4 seconds.'),
  ('What happens to resistance when temperature increases in a conductor?',
   'PHY-101-NECO', 'As temperature rises, atoms vibrate more vigorously, increasing collisions with conduction electrons and therefore increasing electrical resistance.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'NECO'
  AND eb.id = q.exam_board_id;


-- ============================================================
-- O-LEVELS QUESTIONS
-- ============================================================

-- O-Levels: Biology (BIO-101-OLEVEL)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('Describe the structure and function of the kidney',
   'BIO-101-OLEVEL', 'The kidney contains millions of nephrons that filter blood, reabsorb useful substances, and excrete waste as urine; it regulates water balance and blood pressure.'),
  ('What is the function of chlorophyll?',
   'BIO-101-OLEVEL', 'Chlorophyll is the green pigment in chloroplasts that absorbs light energy (mainly red and blue wavelengths) to power the light-dependent reactions of photosynthesis.'),
  ('What is the difference between veins and arteries?',
   'BIO-101-OLEVEL', 'Arteries carry oxygenated blood away from the heart under high pressure with thick elastic walls; veins carry deoxygenated blood to the heart under low pressure with valves to prevent backflow.'),
  ('Explain the nitrogen cycle',
   'BIO-101-OLEVEL', 'The nitrogen cycle converts atmospheric nitrogen into usable forms: nitrogen-fixing bacteria convert N₂ to ammonia, nitrifying bacteria convert it to nitrates absorbed by plants, and denitrifying bacteria return N₂ to the atmosphere.'),
  ('What is the difference between mitosis and meiosis?',
   'BIO-101-OLEVEL', 'Mitosis produces two genetically identical diploid cells for growth and repair; meiosis produces four genetically unique haploid cells for sexual reproduction.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'O-Levels'
  AND eb.id = q.exam_board_id;

-- O-Levels: Business Studies (BUS-101-OLEVEL)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('Analyse the impact of technology on modern business operations',
   'BUS-101-OLEVEL', 'Technology improves efficiency through automation, enables global reach via e-commerce, enhances communication, and reduces costs — though it also requires investment and can displace workers.'),
  ('What is the difference between a product and a service?',
   'BUS-101-OLEVEL', 'A product is a tangible physical item (e.g. a phone) that can be stored and resold; a service is an intangible activity (e.g. a haircut) consumed at the point of delivery.'),
  ('What is cash flow?',
   'BUS-101-OLEVEL', 'Cash flow is the movement of money in and out of a business; positive cash flow means more money coming in than going out, essential for day-to-day operations.'),
  ('What is the role of a manager in a business?',
   'BUS-101-OLEVEL', 'A manager plans objectives, organises resources, leads and motivates staff, and controls performance to ensure the business achieves its goals.'),
  ('What is a break-even point?',
   'BUS-101-OLEVEL', 'The break-even point is the level of output where total revenue equals total costs; below it the business makes a loss, above it a profit.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'O-Levels'
  AND eb.id = q.exam_board_id;

-- O-Levels: Chemistry (CHEM-101-OLEVEL)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What is a covalent bond?',
   'CHEM-101-OLEVEL', 'A covalent bond forms when two non-metal atoms share one or more pairs of electrons to achieve a stable full outer shell, e.g. H₂O and CO₂.'),
  ('Describe the industrial production of ammonia (Haber Process)',
   'CHEM-101-OLEVEL', 'The Haber Process combines nitrogen (from air) and hydrogen (from natural gas) at 450°C, 200 atm, using an iron catalyst: N₂ + 3H₂ ⇌ 2NH₃; conditions are optimised for yield and rate.'),
  ('What is chromatography used for?',
   'CHEM-101-OLEVEL', 'Chromatography separates mixtures based on differing affinities of components for a stationary and a mobile phase; it is used to identify substances and test for purity.'),
  ('What gas is produced when copper reacts with concentrated H₂SO₄?',
   'CHEM-101-OLEVEL', 'Copper reacts with hot concentrated sulphuric acid: Cu + 2H₂SO₄ → CuSO₄ + SO₂ + 2H₂O; the gas produced is sulphur dioxide (SO₂).'),
  ('What is the difference between an element and a compound?',
   'CHEM-101-OLEVEL', 'An element contains only one type of atom (e.g. O₂); a compound contains two or more different elements chemically bonded in fixed ratios (e.g. H₂O).')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'O-Levels'
  AND eb.id = q.exam_board_id;

-- O-Levels: Computer Science (CS-101-OLEVEL)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What is pseudocode?',
   'CS-101-OLEVEL', 'Pseudocode is an informal, language-independent description of an algorithm using plain English and basic programming constructs; it helps plan logic before writing actual code.'),
  ('What is the difference between ROM and RAM?',
   'CS-101-OLEVEL', 'ROM (Read-Only Memory) is non-volatile and stores permanent firmware; RAM (Random Access Memory) is volatile, temporary, and holds data the CPU is actively using.'),
  ('What is a flowchart?',
   'CS-101-OLEVEL', 'A flowchart is a diagram using standardised symbols to represent the steps and decision points of an algorithm or process, making it easy to visualise program logic.'),
  ('Design an algorithm to sort a list of numbers',
   'CS-101-OLEVEL', 'A simple sort algorithm (e.g. bubble sort) repeatedly compares adjacent elements and swaps them if out of order, continuing until no swaps are needed and the list is sorted.'),
  ('What is a Boolean expression?',
   'CS-101-OLEVEL', 'A Boolean expression evaluates to either TRUE or FALSE using logical operators (AND, OR, NOT); it is the foundation of conditions and decision-making in programming.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'O-Levels'
  AND eb.id = q.exam_board_id;

-- O-Levels: Economics (ECON-101-OLEVEL)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('Explain the concept of comparative advantage',
   'ECON-101-OLEVEL', 'Comparative advantage means a country should specialise in producing goods at which it has the lowest opportunity cost, then trade — this maximises total output and benefits all trading parties.'),
  ('What is a market economy?',
   'ECON-101-OLEVEL', 'A market economy allocates resources through the price mechanism (supply and demand) with minimal government intervention; private ownership and profit motive drive production decisions.'),
  ('Describe the role of the central bank in an economy',
   'ECON-101-OLEVEL', 'A central bank controls monetary policy (interest rates, money supply), acts as lender of last resort to commercial banks, issues currency, and regulates the banking system.'),
  ('What causes unemployment?',
   'ECON-101-OLEVEL', 'Unemployment can be caused by lack of demand (cyclical), structural changes in the economy, workers transitioning between jobs (frictional), or regional mismatches between jobs and workers.'),
  ('What is the difference between needs and wants?',
   'ECON-101-OLEVEL', 'Needs are essential for survival (food, shelter, clothing); wants are desires beyond basic needs (luxury goods, entertainment) — the distinction underpins consumer behaviour theory.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'O-Levels'
  AND eb.id = q.exam_board_id;

-- O-Levels: English Language (ENG-101-OLEVEL)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What is the difference between denotation and connotation?',
   'ENG-101-OLEVEL', 'Denotation is a word''s literal dictionary meaning; connotation is the emotional or cultural associations it carries, e.g. "home" denotes a dwelling but connotes warmth and safety.'),
  ('Analyse the use of imagery in a given poem',
   'ENG-101-OLEVEL', 'Imagery uses vivid sensory language (visual, auditory, tactile) to create mental pictures; analysing it involves identifying the image, the sense it appeals to, and the effect on the reader.'),
  ('What is an adjective?',
   'ENG-101-OLEVEL', 'An adjective is a word that modifies a noun by describing its quality, quantity, or state (e.g. "tall," "three," "happy"); it adds detail to the noun it qualifies.'),
  ('Change to indirect speech: He said "I am tired"',
   'ENG-101-OLEVEL', 'In indirect speech, pronouns and tenses shift: He said that he was tired — "I" becomes "he" and the present tense "am" shifts to the past tense "was".'),
  ('What is the tone of a piece of writing?',
   'ENG-101-OLEVEL', 'Tone is the writer''s attitude toward the subject or audience, conveyed through word choice, sentence structure, and style — e.g. formal, sarcastic, sympathetic, or urgent.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'O-Levels'
  AND eb.id = q.exam_board_id;

-- O-Levels: Mathematics (MATH-101-OLEVEL)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('Find the volume of a cylinder with radius 4cm and height 10cm',
   'MATH-101-OLEVEL', 'Volume = πr²h = π × 4² × 10 = 160π ≈ 502.7 cm³; the formula multiplies the circular cross-section area by the height.'),
  ('What is 15% of 200?',
   'MATH-101-OLEVEL', '15% of 200 = (15/100) × 200 = 0.15 × 200 = 30.'),
  ('Expand: (x + 3)(x - 2)',
   'MATH-101-OLEVEL', 'Using FOIL: x² − 2x + 3x − 6 = x² + x − 6; multiply each term in the first bracket by each term in the second.'),
  ('If f(x) = 2x² - 3, find f(3)',
   'MATH-101-OLEVEL', 'Substitute x = 3: f(3) = 2(3²) − 3 = 2(9) − 3 = 18 − 3 = 15.'),
  ('Prove that the angles in a quadrilateral sum to 360°',
   'MATH-101-OLEVEL', 'Any quadrilateral can be divided into two triangles by a diagonal; each triangle''s angles sum to 180°, so the quadrilateral''s angles sum to 2 × 180° = 360°.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'O-Levels'
  AND eb.id = q.exam_board_id;

-- O-Levels: Physics (PHY-101-OLEVEL)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What is nuclear fission? Give an example of its application',
   'PHY-101-OLEVEL', 'Nuclear fission is the splitting of a heavy nucleus (e.g. uranium-235) into smaller nuclei, releasing enormous energy; its main application is in nuclear power plants and atomic bombs.'),
  ('Calculate the equivalent resistance of two 6Ω resistors in parallel',
   'PHY-101-OLEVEL', '1/R = 1/6 + 1/6 = 2/6 = 1/3, so R = 3Ω; parallel resistors always give a combined resistance less than the smallest individual resistor.'),
  ('What is total internal reflection?',
   'PHY-101-OLEVEL', 'Total internal reflection occurs when light travelling from a denser to a less dense medium hits the boundary at an angle greater than the critical angle, reflecting entirely back — the principle behind optical fibres.'),
  ('What is the difference between mass and weight?',
   'PHY-101-OLEVEL', 'Mass is the amount of matter in an object (kg) and is constant everywhere; weight is the gravitational force on that mass (W = mg, in Newtons) and varies with gravitational field strength.'),
  ('What is the formula for Ohm''s law?',
   'PHY-101-OLEVEL', 'Ohm''s Law states V = IR, where V is voltage (volts), I is current (amperes), and R is resistance (ohms); it describes the relationship between these three quantities in a conductor.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'O-Levels'
  AND eb.id = q.exam_board_id;


-- ============================================================
-- WAEC QUESTIONS
-- ============================================================

-- WAEC: Biology (BIO-101-WAEC)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What is the role of auxins in plant growth?',
   'BIO-101-WAEC', 'Auxins are plant hormones produced at shoot tips that promote cell elongation; they cause phototropism by accumulating on the shaded side of a shoot, making it grow toward light.'),
  ('Describe the process of meiosis',
   'BIO-101-WAEC', 'Meiosis involves two divisions: Meiosis I separates homologous chromosome pairs, and Meiosis II separates sister chromatids — producing four haploid cells with genetic variation through crossing over.'),
  ('What is osmosis?',
   'BIO-101-WAEC', 'Osmosis is the passive movement of water molecules across a semi-permeable membrane from a region of lower solute concentration (higher water potential) to higher solute concentration.'),
  ('What is the function of the nephron?',
   'BIO-101-WAEC', 'The nephron is the functional unit of the kidney; it filters blood under pressure, reabsorbs glucose, water, and salts, and secretes waste products to produce urine.'),
  ('Name the enzyme that breaks down starch in saliva',
   'BIO-101-WAEC', 'Salivary amylase (ptyalin) is the enzyme in saliva that begins carbohydrate digestion by breaking starch into maltose in the mouth.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'WAEC'
  AND eb.id = q.exam_board_id;

-- WAEC: Business Studies (BUS-101-WAEC)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What are the 4 Ps of marketing?',
   'BUS-101-WAEC', 'The 4 Ps are Product, Price, Place, and Promotion — the marketing mix elements a business controls to meet customer needs and achieve marketing objectives.'),
  ('What is the difference between profit and revenue?',
   'BUS-101-WAEC', 'Revenue is the total income from sales before any costs are deducted; profit is what remains after all costs are subtracted from revenue (Profit = Revenue − Costs).'),
  ('What is marketing?',
   'BUS-101-WAEC', 'Marketing is the process of identifying customer needs and creating, communicating, and delivering products or services that satisfy those needs profitably.'),
  ('What is a limited liability company?',
   'BUS-101-WAEC', 'A limited liability company is a legal entity where shareholders'' personal financial liability is limited to the amount they invested; personal assets are protected if the company fails.'),
  ('Explain the role of entrepreneurship in economic development',
   'BUS-101-WAEC', 'Entrepreneurs create businesses, generate employment, drive innovation, and stimulate competition — contributing to GDP growth, tax revenues, and raising living standards.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'WAEC'
  AND eb.id = q.exam_board_id;

-- WAEC: Chemistry (CHEM-101-WAEC)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('Which of these is an oxidising agent: H₂, O₂, CO, N₂?',
   'CHEM-101-WAEC', 'O₂ is the oxidising agent; it accepts electrons from other substances (causing them to oxidise) and is itself reduced during reactions such as combustion.'),
  ('What type of bond exists in NaCl?',
   'CHEM-101-WAEC', 'NaCl contains an ionic bond; sodium donates one electron to chlorine, forming Na⁺ and Cl⁻ ions held together by electrostatic attraction.'),
  ('What is Avogadro''s number?',
   'CHEM-101-WAEC', 'Avogadro''s number is 6.022 × 10²³ — the number of particles (atoms, molecules, or ions) in one mole of any substance.'),
  ('Calculate the concentration of a solution containing 4g of NaOH in 500cm³ of water',
   'CHEM-101-WAEC', 'Moles of NaOH = 4/40 = 0.1 mol; volume = 500 cm³ = 0.5 L; concentration = 0.1/0.5 = 0.2 mol/L (0.2 M).'),
  ('Describe the process of electrolysis of brine',
   'CHEM-101-WAEC', 'Electrolysis of brine (NaCl solution) produces chlorine gas at the anode, hydrogen gas at the cathode, and sodium hydroxide solution — all industrially important products.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'WAEC'
  AND eb.id = q.exam_board_id;

-- WAEC: Computer Science (CS-101-WAEC)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('Describe how a bubble sort algorithm works',
   'CS-101-WAEC', 'Bubble sort repeatedly steps through a list, compares adjacent elements, and swaps them if they are in the wrong order; this process repeats until no swaps occur and the list is sorted.'),
  ('What is RAM used for?',
   'CS-101-WAEC', 'RAM (Random Access Memory) is volatile primary storage that temporarily holds the operating system, running applications, and data currently in use by the CPU.'),
  ('What is the difference between a compiler and an interpreter?',
   'CS-101-WAEC', 'A compiler translates the entire program into machine code before execution; an interpreter translates and executes code line by line — compilers are faster at runtime, interpreters are easier to debug.'),
  ('Convert 255 from decimal to binary',
   'CS-101-WAEC', '255 = 128+64+32+16+8+4+2+1 = all eight bits set = 11111111 in binary; each bit position represents a power of 2.'),
  ('What is a primary key in a database?',
   'CS-101-WAEC', 'A primary key is a unique identifier for each record in a database table; it ensures no two rows are identical and is used to establish relationships between tables.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'WAEC'
  AND eb.id = q.exam_board_id;

-- WAEC: Economics (ECON-101-WAEC)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('Explain how the multiplier effect works in an economy',
   'ECON-101-WAEC', 'The multiplier effect means an initial injection of spending (e.g. government investment) generates a larger final increase in GDP, because each round of spending becomes income for others who then spend again.'),
  ('What is inflation?',
   'ECON-101-WAEC', 'Inflation is a sustained rise in the general price level of goods and services over time, which erodes the purchasing power of money.'),
  ('What is the law of diminishing returns?',
   'ECON-101-WAEC', 'The law of diminishing returns states that adding more of one variable input (e.g. labour) to fixed inputs eventually yields smaller and smaller increases in output.'),
  ('Differentiate between microeconomics and macroeconomics',
   'ECON-101-WAEC', 'Microeconomics studies the decisions of individual consumers and firms; macroeconomics studies the economy as a whole, including GDP, inflation, unemployment, and monetary policy.'),
  ('What are the functions of money?',
   'ECON-101-WAEC', 'Money serves four functions: medium of exchange (facilitates trade), unit of account (measures value), store of value (holds purchasing power over time), and standard of deferred payment.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'WAEC'
  AND eb.id = q.exam_board_id;

-- WAEC: English Language (ENG-101-WAEC)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('What is the difference between a phrase and a clause?',
   'ENG-101-WAEC', 'A phrase is a group of words without a subject-verb pair (e.g. "in the morning"); a clause contains a subject and a verb (e.g. "when morning comes").'),
  ('What is a simile?',
   'ENG-101-WAEC', 'A simile compares two unlike things using "like" or "as" (e.g. "brave as a lion"); it makes descriptions vivid by drawing an explicit comparison.'),
  ('Choose the correct preposition: She is good ___ mathematics',
   'ENG-101-WAEC', 'The correct preposition is "at" — "good at" is the standard collocation in English when describing someone''s ability in a subject.'),
  ('What is the passive voice of: "The cat chased the mouse"?',
   'ENG-101-WAEC', 'In passive voice the object becomes the subject: "The mouse was chased by the cat" — the focus shifts from the doer (cat) to the receiver of the action (mouse).'),
  ('Identify the clause type: "Although it was raining, we went out"',
   'ENG-101-WAEC', '"Although it was raining" is a subordinate (adverbial) clause of concession; "we went out" is the main clause — the subordinate clause cannot stand alone.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'WAEC'
  AND eb.id = q.exam_board_id;

-- WAEC: Mathematics (MATH-101-WAEC)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('Simplify: 3(2x - 4) + 2(x + 5)',
   'MATH-101-WAEC', 'Expand: 6x − 12 + 2x + 10 = 8x − 2; distribute each bracket then collect like terms.'),
  ('Find the gradient of the line joining (2,3) and (4,7)',
   'MATH-101-WAEC', 'Gradient = (y₂ − y₁)/(x₂ − x₁) = (7 − 3)/(4 − 2) = 4/2 = 2.'),
  ('The sum of angles in a triangle is?',
   'MATH-101-WAEC', 'The interior angles of any triangle always sum to 180°; this is a fundamental theorem of Euclidean geometry provable by parallel line properties.'),
  ('Evaluate: ⁵C₂',
   'MATH-101-WAEC', '⁵C₂ = 5! / (2! × 3!) = (5 × 4) / (2 × 1) = 10; it counts the number of ways to choose 2 items from 5 without regard to order.'),
  ('Differentiate y = 3x² + 2x - 5 with respect to x',
   'MATH-101-WAEC', 'Using the power rule: dy/dx = 6x + 2; differentiate each term — the constant −5 disappears, and each power term reduces by one.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'WAEC'
  AND eb.id = q.exam_board_id;

-- WAEC: Physics (PHY-101-WAEC)
UPDATE questions q
SET explanation = e.explanation
FROM subjects s, exam_boards eb, (VALUES
  ('State Newton''s first law of motion',
   'PHY-101-WAEC', 'Newton''s First Law states that an object remains at rest or in uniform motion unless acted upon by an external net force — this property is called inertia.'),
  ('Calculate the pressure at the bottom of a 10m deep water column (density = 1000 kg/m³)',
   'PHY-101-WAEC', 'Pressure = ρgh = 1000 × 10 × 10 = 100,000 Pa (100 kPa); pressure increases with depth due to the weight of fluid above.'),
  ('A transformer has 200 primary turns and 1000 secondary turns. If primary voltage is 50V, find secondary voltage',
   'PHY-101-WAEC', 'V₂/V₁ = N₂/N₁ → V₂ = 50 × (1000/200) = 50 × 5 = 250V; a step-up transformer increases voltage in proportion to the turns ratio.'),
  ('What is the frequency of a wave with period 0.02s?',
   'PHY-101-WAEC', 'Frequency = 1/Period = 1/0.02 = 50 Hz; frequency and period are reciprocals of each other.'),
  ('What is the unit of electrical resistance?',
   'PHY-101-WAEC', 'Electrical resistance is measured in Ohms (Ω), defined by Ohm''s Law as the ratio of voltage to current: R = V/I.')
) AS e(question_text, subject_code, explanation)
WHERE q.question_text = e.question_text
  AND s.code = e.subject_code
  AND s.id = q.subject_id_uuid
  AND eb.name = 'WAEC'
  AND eb.id = q.exam_board_id;


-- ============================================================
-- VERIFICATION QUERY — uncomment and run after updates
-- ============================================================
-- SELECT
--   eb.name AS exam_board,
--   s.code  AS subject_code,
--   COUNT(*)                         AS total_questions,
--   COUNT(q.explanation)             AS with_explanation,
--   COUNT(*) - COUNT(q.explanation)  AS still_null
-- FROM questions q
-- JOIN subjects    s  ON s.id  = q.subject_id_uuid
-- JOIN exam_boards eb ON eb.id = q.exam_board_id
-- WHERE eb.name IN ('JAMB/UTME','WAEC','NECO','O-Levels')
-- GROUP BY eb.name, s.code
-- ORDER BY eb.name, s.code;
