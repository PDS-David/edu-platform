'use strict';
// server/routes/languageMasterclassRoutes.js
// Generalized Language Masterclass routes — now covers all 8 supported
// languages (english, french, german, mandarin, arabic, spanish, swahili,
// yoruba), not just the original French/German POC.
// Mounted at /api/language-masterclass with protect middleware already applied.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHAT'S REAL vs PLACEHOLDER, per language — check languages.supports_* before
// assuming a route will do anything: pronunciation-score and writing-score
// both check the languages table and return 501 EXERCISE_NOT_SUPPORTED
// rather than silently pretending to grade something that isn't backed by
// verified content/prompting for that language yet.
//   - English: pronunciation, listening (client-side only, no backend route
//     needed beyond /audio), and writing all supported.
//   - French/German: pronunciation and listening (listening enabled
//     client-side in LangPracticeSession.jsx — same client-side-only shape
//     as English's listening step above, no backend route needed beyond
//     /audio). Beginner-only content (~8 words), Intermediate/Advanced
//     empty on purpose. Writing not yet validated for these languages.
//   - Mandarin/Arabic/Spanish/Swahili/Yoruba: same Beginner-only seed shape,
//     pronunciation/listening/writing NOT yet marked supported — see
//     languages table. Flip supports_* on per-language only once that
//     language's real backend work lands and has been verified, not as part
//     of "generalizing" this file.
//   - No admin CMS routes for managing categories/words (unlike English
//     Masterclass's /admin/* routes) — content seeded directly via
//     migrations for this pass. Add an admin CMS here before relying on
//     non-technical staff to maintain this content long-term.
//   - Registration/enablement now reads user_language_registrations /
//     school_enabled_languages (join tables) instead of one column per
//     language — see requireLanguageRegistration below.
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

const LANGUAGES = ['english', 'french', 'german', 'mandarin', 'arabic', 'spanish', 'swahili', 'yoruba'];
const LANGUAGE_LABEL = {
  english: 'English', french: 'French', german: 'German', mandarin: 'Mandarin',
  arabic: 'Arabic', spanish: 'Spanish', swahili: 'Swahili', yoruba: 'Yoruba',
};

// Languages actually live for users, independent of LANGUAGES above (which
// only validates that :language is a recognized identifier) and independent
// of any DB/admin flag. This is the single "enable on demand" switch: a
// language is introduced by adding it here in code, and nowhere else — not
// a school toggle, not a content-seeding step. Mandarin/Arabic/Spanish/
// Swahili/Yoruba already have Beginner-only seed content in the DB (see
// this file's header) but are deliberately withheld here until there's
// real user demand, per Da's instruction. Every route below this point is
// gated by requireLanguageEnabled, so no content for a withheld language
// — categories, words, progress, anything — is reachable through the API
// regardless of what the frontend does.
const ENABLED_LANGUAGES = new Set(['english', 'french', 'german']);

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

