'use strict';
// server/routes/languageMasterclassRoutes.js
// Routes for the French/German Masterclass proof-of-concept.
// Mounted at /api/language-masterclass with protect middleware already applied.
//
// ═══════════════════════════════════════════════════════════════════════════
// THIS IS DELIBERATELY INCOMPLETE — read before "finishing" anything here
// ═══════════════════════════════════════════════════════════════════════════
// Per Da's decision, this exists to demo to a prospective client, not as a
// finished product: enough to show the shape of the thing (levels, real
// Gemini-scored pronunciation) without it being a fully usable course until
// a concrete agreement is in place. On purpose, right now:
//   - Only Beginner has any words in it (~8 per language) — nowhere near a
//     complete tier. Intermediate/Advanced categories exist (so the level
//     structure is visible) but are empty on purpose.
//   - There is NO listening-dictation-check route and NO writing-score
//     route here at all. Those two exercise types are front-end-only
//     "yet to be completed" placeholders (see client/src/pages/lang/) —
//     nothing to call on the backend for them yet.
//   - No admin CMS routes for managing categories/words (unlike English
//     Masterclass's /admin/* routes) — content was seeded directly via
//     the migration for this pass. Add an admin CMS here before relying on
//     non-technical staff to maintain this content long-term.
//   - Every school defaults to enable_french = false, enable_german =
//     false (see requireLanguageRegistration below) — nobody gets this
//     without it being deliberately turned on for their account.
// ═══════════════════════════════════════════════════════════════════════════

const express  = require('express');
const router   = express.Router();
const { Pool } = require('pg');
const { generate } = require('../services/ai');
const { authorize } = require('../middleware/auth');
const { pronunciationLimiter } = require('../middleware/rateLimiter');
const r2 = require('../utils/r2Storage');

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

const adminOnly = authorize('admin');

// ─── helpers ─────────────────────────────────────────────────────────────────
async function q(sql, params = []) {
  const r = await db.query(sql, params);
  return r.rows;
}
async function q1(sql, params = []) {
  const r = await db.query(sql, params);
  return r.rows[0] || null;
}

const LANGUAGES = ['french', 'german'];
const LANGUAGE_LABEL = { french: 'French', german: 'German' };

// Validates :language on every route below and rejects anything else with a
// clear 400 rather than silently matching nothing.
function validLanguage(req, res, next) {
  if (!LANGUAGES.includes(req.params.language)) {
    return res.status(400).json({ success: false, error: `language must be one of: ${LANGUAGES.join(', ')}` });
  }
  next();
}
router.param('language', (req, res, next) => next()); // no-op, keeps :language visible in route tables
router.use('/:language', validLanguage);

// ─── level-unlock rules ─────────────────────────────────────────────────────
// Same cumulative-across-sessions shape as English Masterclass
// (server/routes/englishMasterclassRoutes.js) — kept identical on purpose so
// the two modules' level math never silently drifts apart. See that file's
// getLevelTotals() for the full reasoning on why this reads session rows
// directly rather than joining live to lang_categories.difficulty.
const QUESTIONS_PER_LEVEL   = 30;
const LEVEL_UNLOCK_ACCURACY = 70;

async function getLevelTotals(userId, language) {
  const rows = await q(`
    SELECT ps.difficulty,
           COALESCE(SUM(ps.total_words), 0)::int   AS total_words,
           COALESCE(SUM(ps.correct_words), 0)::int AS correct_words
      FROM lang_practice_sessions ps
     WHERE ps.user_id = $1 AND ps.language = $2
       AND ps.difficulty IS NOT NULL
     GROUP BY ps.difficulty
  `, [userId, language]);
  const byDiff = {};
  rows.forEach(r => { byDiff[r.difficulty] = { totalWords: r.total_words, correctWords: r.correct_words }; });
  return byDiff;
}

function hasPassedLevel(byDiff, diff) {
  const t = byDiff[diff];
  if (!t || t.totalWords < QUESTIONS_PER_LEVEL) return false;
  return (t.correctWords / t.totalWords) * 100 >= LEVEL_UNLOCK_ACCURACY;
}

function computeUnlocked(byDiff) {
  return {
    Beginner:     true, // always open
    Intermediate: hasPassedLevel(byDiff, 'Beginner'),
    Advanced:     hasPassedLevel(byDiff, 'Intermediate'),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRATION — same one-time opt-in shape as English Masterclass
// ═══════════════════════════════════════════════════════════════════════════
router.post('/:language/register', async (req, res) => {
  const { language } = req.params;
  const userId = req.user.id;
  const enableCol = `enable_${language}`;

  if (req.school && !req.school[enableCol]) {
    return res.status(403).json({
      success: false,
      error: `Your school has not been registered for ${LANGUAGE_LABEL[language]} Masterclass yet. Contact your school admin or App Admin.`,
      code: 'LANGUAGE_NOT_ENABLED_FOR_SCHOOL',
    });
  }

  try {
    const col = `${language}_registered_at`;
    const row = await q1(
      `UPDATE users SET ${col} = COALESCE(${col}, NOW()) WHERE id = $1 RETURNING ${col}`,
      [userId]
    );
    if (!row) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, registered_at: row[col] });
  } catch (err) {
    console.error(`[LangMasterclass] POST /${language}/register`, err.message);
    res.status(500).json({ success: false, error: `Could not complete ${LANGUAGE_LABEL[language]} Masterclass registration.` });
  }
});

