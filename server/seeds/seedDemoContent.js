'use strict';
/**
 * server/seeds/seedDemoContent.js
 *
 * Seeds the live database with:
 *   1. JAMB & WAEC exam boards (idempotent)
 *   2. Core subjects: Biology, Chemistry, Physics, Mathematics, English
 *   3. Topics + Subtopics per subject (real Nigerian syllabus)
 *   4. 5 MCQ practice questions per subtopic (first 2 subtopics per subject)
 *   5. 2 text-based learning resources per subject linked to first subtopic
 *   6. Assigns all resources to all active students
 *
 * Safe to run multiple times — skips already-existing records.
 * Run: node server/seeds/seedDemoContent.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Sequelize, QueryTypes } = require('sequelize');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

const sequelize = new Sequelize(DB_URL, {
  dialect: 'postgres',
  dialectOptions: process.env.DB_SSL === 'false'
    ? {}
    : { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});



// ─── Curriculum ───────────────────────────────────────────────────────────────
const SUBJECTS = [
  {
    name: 'Biology', code: 'BIO-101', icon_emoji: '🧬',
    topics: [
      { name: 'Cell Biology', subtopics: ['Cell Structure and Organisation', 'Cell Membrane and Transport', 'Cell Division: Mitosis and Meiosis'] },
      { name: 'Genetics and Heredity', subtopics: ['Mendelian Genetics', 'DNA Structure and Replication', 'Gene Expression and Mutation'] },
      { name: 'Ecology and Environment', subtopics: ['Ecosystems and Food Chains', 'Population Dynamics', 'Conservation and Pollution'] },
    ],
  },
  {
    name: 'Chemistry', code: 'CHEM-101', icon_emoji: '⚗️',
    topics: [
      { name: 'Atomic Structure', subtopics: ['Atomic Models and Electronic Configuration', 'Periodic Table and Periodicity', 'Chemical Bonding'] },
      { name: 'Organic Chemistry', subtopics: ['Hydrocarbons: Alkanes, Alkenes, Alkynes', 'Functional Groups and Reactions', 'Polymers and Petrochemicals'] },
      { name: 'Electrochemistry', subtopics: ["Electrolysis and Faraday's Laws", 'Electrochemical Cells', 'Corrosion and Prevention'] },
    ],
  },
  {
    name: 'Physics', code: 'PHY-101', icon_emoji: '⚡',
    topics: [
      { name: 'Mechanics', subtopics: ['Motion, Velocity and Acceleration', "Newton's Laws of Motion", 'Work, Energy and Power'] },
      { name: 'Waves and Optics', subtopics: ['Wave Properties and Types', 'Reflection and Refraction of Light', 'Lenses and Optical Instruments'] },
      { name: 'Electricity and Magnetism', subtopics: ['Electric Fields and Potential', "Current Electricity and Ohm's Law", 'Electromagnetic Induction'] },
    ],
  },
  {
    name: 'Mathematics', code: 'MATH-101', icon_emoji: '📐',
    topics: [
      { name: 'Algebra', subtopics: ['Indices and Logarithms', 'Quadratic Equations', 'Simultaneous Equations'] },
      { name: 'Geometry and Trigonometry', subtopics: ['Plane Geometry and Circle Theorems', 'Trigonometric Ratios and Identities', 'Coordinate Geometry'] },
      { name: 'Statistics and Probability', subtopics: ['Measures of Central Tendency', 'Probability Theory', 'Permutation and Combination'] },
    ],
  },
  {
    name: 'English Language', code: 'ENG-101', icon_emoji: '📖',
    topics: [
      { name: 'Comprehension and Summary', subtopics: ['Reading Comprehension Strategies', 'Summary Writing Techniques', 'Vocabulary in Context'] },
      { name: 'Grammar and Usage', subtopics: ['Parts of Speech and Sentence Structure', 'Tenses and Concord', 'Punctuation and Spelling'] },
      { name: 'Essay and Letter Writing', subtopics: ['Types of Essays: Narrative, Argumentative, Expository', 'Formal and Informal Letters', 'Report and Speech Writing'] },
    ],
  },
];

// ─── Questions ────────────────────────────────────────────────────────────────
const QUESTIONS = {
  'Cell Structure and Organisation': [
    { q: 'Which organelle is responsible for producing energy (ATP) in the cell?', a: 'Mitochondria', opts: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi apparatus'], exp: 'Mitochondria carry out cellular respiration, producing ATP — the cell\'s energy currency.' },
    { q: 'What is the function of the cell membrane?', a: 'Controls what enters and leaves the cell', opts: ['Protein synthesis', 'Controls what enters and leaves the cell', 'DNA replication', 'Photosynthesis'], exp: 'The cell membrane is selectively permeable, controlling the passage of substances in and out of the cell.' },
    { q: 'Which organelle contains the genetic material (DNA)?', a: 'Nucleus', opts: ['Mitochondria', 'Ribosome', 'Nucleus', 'Vacuole'], exp: 'The nucleus is the control centre of the cell and houses the DNA.' },
    { q: 'Plant cells differ from animal cells because plant cells have:', a: 'Cell wall and chloroplasts', opts: ['Nucleus', 'Cell wall and chloroplasts', 'Mitochondria', 'Ribosomes'], exp: 'Plant cells uniquely possess a rigid cell wall made of cellulose and chloroplasts for photosynthesis.' },
    { q: 'Which of the following is NOT a function of the ribosome?', a: 'Energy production', opts: ['Protein synthesis', 'Translation of mRNA', 'Energy production', 'Assembling amino acids'], exp: 'Ribosomes synthesise proteins. Energy production is the role of mitochondria.' },
  ],
  'Cell Membrane and Transport': [
    { q: 'Movement of water from high to low water potential through a semi-permeable membrane is called:', a: 'Osmosis', opts: ['Diffusion', 'Active transport', 'Osmosis', 'Exocytosis'], exp: 'Osmosis is the passive movement of water molecules across a semi-permeable membrane.' },
    { q: 'Active transport differs from diffusion because active transport:', a: 'Requires energy (ATP)', opts: ['Moves substances down a gradient', 'Requires energy (ATP)', 'Only moves water', 'Occurs only in plant cells'], exp: 'Active transport moves substances against their concentration gradient and requires ATP.' },
    { q: 'A cell placed in a hypertonic solution will:', a: 'Shrink (crenate)', opts: ['Swell and burst', 'Remain unchanged', 'Shrink (crenate)', 'Divide rapidly'], exp: 'In a hypertonic solution, water leaves the cell by osmosis, causing it to shrink.' },
    { q: 'Which term describes the process by which the cell engulfs large particles?', a: 'Phagocytosis', opts: ['Pinocytosis', 'Phagocytosis', 'Exocytosis', 'Diffusion'], exp: 'Phagocytosis is the process by which cells engulf solid particles.' },
    { q: 'Facilitated diffusion requires:', a: 'Carrier proteins but no energy', opts: ['ATP energy', 'Carrier proteins but no energy', 'No proteins and no energy', 'Vesicles'], exp: 'Facilitated diffusion uses channel/carrier proteins to transport molecules down their gradient — no ATP needed.' },
  ],
  'Atomic Models and Electronic Configuration': [
    { q: 'The atomic number of an element represents the number of:', a: 'Protons in the nucleus', opts: ['Neutrons in the nucleus', 'Protons in the nucleus', 'Electrons in the outer shell', 'Nucleons in the atom'], exp: 'The atomic number equals the number of protons in the nucleus, which defines the element.' },
    { q: 'Which scientist proposed the nuclear model of the atom?', a: 'Rutherford', opts: ['Dalton', 'Thomson', 'Rutherford', 'Bohr'], exp: 'Rutherford\'s gold foil experiment led to the nuclear model.' },
    { q: 'The electron configuration of sodium (Na, atomic number 11) is:', a: '2,8,1', opts: ['2,8,1', '2,9', '3,8', '2,8,3'], exp: 'Sodium has 11 electrons arranged as 2 in the first shell, 8 in the second, and 1 in the third.' },
    { q: 'Isotopes of the same element have the same number of:', a: 'Protons', opts: ['Neutrons', 'Mass numbers', 'Protons', 'Nucleons'], exp: 'Isotopes are atoms of the same element with the same proton number but different numbers of neutrons.' },
    { q: 'Which shell can hold a maximum of 8 electrons?', a: 'Second shell (L)', opts: ['First shell (K)', 'Second shell (L)', 'Third shell (M)', 'Fourth shell (N)'], exp: 'The second shell (L shell) can hold a maximum of 8 electrons.' },
  ],
  'Motion, Velocity and Acceleration': [
    { q: 'A car travels 120 km in 2 hours. What is its average speed?', a: '60 km/h', opts: ['240 km/h', '60 km/h', '60 m/s', '30 km/h'], exp: 'Average speed = Distance ÷ Time = 120 ÷ 2 = 60 km/h.' },
    { q: 'Which of the following is a vector quantity?', a: 'Velocity', opts: ['Speed', 'Distance', 'Mass', 'Velocity'], exp: 'Velocity is a vector quantity because it has both magnitude and direction.' },
    { q: 'Acceleration is defined as:', a: 'Rate of change of velocity', opts: ['Distance per unit time', 'Rate of change of displacement', 'Rate of change of velocity', 'Total distance divided by time'], exp: 'Acceleration = Change in velocity ÷ Time taken.' },
    { q: 'An object moving with uniform velocity has:', a: 'Zero acceleration', opts: ['Increasing acceleration', 'Zero acceleration', 'Decreasing speed', 'Non-zero acceleration'], exp: 'Uniform velocity means constant speed in a constant direction — hence zero acceleration.' },
    { q: 'The area under a velocity-time graph represents:', a: 'Distance', opts: ['Acceleration', 'Speed', 'Distance', 'Force'], exp: 'The area under a velocity-time graph gives the displacement (distance travelled).' },
  ],
  'Indices and Logarithms': [
    { q: 'Simplify: 2³ × 2⁴', a: '2⁷', opts: ['2⁷', '2¹²', '4⁷', '6⁷'], exp: 'When multiplying powers with the same base, add the exponents: 2³ × 2⁴ = 2⁷.' },
    { q: 'If log₁₀(x) = 2, what is x?', a: '100', opts: ['2', '20', '100', '1000'], exp: 'log₁₀(x) = 2 means 10² = x, so x = 100.' },
    { q: 'Simplify: (3²)³', a: '3⁶', opts: ['3⁵', '3⁶', '9³', '3⁸'], exp: 'For a power raised to a power, multiply the exponents: (3²)³ = 3⁶.' },
    { q: 'What is log₂(8)?', a: '3', opts: ['2', '4', '3', '6'], exp: '2³ = 8, therefore log₂(8) = 3.' },
    { q: 'Which law states log(AB) = log A + log B?', a: 'Product law', opts: ['Power law', 'Quotient law', 'Product law', 'Change of base law'], exp: 'The product law of logarithms: log(AB) = log A + log B.' },
  ],
  'Reading Comprehension Strategies': [
    { q: 'Which strategy involves reviewing headings before reading?', a: 'Skimming', opts: ['Scanning', 'Skimming', 'Intensive reading', 'Extensive reading'], exp: 'Skimming involves quickly looking over text to get a general idea.' },
    { q: 'The main idea of a passage is best found in the:', a: 'Topic sentence, usually at the start of a paragraph', opts: ['Last sentence', 'Topic sentence, usually at the start of a paragraph', 'Longest sentence', 'Concluding paragraph only'], exp: 'The topic sentence, usually at the beginning of a paragraph, states the main idea.' },
    { q: 'Inference in comprehension means:', a: 'Drawing conclusions from implied information', opts: ['Copying the text', 'Finding dictionary meanings', 'Drawing conclusions from implied information', 'Rewriting the passage'], exp: 'Inference is the ability to understand what is implied but not directly stated.' },
    { q: 'A synonym is a word that:', a: 'Has the same or similar meaning', opts: ['Has the opposite meaning', 'Sounds the same', 'Has the same or similar meaning', 'Has multiple meanings'], exp: 'Synonyms are words with the same or very similar meanings.' },
    { q: 'Context clues help the reader to:', a: 'Understand unfamiliar words from surrounding text', opts: ['Write better essays', 'Understand unfamiliar words from surrounding text', 'Summarise faster', 'Identify the author'], exp: 'Context clues are hints within the surrounding text that help determine the meaning of unfamiliar words.' },
  ],
};

// ─── Text resources ───────────────────────────────────────────────────────────
const RESOURCES = {
  'Biology': {
    subtopic: 'Cell Structure and Organisation',
    items: [
      { title: 'JAMB Biology: Cell Structure — Complete Revision Notes', body: `CELL STRUCTURE AND ORGANISATION — JAMB/WAEC REVISION NOTES

THE CELL: The basic structural and functional unit of all living organisms.
• Prokaryotic cells (bacteria) — no membrane-bound nucleus
• Eukaryotic cells (plant/animal) — have a membrane-bound nucleus

KEY ORGANELLES AND FUNCTIONS:
• Nucleus: Contains DNA; controls all cell activities
• Mitochondria: Site of aerobic respiration; produces ATP (energy)
• Ribosome: Site of protein synthesis
• Golgi Apparatus: Modifies and packages proteins for secretion
• Lysosome: Contains digestive enzymes; breaks down waste
• Vacuole: Storage (large in plant cells)
• Cell wall (plants only): Made of cellulose; provides support
• Chloroplast (plants only): Site of photosynthesis
• Centriole (animals only): Involved in cell division

PLANT vs ANIMAL CELLS:
Plant cells have: cell wall, chloroplasts, large central vacuole
Animal cells have: centrioles, smaller/no vacuoles

EXAM TIPS:
• Know ALL organelles and their primary function
• Draw and label a typical animal and plant cell
• Common JAMB question: "Which organelle produces ATP?" → Mitochondria` },
      { title: 'Cell Biology: 10 Key Questions Explained', body: `CELL BIOLOGY — 10 KEY CONCEPTS FOR JAMB/WAEC

Q1: What is the powerhouse of the cell?
A: Mitochondria — produces ATP through cellular respiration.

Q2: Where does protein synthesis occur?
A: Ribosomes (free in cytoplasm or on rough ER).

Q3: What controls what enters and leaves the cell?
A: The cell membrane (plasma membrane) — selectively permeable.

Q4: Difference between osmosis and diffusion?
A: Diffusion = movement of any molecule from high to low concentration.
   Osmosis = movement of WATER specifically through a semi-permeable membrane.

Q5: What is turgor pressure?
A: Pressure of water inside plant cells pushing against the cell wall — keeps plants firm.

Q6: What happens to an animal cell in pure water?
A: It absorbs water by osmosis and may burst (lyse).

Q7: What is plasmolysis?
A: Shrinkage of plant cell contents away from cell wall in hypertonic solution.

Q8: Name 3 structures found ONLY in plant cells.
A: Cell wall, chloroplasts, large permanent central vacuole.

Q9: Role of the Golgi apparatus?
A: Modifies, sorts and packages proteins for secretion.

Q10: Which microscope reveals finest organelle details?
A: Electron microscope.` },
    ],
  },
  'Chemistry': {
    subtopic: 'Atomic Models and Electronic Configuration',
    items: [
      { title: 'JAMB Chemistry: Atomic Structure — Revision Notes', body: `ATOMIC STRUCTURE — JAMB/WAEC REVISION NOTES

ATOMIC MODELS:
• Dalton (1803): Indivisible solid spheres
• Thomson (1897): "Plum pudding" — electrons in positive sphere
• Rutherford (1911): Dense positive nucleus; electrons orbit around it
• Bohr (1913): Electrons orbit in fixed energy shells

SUBATOMIC PARTICLES:
• Proton:   nucleus, charge +1, mass 1
• Neutron:  nucleus, charge 0, mass 1
• Electron: shells, charge -1, mass ~0

KEY DEFINITIONS:
• Atomic Number (Z) = protons = electrons (neutral atom)
• Mass Number (A) = protons + neutrons
• Isotopes: same proton number, different neutron number

ELECTRONIC CONFIGURATION:
Shell 1 (K): max 2 | Shell 2 (L): max 8 | Shell 3 (M): max 18

EXAMPLES:
• Na (11): 2,8,1 → Group I
• Cl (17): 2,8,7 → Group VII
• Ca (20): 2,8,8,2 → Group II

EXAM TIP: Valence electrons = outermost shell electrons = Group number` },
      { title: 'Periodic Table Patterns — Quick Reference for WAEC', body: `PERIODIC TABLE — PATTERNS AND TRENDS

GROUPS (Vertical):
• Group I (Alkali Metals): Li, Na, K — 1 valence electron; react with water
• Group II: Be, Mg, Ca — 2 valence electrons
• Group VII (Halogens): F, Cl, Br — 7 valence electrons; form -1 ions
• Group 0 (Noble Gases): He, Ne, Ar — full outer shell; unreactive

TRENDS ACROSS A PERIOD (left to right):
✓ Atomic radius DECREASES
✓ Electronegativity INCREASES
✓ Ionisation energy INCREASES

TRENDS DOWN A GROUP:
✓ Atomic radius INCREASES
✓ Reactivity of metals INCREASES
✓ Reactivity of non-metals DECREASES

COMMON JAMB QUESTIONS:
• Configuration 2,8,7? → Cl (Z=17)
• Group I elements lose 1 electron → form +1 ions
• Noble gases don't react → full outer shells` },
    ],
  },
  'Physics': {
    subtopic: 'Motion, Velocity and Acceleration',
    items: [
      { title: 'JAMB Physics: Motion — Complete Revision Notes', body: `MOTION, VELOCITY AND ACCELERATION — JAMB/WAEC

DEFINITIONS:
• Distance: Total path length (scalar)
• Displacement: Shortest path, start to end (vector)
• Speed: Distance / time (scalar)
• Velocity: Displacement / time (vector)
• Acceleration: Rate of change of velocity (vector)

EQUATIONS OF MOTION (uniform acceleration):
v = u + at
s = ut + ½at²
v² = u² + 2as
s = ½(u + v)t
u=initial velocity, v=final velocity, a=acceleration, t=time, s=displacement

VELOCITY-TIME GRAPHS:
• Horizontal line → constant velocity (zero acceleration)
• Line sloping up → uniform acceleration
• Line sloping down → deceleration
• Area under graph = displacement
• Gradient = acceleration

FREE FALL: g = 10 m/s² (JAMB standard)

WORKED EXAMPLE:
Car starts from rest, accelerates at 4 m/s² for 5s:
(a) v = 0 + 4×5 = 20 m/s
(b) s = 0 + ½×4×25 = 50 m

ALWAYS write u, v, a, t, s before choosing equation!` },
      { title: "Newton's Laws — Summary Sheet", body: `NEWTON'S THREE LAWS OF MOTION

FIRST LAW (Inertia):
An object stays at rest or uniform motion unless acted on by external force.
Example: Passengers jerk forward when bus stops suddenly.

SECOND LAW:
F = ma (Force = Mass × Acceleration)
• Unit: Newton (N) = kg·m/s²
Example: F = 5kg × 3m/s² = 15N

THIRD LAW (Action-Reaction):
Every action has equal and opposite reaction.
Example: Rocket exhaust pushes down → rocket moves up.

MOMENTUM:
p = mv (kg·m/s)
Conservation: Total momentum before = Total momentum after (no external force)

IMPULSE:
Impulse = Ft = mv - mu (change in momentum)

COMMON JAMB QUESTIONS:
• 2kg ball at 5m/s: momentum = 10 kg·m/s
• F=20N, m=4kg: a = 20/4 = 5 m/s²` },
    ],
  },
  'Mathematics': {
    subtopic: 'Indices and Logarithms',
    items: [
      { title: 'JAMB Mathematics: Indices and Logarithms — Full Notes', body: `INDICES AND LOGARITHMS — JAMB/WAEC

LAWS OF INDICES:
1. aᵐ × aⁿ = aᵐ⁺ⁿ
2. aᵐ ÷ aⁿ = aᵐ⁻ⁿ
3. (aᵐ)ⁿ = aᵐⁿ
4. a⁰ = 1
5. a⁻ⁿ = 1/aⁿ
6. a^(1/n) = ⁿ√a

WORKED EXAMPLES:
• 2³ × 2⁴ = 2⁷ = 128
• 3⁶ ÷ 3² = 3⁴ = 81
• 16^(3/4) = (⁴√16)³ = 2³ = 8

LOGARITHM LAWS:
1. log(AB) = log A + log B
2. log(A/B) = log A - log B
3. log(Aⁿ) = n log A
4. log₁₀(10) = 1, log(1) = 0

CHANGE OF BASE: logₐb = log₁₀b / log₁₀a

EXAMPLES:
• log₂(32) = 5 (since 2⁵=32)
• log 2 = 0.3010 → log 8 = 3 × 0.3010 = 0.9030
• log 6 + log 5 - log 3 = log(30/3) = log 10 = 1` },
      { title: 'Quadratic Equations — Step-by-Step Guide', body: `QUADRATIC EQUATIONS — WAEC/JAMB

Form: ax² + bx + c = 0

METHOD 1 — FACTORISATION:
Find two numbers: multiply to give (a×c) and add to give b.
Example: x² + 5x + 6 = 0
→ Factors of 6 adding to 5: 2 and 3
→ (x + 2)(x + 3) = 0
→ x = -2 or x = -3

METHOD 2 — QUADRATIC FORMULA:
x = (-b ± √(b² - 4ac)) / 2a
Example: 2x² - 5x + 2 = 0
x = (5 ± √(25-16)) / 4 = (5 ± 3) / 4
x = 2 or x = ½

THE DISCRIMINANT (b² - 4ac):
• > 0 → Two distinct real roots
• = 0 → One repeated root
• < 0 → No real roots

JAMB TIP: Always check by substituting answers back!` },
    ],
  },
  'English Language': {
    subtopic: 'Reading Comprehension Strategies',
    items: [
      { title: 'WAEC English: Comprehension — Complete Strategy Guide', body: `READING COMPREHENSION — WAEC/JAMB STRATEGY

STEP-BY-STEP APPROACH:
1. Read the questions FIRST — know what to look for
2. Read the passage carefully
3. Underline key words and phrases
4. Answer questions, referring back to text
5. Check answers are directly supported

TYPES OF QUESTIONS:
1. Factual: Answer directly stated in passage
2. Inferential: Answer implied — read between lines
3. Vocabulary: Meaning as used in context
4. Summary: Main point of paragraph/passage
5. Tone/Attitude: Writer's feeling/opinion

SUMMARY WRITING RULES (WAEC):
• Use YOUR OWN words — do not copy
• Only MAIN points — no examples
• Write in CONTINUOUS PROSE
• Stick to required length
• Use third person

VOCABULARY:
• Simile: comparison using "like/as" — "brave as a lion"
• Metaphor: direct comparison — "He is a lion"
• Irony: saying opposite of what is meant
• Euphemism: polite way of saying unpleasant thing

COMMON MISTAKES:
✗ Lifting text word-for-word
✗ Including irrelevant details
✗ Exceeding word limit` },
      { title: 'English Grammar: Tenses and Concord', body: `TENSES AND SUBJECT-VERB AGREEMENT (CONCORD)

THE TENSES:
Simple: He walks / He walked / He will walk
Continuous: He is walking / He was walking / He will be walking
Perfect: He has walked / He had walked / He will have walked

CONCORD RULES:
1. Singular subject → singular verb: "The boy runs"
2. Plural subject → plural verb: "The boys run"
3. Either/Neither + singular → singular verb: "Neither is here"
4. Collective nouns → singular: "The team has won"
5. Each, everyone, nobody → singular: "Everyone is present"
6. Phrase between subject and verb doesn't change agreement:
   "The bag of books IS (not are) on the table"

COMMON JAMB ERRORS:
✗ "The news are good" → ✓ "The news IS good"
✗ "Mathematics are hard" → ✓ "Mathematics IS hard"
✗ "The committee have decided" → ✓ "The committee has decided"

TIP: Find the TRUE subject first, then match the verb to it.` },
    ],
  },
};

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run(externalSequelize) {
  const db   = externalSequelize || sequelize;
  const sel  = (sql, rep = {}) => db.query(sql, { replacements: rep, type: QueryTypes.SELECT });
  const raw  = (sql, rep = {}) => db.query(sql, { replacements: rep, type: QueryTypes.RAW });
  const ownConn = !externalSequelize;

  try {
    if (ownConn) {
      await db.authenticate();
      console.log('✅ Database connected\n');
    }

    // 1. Exam boards
    console.log('📋 Ensuring exam boards...');
    let jambId, waecId;
    for (const [code, name] of [['JAMB', 'JAMB/UTME'], ['WAEC', 'WAEC']]) {
      let rows = await sel(`SELECT id FROM exam_boards WHERE UPPER(code)=UPPER(:c) LIMIT 1`, { c: code });
      if (!rows.length) {
        rows = await sel(`INSERT INTO exam_boards(code,name,is_active,created_at) VALUES(:c,:n,true,NOW()) RETURNING id`, { c: code, n: name });
      }
      if (code === 'JAMB') jambId = rows[0].id;
      else waecId = rows[0].id;
      console.log(`  ${code}: ${rows[0].id}`);
    }

    // 2. Subjects
    console.log('\n📚 Subjects...');
    const subjectIds = {};
    for (const subj of SUBJECTS) {
      // Try JAMB version first
      for (const [bCode, bId] of [['JAMB', jambId], ['WAEC', waecId]]) {
        const code = subj.code + (bCode === 'WAEC' ? '-W' : '');
        let rows = await sel(`SELECT id FROM subjects WHERE UPPER(code)=UPPER(:c) LIMIT 1`, { c: code });
        if (!rows.length) {
          rows = await sel(
            `INSERT INTO subjects(exam_board_id,name,code,icon_emoji,is_active,created_at,updated_at)
             VALUES(:b,:n,:c,:i,true,NOW(),NOW()) RETURNING id`,
            { b: bId, n: subj.name, c: code, i: subj.icon_emoji }
          );
        }
        if (bCode === 'JAMB') subjectIds[subj.name] = rows[0].id;
      }
      console.log(`  ✓ ${subj.name} → id=${subjectIds[subj.name]}`);
    }

    // 3. Topics + Subtopics
    console.log('\n📂 Topics and subtopics...');
    const subtopicIds = {}; // "SubjName:SubtopicName" → id
    for (const subj of SUBJECTS) {
      const subjId = subjectIds[subj.name];
      for (let ti = 0; ti < subj.topics.length; ti++) {
        const topic = subj.topics[ti];
        let tRows = await sel(`SELECT id FROM topics WHERE subject_id=:s AND name=:n LIMIT 1`, { s: subjId, n: topic.name });
        if (!tRows.length) {
          tRows = await sel(
            `INSERT INTO topics(subject_id,name,order_index,is_active,created_at,updated_at) VALUES(:s,:n,:o,true,NOW(),NOW()) RETURNING id`,
            { s: subjId, n: topic.name, o: ti }
          );
        }
        const topicId = tRows[0].id;
        for (let si = 0; si < topic.subtopics.length; si++) {
          const stName = topic.subtopics[si];
          let stRows = await sel(`SELECT id FROM subtopics WHERE topic_id=:t AND name=:n LIMIT 1`, { t: topicId, n: stName });
          if (!stRows.length) {
            stRows = await sel(
              `INSERT INTO subtopics(topic_id,subject_id,name,order_index,is_active,created_at,updated_at) VALUES(:t,:s,:n,:o,true,NOW(),NOW()) RETURNING id`,
              { t: topicId, s: subjId, n: stName, o: si }
            );
          }
          subtopicIds[`${subj.name}:${stName}`] = stRows[0].id;
        }
        console.log(`  ✓ ${subj.name} › ${topic.name} (${topic.subtopics.length} subtopics)`);
      }
    }

    // Admin user for uploaded_by
    const adminRows = await sel(`SELECT id FROM users WHERE role='admin' AND is_active=true LIMIT 1`);
    const adminId = adminRows[0]?.id;
    if (!adminId) { console.log('\n⚠️  No admin user found — skip questions/resources'); }

    // 4. Questions
    if (adminId) {
      console.log('\n❓ Seeding questions...');
      for (const [stName, qs] of Object.entries(QUESTIONS)) {
        let stId = null;
        for (const key of Object.keys(subtopicIds)) {
          if (key.endsWith(`:${stName}`)) { stId = subtopicIds[key]; break; }
        }
        if (!stId) { console.log(`  ⚠️  Subtopic not found: ${stName}`); continue; }
        let added = 0;
        for (const qd of qs) {
          const exists = await sel(`SELECT id FROM questions WHERE question_text=:t AND subtopic_id=:s LIMIT 1`, { t: qd.q, s: stId });
          if (exists.length) continue;
          // Build JSONB options array matching the app's question format
          const optsJson = JSON.stringify(qd.opts.map(o => ({
            option_text: o,
            is_correct: o === qd.a,
          })));
          await sel(
            `INSERT INTO questions(subtopic_id, question_text, options, correct_answer,
               explanation, type, difficulty, is_active, submitted_by, created_at, updated_at)
             VALUES(:s, :q, :opts::jsonb, :ans, :exp, 'mcq', 'medium', true, :admin, NOW(), NOW())
             RETURNING id`,
            { s: stId, q: qd.q, opts: optsJson, ans: qd.a, exp: qd.exp, admin: adminId }
          ).catch(e => console.log(`  ⚠️  Q insert: ${e.message.slice(0,80)}`));
          added++;
        }
        console.log(`  ✓ ${stName}: +${added} questions`);
      }
    }

    // 5. Resources
    if (adminId) {
      console.log('\n📄 Seeding resources...');
      for (const [subjName, rData] of Object.entries(RESOURCES)) {
        const stId = subtopicIds[`${subjName}:${rData.subtopic}`];
        if (!stId) continue;
        const topicRows = await sel(`SELECT topic_id FROM subtopics WHERE id=:s`, { s: stId });
        const topicId = topicRows[0]?.topic_id;
        for (const item of rData.items) {
          const exists = await sel(`SELECT id FROM resources WHERE title=:t AND subtopic_id=:s LIMIT 1`, { t: item.title, s: stId });
          if (exists.length) { console.log(`  ↩  Already exists: ${item.title.slice(0,45)}…`); continue; }
          // Store as plain text resource via data URL
          const encoded = encodeURIComponent(item.body);
          await sel(
            `INSERT INTO resources(title,resource_type,file_url,subtopic_id,topic_id,uploaded_by,
               is_free,is_staged,is_active,created_at,updated_at)
             VALUES(:t,'document',:url,:st,:top,:admin,true,false,true,NOW(),NOW()) RETURNING id`,
            { t: item.title, url: `data:text/plain;charset=utf-8,${encoded}`, st: stId, top: topicId || null, admin: adminId }
          ).catch(e => console.log(`  ⚠️  ${e.message.slice(0,60)}`));
          console.log(`  ✓ ${item.title.slice(0,50)}…`);
        }
      }
    }

    // 6. Assign resources to all students
    console.log('\n👥 Assigning resources to all students...');
    if (adminId) {
      // Ensure resource_assignments table exists
      await raw(`
        CREATE TABLE IF NOT EXISTS resource_assignments (
          id          SERIAL      PRIMARY KEY,
          resource_id INTEGER     NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
          assigned_by UUID        REFERENCES users(id) ON DELETE SET NULL,
          student_id  UUID        REFERENCES users(id) ON DELETE CASCADE,
          class_id    UUID        REFERENCES classes(id) ON DELETE CASCADE,
          push_type   VARCHAR(50) NOT NULL DEFAULT 'learning_material',
          assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `).catch(() => {});

      await raw(`
        INSERT INTO resource_assignments(resource_id,assigned_by,student_id,push_type,assigned_at)
        SELECT r.id, :admin::uuid, u.id, 'learning_material', NOW()
        FROM resources r CROSS JOIN users u
        WHERE u.role='student' AND u.is_active=true
          AND r.is_active=true AND COALESCE(r.is_staged,false)=false
          AND NOT EXISTS(
            SELECT 1 FROM resource_assignments ra
            WHERE ra.resource_id=r.id AND ra.student_id=u.id
          )
      `, { admin: adminId }).catch(e => console.log(`  ⚠️  Assignment: ${e.message.slice(0,60)}`));
      console.log('  ✓ All resources assigned to active students');
    }

    // Summary
    const [t, s, q2, r] = await Promise.all([
      sel(`SELECT COUNT(*)::int AS n FROM topics`),
      sel(`SELECT COUNT(*)::int AS n FROM subtopics`),
      sel(`SELECT COUNT(*)::int AS n FROM questions`),
      sel(`SELECT COUNT(*)::int AS n FROM resources WHERE is_active=true`),
    ]);
    console.log('\n🎉 SEED COMPLETE!');
    console.log(`   Topics: ${t[0].n}  Subtopics: ${s[0].n}  Questions: ${q2[0].n}  Resources: ${r[0].n}`);
  } catch (err) {
    console.error('\n❌ Seed error:', err.message);
    process.exit(1);
  } finally {
    if (ownConn) await db.close();
  }
}

// Allow direct CLI invocation: node seeds/seedDemoContent.js
if (require.main === module) run();

// Allow API endpoint to call with the server's existing sequelize
module.exports = run;