// Second gate, mounted before every route below (including /register) —
// a withheld language 404s here before it ever reaches a DB query, so
// there's no code path that can return its content ahead of the
// ENABLED_LANGUAGES change that turns it on.
function requireLanguageEnabled(req, res, next) {
  if (!ENABLED_LANGUAGES.has(req.params.language)) {
    return res.status(404).json({
      success: false,
      error: `${LANGUAGE_LABEL[req.params.language]} Masterclass will soon be available.`,
      code: 'LANGUAGE_NOT_YET_ENABLED',
    });
  }
  next();
}
router.use('/:language', requireLanguageEnabled);

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
// REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────
// SUPERSEDED as a user-facing step: per Da's explicit instruction, there is
// to be no registration UI/button of any kind, for tenant or standalone
// users. A tenant student already needed no registration step (school
// enablement alone grants access — see requireLanguageRegistration below).
// A standalone user previously needed one explicit POST here before
// anything else worked; that requirement is now satisfied silently, inline,
// the first time a standalone student touches any language-scoped route
// (see requireLanguageRegistration's auto-registration branch below) —
// same underlying user_language_registrations write this route always
// made, just no longer gated behind a click. This route itself is kept,
// unchanged, as a harmless idempotent manual fallback — nothing in the
// frontend calls it anymore.
// ═══════════════════════════════════════════════════════════════════════════
router.post('/:language/register', async (req, res) => {
  const { language } = req.params;
  const userId = req.user.id;

  // Tenant student: access is already fully determined by
  // req.school.hasLanguageMasterclass, nothing to register. Report success
  // without writing anything, so a lingering frontend call doesn't error.
  if (req.school) {
    return res.json({ success: true, note: 'No registration needed -- access is granted at the school level.' });
  }

  try {
    const row = await q1(
      `INSERT INTO user_language_registrations (user_id, language)
       VALUES ($1, $2)
       ON CONFLICT (user_id, language) DO NOTHING
       RETURNING registered_at`,
      [userId, language]
    );
    const registeredAt = row?.registered_at || (await q1(
      `SELECT registered_at FROM user_language_registrations WHERE user_id = $1 AND language = $2`,
      [userId, language]
    ))?.registered_at;
    // This single registration event unlocks all 8 languages for this user
    // (req.user.hasLanguageMasterclass on the NEXT request will be true --
    // it's computed once per-request in middleware/auth.js from whether any
    // row exists at all, not specifically this language).
    res.json({ success: true, registered_at: registeredAt, unlocked_all_languages: true });
  } catch (err) {
    console.error(`[LangMasterclass] POST /${language}/register`, err.message);
    res.status(500).json({ success: false, error: `Could not complete Language Masterclass registration.` });
  }
});