// Gate: mirrors requireEmRegistration in englishMasterclassRoutes.js exactly —
// tenant boundary first (live on every request, for every role tied to a
// school), then the student-specific one-time opt-in.
function requireLanguageRegistration(req, res, next) {
  const { language } = req.params;
  const enableCol = `enable_${language}`;

  if (req.school && !req.school[enableCol]) {
    return res.status(403).json({
      success: false,
      error: `Your school has not been registered for ${LANGUAGE_LABEL[language]} Masterclass yet. Contact your school admin or App Admin.`,
      code: 'LANGUAGE_NOT_ENABLED_FOR_SCHOOL',
    });
  }
  if (req.user.role !== 'student') return next();

  const col = `${language}_registered_at`;
  if (!req.user[col]) {
    return res.status(403).json({
      success: false,
      error: `You need to register for ${LANGUAGE_LABEL[language]} Masterclass before you can access it.`,
      code: 'LANGUAGE_REGISTRATION_REQUIRED',
    });
  }
  next();
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC (student-facing) ROUTES — all require registration below this point
// ═════════════════════════════════════════════════════════════════════════════
router.use('/:language', requireLanguageRegistration);

// GET /api/language-masterclass/:language/categories
router.get('/:language/categories', async (req, res) => {
  const { language } = req.params;
  try {
    const rows = await q(`
      SELECT c.id, c.name, c.description, c.difficulty, c.icon_emoji, c.order_index,
             COUNT(w.id) FILTER (WHERE w.is_active) AS word_count
        FROM lang_categories c
        LEFT JOIN lang_words w ON w.category_id = c.id
       WHERE c.language = $1 AND c.is_active = true
       GROUP BY c.id
       ORDER BY c.order_index
    `, [language]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(`[LangMasterclass] GET /${language}/categories`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/language-masterclass/:language/categories/:id/words
// Same "up to 10 random words per session" cap as English Masterclass.
router.get('/:language/categories/:id/words', async (req, res) => {
  const { language, id } = req.params;
  try {
    const category = await q1(`SELECT id FROM lang_categories WHERE id = $1 AND language = $2`, [id, language]);
    if (!category) return res.status(404).json({ success: false, error: 'Category not found' });

    const rows = await q(`
      SELECT id, word, phonetic, definition, example_sentence, icon_emoji
        FROM lang_words
       WHERE category_id = $1 AND is_active = true
       ORDER BY RANDOM() LIMIT 10
    `, [id]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(`[LangMasterclass] GET /${language}/categories/:id/words`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/language-masterclass/:language/audio
// TTS via Gemini — same approach as English Masterclass's /audio, with the
// tutor framing localized per language instead of assuming English.
router.post('/:language/audio', async (req, res) => {
  const { language } = req.params;
  const { word } = req.body;
  if (!word) return res.status(400).json({ success: false, error: 'word is required' });

  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const label = LANGUAGE_LABEL[language];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        parts: [{
          text: `You are a ${label} language tutor. Speak the following ${label} word or phrase clearly, ` +
                `slowly and clearly so a learner can hear each sound distinctly, using standard ${label} pronunciation. ` +
                `Say only the word/phrase, nothing else: "${word}"`
        }]
      }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
        }
      }
    });

    const audioPart = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('audio/'));

    if (audioPart?.inlineData?.data) {
      return res.json({ success: true, audio: audioPart.inlineData.data, mimeType: audioPart.inlineData.mimeType });
    }

    // Fallback: Gemini audio not available on this tier — signal client to
    // use browser TTS. Note: browser TTS quality/availability for fr-FR/
    // de-DE voices varies a lot more across devices than it does for
    // English — worth knowing when demoing this on an unfamiliar device.
    return res.json({ success: false, fallback: true, error: 'Gemini audio unavailable, use browser TTS' });
  } catch (err) {
    console.error(`[LangMasterclass] POST /${language}/audio`, err.message);
    res.json({ success: false, fallback: true, error: err.message });
  }
});

// POST /api/language-masterclass/:language/pronunciation-score
// Mirrors English Masterclass's /pronunciation-score exactly, generalized to
// whichever language is being practiced. Same accent-fairness framing
// generalized: judges clarity/recognisability against standard pronunciation
// for that language, not against any one regional accent of it.
router.post('/:language/pronunciation-score', pronunciationLimiter, async (req, res) => {
  const { language } = req.params;
  const { word, word_id, audio, mime_type } = req.body;
  const userId = req.user.id;
  const label = LANGUAGE_LABEL[language];

  if (!word)  return res.status(400).json({ success: false, error: 'word is required' });
  if (!audio) return res.status(400).json({ success: false, error: 'audio is required' });
  if (audio.length > 4_000_000) {
    return res.status(413).json({ success: false, error: 'That recording is too long. Please keep it to one word.' });
  }

  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `You are a supportive ${label} pronunciation coach for learners around the world.

The student was asked to say the ${label} word/phrase: "${word}"

Listen to the attached audio and evaluate it. Judge ONLY whether it is clearly and recognisably produced in ${label} — correct syllables, correct sounds, correct stress/accent marks where relevant. A learner's first language accent bleeding through slightly is normal and should not be penalised; only mark it down if the word itself is genuinely unclear, mispronounced (wrong sounds/syllables), or a different word entirely.

Respond in this exact JSON format, no markdown, no extra text:
{
  "heard": "what you heard the student say, as plain text",
  "score": <integer 0-100>,
  "matched": <true if it is recognisably the target word/phrase, false otherwise>,
  "feedback": "one short, encouraging sentence (max 20 words), specific if possible"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: mime_type || 'audio/webm', data: audio } },
        ],
      }],
    });

    const textPart = response?.candidates?.[0]?.content?.parts?.find(p => p.text)?.text || '';
    const cleaned  = textPart.replace(/```json|```/g, '').trim();

    let data;
    try { data = JSON.parse(cleaned); } catch { data = null; }

    if (!data || typeof data.score !== 'number') {
      return res.json({ success: false, error: 'Could not evaluate that recording. Please try again.' });
    }

    const score = Math.max(0, Math.min(100, Math.round(data.score)));

    let audioUrl = null;
    try {
      if (r2.isR2Enabled()) {
        const buffer = Buffer.from(audio, 'base64');
        const ext = (mime_type || 'audio/webm').split('/')[1]?.split(';')[0] || 'webm';
        const uploaded = await r2.uploadBuffer({
          buffer,
          originalname: `${language}-pronunciation-${userId}-${Date.now()}.${ext}`,
          mimetype: mime_type || 'audio/webm',
        });
        audioUrl = uploaded?.url || null;
      }
      await db.query(`
        INSERT INTO lang_pronunciation_attempts
          (user_id, language, word_id, word_text, audio_url, heard, score, matched, feedback)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [userId, language, word_id || null, word, audioUrl, data.heard || null, score, !!data.matched, data.feedback || null]);
    } catch (persistErr) {
      console.warn(`[LangMasterclass] ${language} pronunciation-score persistence failed:`, persistErr.message);
    }

    return res.json({
      success: true,
      score,
      heard: data.heard || '',
      matched: !!data.matched,
      feedback: data.feedback || '',
    });
  } catch (err) {
    console.error(`[LangMasterclass] POST /${language}/pronunciation-score`, err.message);
    res.status(500).json({ success: false, error: 'Pronunciation check is temporarily unavailable. Please try again shortly.' });
  }
});

// POST /api/language-masterclass/:language/sessions
// Saves one practice session's tally so level-progress math (below) has
// something to read. Only pronunciation attempts contribute to
// correct_words/total_words right now — there is no listening or writing
// scoring to fold in yet (see the file-level note at the top).
router.post('/:language/sessions', async (req, res) => {
  const { language } = req.params;
  const { category_id, difficulty, total_words, correct_words } = req.body;
  const userId = req.user.id;

  if (!Number.isInteger(total_words) || !Number.isInteger(correct_words)) {
    return res.status(400).json({ success: false, error: 'total_words and correct_words must be integers' });
  }

  try {
    await db.query(`
      INSERT INTO lang_practice_sessions (user_id, language, category_id, difficulty, total_words, correct_words)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [userId, language, category_id || null, difficulty || null, total_words, correct_words]);
    res.json({ success: true });
  } catch (err) {
    console.error(`[LangMasterclass] POST /${language}/sessions`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/language-masterclass/:language/level-progress
router.get('/:language/level-progress', async (req, res) => {
  const { language } = req.params;
  try {
    const byDiff = await getLevelTotals(req.user.id, language);
    res.json({
      success: true,
      data: {
        unlocked: computeUnlocked(byDiff),
        totals: byDiff,
        questions_per_level: QUESTIONS_PER_LEVEL,
        unlock_accuracy: LEVEL_UNLOCK_ACCURACY,
      },
    });
  } catch (err) {
    console.error(`[LangMasterclass] GET /${language}/level-progress`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