// Gate: single access check, not per-language. Per Da's explicit
// instruction -- "once the app admin registers a school for Language
// Masterclass, the school and her students should have unrestricted access
// to ALL languages" -- a tenant student/teacher/school_admin's access
// depends only on whether their school has Language Masterclass enabled at
// all (req.school.hasLanguageMasterclass, computed in middleware/auth.js
// from schools.enable_em). A standalone user's access depends only on
// whether they've ever registered for any one language
// (req.user.hasLanguageMasterclass). Neither checks which specific language
// is being requested anymore -- the old per-language membership checks
// (school.enabledLanguages.includes(language), user.registeredLanguages.
// includes(language)) are gone; enabledLanguages/registeredLanguages arrays
// are left computed in auth.js for anything else still reading them, but
// this gate no longer uses them.
//
// UPDATE: standalone users are no longer blocked here pending a manual
// registration click (see the REGISTRATION section above) -- the very
// first request a not-yet-registered standalone student makes to any
// language-scoped route silently writes the user_language_registrations
// row itself and proceeds, rather than 403ing and waiting for a button
// press that no longer exists in the UI.
async function requireLanguageRegistration(req, res, next) {
  if (req.school) {
    if (!req.school.hasLanguageMasterclass) {
      return res.status(403).json({
        success: false,
        error: `Your school has not been registered for Language Masterclass yet. Contact your school admin or App Admin.`,
        code: 'LANGUAGE_MASTERCLASS_NOT_ENABLED_FOR_SCHOOL',
      });
    }
    return next();
  }

  if (req.user.role !== 'student') return next();

  if (!req.user.hasLanguageMasterclass) {
    try {
      await q(
        `INSERT INTO user_language_registrations (user_id, language)
         VALUES ($1, $2)
         ON CONFLICT (user_id, language) DO NOTHING`,
        [req.user.id, req.params.language]
      );
      req.user.hasLanguageMasterclass = true;
    } catch (err) {
      console.error(`[LangMasterclass] silent auto-register failed for user ${req.user.id}/${req.params.language}`, err.message);
      return res.status(500).json({ success: false, error: 'Could not set up Language Masterclass access. Please try again.' });
    }
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

// POST /api/language-masterclass/:language/writing-score
// Ported from englishMasterclassRoutes.js's /writing-score, generalized by
// language. Gated by languages.supports_writing (seeded true for English
// only, per what actually exists in code today -- French/German and the
// 5 new languages don't have real writing content/grading validated yet,
// so this returns a clear 501 rather than silently pretending to grade).
router.post('/:language/writing-score', pronunciationLimiter, async (req, res) => {
  const { language } = req.params;
  const label = LANGUAGE_LABEL[language];

  const support = await q1(`SELECT supports_writing FROM languages WHERE code = $1`, [language]);
  if (!support?.supports_writing) {
    return res.status(501).json({
      success: false,
      error: `Written composition scoring isn't available for ${label} yet.`,
      code: 'EXERCISE_NOT_SUPPORTED',
    });
  }

  const { word, word_id, prompt, text, sentence_count } = req.body;
  const userId = req.user.id;
  if (!word)  return res.status(400).json({ success: false, error: 'word is required' });
  if (!text || !text.trim()) return res.status(400).json({ success: false, error: 'text is required' });
  if (text.length > 4000) {
    return res.status(413).json({ success: false, error: 'That response is too long. Please shorten it a little.' });
  }

  const requiredCount = Number.isInteger(sentence_count) && sentence_count > 0 ? sentence_count : 1;
  const effectivePrompt = prompt || (requiredCount === 1
    ? `Write one sentence using the word "${word}" correctly.`
    : `Write ${requiredCount} different sentences using the word "${word}" correctly.`);

  try {
    const gradingPrompt = `You are a supportive ${label} writing coach for learners around the world. Do NOT penalise regional vocabulary or spelling choices that are correct in different varieties of ${label} -- only genuine grammar errors or misuse of the target word.

The student was asked to: "${effectivePrompt}"
They needed to write exactly ${requiredCount} distinct sentence(s), each correctly using the target word, in ${label}.
Target word: "${word}"
Student's response: "${text.trim()}"

First, count how many separate sentences the student actually wrote (lines/sentences separated by line breaks, full stops, or similar). Then evaluate whether the target word was used correctly (right meaning, right grammatical form) in each sentence, and whether each sentence is grammatically sound in ${label}.

Respond in this exact JSON format, no markdown, no extra text:
{
  "score": <integer 0-100, reflecting BOTH correct usage/grammar AND whether they wrote the required number of sentences>,
  "sentences_written": <integer, how many distinct sentences you counted>,
  "sentence_count_met": <true if sentences_written >= ${requiredCount}, false otherwise>,
  "used_word_correctly": <true if the word was used correctly in all or nearly all sentences, false otherwise>,
  "grammar_notes": "one short note on any grammar issue, or empty string if none",
  "feedback": "one short, encouraging sentence (max 20 words). If they wrote fewer than ${requiredCount} sentences, gently say so."
}`;

    const raw = await generate(gradingPrompt, 'writing-score');
    const cleaned = raw.replace(/```json|```/g, '').trim();

    let data;
    try { data = JSON.parse(cleaned); } catch { data = null; }

    if (!data || typeof data.score !== 'number') {
      return res.json({ success: false, error: 'Could not evaluate that response. Please try again.' });
    }

    const score = Math.max(0, Math.min(100, Math.round(data.score)));
    const sentencesWritten = Number.isInteger(data.sentences_written) ? data.sentences_written : null;
    const sentenceCountMet = typeof data.sentence_count_met === 'boolean'
      ? data.sentence_count_met
      : (sentencesWritten !== null ? sentencesWritten >= requiredCount : null);

    try {
      await db.query(`
        INSERT INTO lang_writing_submissions
          (user_id, language, word_id, word_text, prompt, submission_text, score, used_word_correctly, grammar_notes, feedback,
           sentence_count_required, sentence_count_written, sentence_count_met)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `, [userId, language, word_id || null, word, effectivePrompt, text.trim(), score, !!data.used_word_correctly, data.grammar_notes || null, data.feedback || null,
          requiredCount, sentencesWritten, sentenceCountMet]);
    } catch (persistErr) {
      console.warn(`[LangMasterclass] ${language} writing-score persistence failed:`, persistErr.message);
    }

    return res.json({
      success: true,
      score,
      used_word_correctly: !!data.used_word_correctly,
      sentence_count_required: requiredCount,
      sentences_written: sentencesWritten,
      sentence_count_met: sentenceCountMet,
      grammar_notes: data.grammar_notes || '',
      feedback: data.feedback || '',
    });
  } catch (err) {
    console.error(`[LangMasterclass] POST /${language}/writing-score`, err.message);
    res.status(500).json({ success: false, error: 'Writing check is temporarily unavailable. Please try again shortly.' });
  }
});

// POST /api/language-masterclass/:language/sessions
// Saves one practice session's tally so level-progress math (below) has
// something to read.
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
