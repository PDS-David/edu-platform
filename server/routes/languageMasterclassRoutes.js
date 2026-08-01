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
//   - French/German: pronunciation, listening, AND writing now all
//     supported (supports_writing flipped true for both — see the
//     `languages` table UPDATE in run_complete_migration.js). Full admin
//     CMS below (/:language/admin/*), word-explain, and /progress are all
//     generalized and live for these two. Content still growing — see the
//     Intermediate/Advanced seed additions in run_complete_migration.js;
//     use the admin CMS's "Generate with AI" to keep expanding beyond that.
//   - Mandarin/Arabic/Spanish/Swahili/Yoruba: Beginner-only seed shape,
//     pronunciation/listening/writing NOT yet marked supported — see
//     languages table. Flip supports_* on per-language only once that
//     language's real backend work lands and has been verified. The admin
//     CMS routes below work for these too (once ENABLED_LANGUAGES includes
//     them), since they're generalized by :language, not French/German-
//     specific.
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

// POST /api/language-masterclass/:language/word-explain
// Mirrors English Masterclass's /word-explain, generalized by language:
// Gemini explains a word, and (if word_id is supplied) the response
// backfills lang_words for any field that's currently empty — never
// overwrites admin-curated content.
router.post('/:language/word-explain', async (req, res) => {
  const { language } = req.params;
  const { word, context, word_id } = req.body;
  const label = LANGUAGE_LABEL[language];
  if (!word) return res.status(400).json({ success: false, error: 'word is required' });

  try {
    const prompt = `You are an expert ${label} language teacher helping a student around the world build strong ${label} vocabulary.

Provide the following for the ${label} word or phrase: "${word}"
Context (category): ${context || `General ${label} vocabulary`}

Respond in this exact JSON format (no markdown, no extra text):
{
  "definition": "A clear, simple definition in English",
  "phonetic": "IPA pronunciation",
  "example_sentence": "A natural example sentence in ${label} showing everyday usage",
  "usage_tip": "A tip for learners — a common mistake to avoid or a useful note",
  "regional_note": "If this word or its usage commonly differs across regions/dialects, briefly note that as neutral trivia. Otherwise write null."
}`;

    const raw = await generate(prompt, 'explain');
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const data = JSON.parse(cleaned);

    if (word_id) {
      try {
        await db.query(`
          UPDATE lang_words
          SET
            definition       = CASE WHEN (definition IS NULL OR definition = '') THEN $1 ELSE definition END,
            example_sentence = CASE WHEN (example_sentence IS NULL OR example_sentence = '') THEN $2 ELSE example_sentence END,
            phonetic          = CASE WHEN (phonetic IS NULL OR phonetic = '') THEN $3 ELSE phonetic END
          WHERE id = $4
        `, [data.definition || null, data.example_sentence || null, data.phonetic || null, word_id]);
      } catch (backfillErr) {
        console.warn(`[LangMasterclass] ${language} word-explain backfill failed:`, backfillErr.message);
      }
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error(`[LangMasterclass] POST /${language}/word-explain`, err.message);
    res.status(500).json({ success: false, error: 'Could not generate explanation.' });
  }
});

// POST /api/language-masterclass/:language/sessions
// Saves one practice session's tally, updates per-word progress and
// aggregate streak/accuracy stats, and reports whether this session just
// unlocked a new level. Mirrors English Masterclass's /sessions exactly,
// generalized by language and table (lang_* instead of em_*).
router.post('/:language/sessions', async (req, res) => {
  const { language } = req.params;
  const { category_id, difficulty, total_words, correct_words, duration_secs, answers } = req.body;
  const userId = req.user.id;

  if (!Number.isInteger(total_words) || !Number.isInteger(correct_words) || total_words <= 0) {
    return res.status(400).json({ success: false, error: 'total_words must be a positive integer and correct_words must be an integer' });
  }
  if (correct_words < 0 || correct_words > total_words) {
    return res.status(400).json({ success: false, error: 'correct_words must be between 0 and total_words' });
  }

  // Same "null (not 0) unless attempted" averaging as EM — a student who
  // never touches the mic/writing box this session shouldn't have their
  // average dragged down by zeros that were never actually scored.
  const pronScores = Array.isArray(answers)
    ? answers.map(a => a.pronunciation_score).filter(s => typeof s === 'number')
    : [];
  const avgPronunciation = pronScores.length
    ? Math.round((pronScores.reduce((s, v) => s + v, 0) / pronScores.length) * 100) / 100
    : null;

  const writingScores = Array.isArray(answers)
    ? answers.map(a => a.writing_score).filter(s => typeof s === 'number')
    : [];
  const avgWriting = writingScores.length
    ? Math.round((writingScores.reduce((s, v) => s + v, 0) / writingScores.length) * 100) / 100
    : null;

  try {
    const beforeUnlocked = computeUnlocked(await getLevelTotals(userId, language));

    // 1. Save session
    await db.query(`
      INSERT INTO lang_practice_sessions (user_id, language, category_id, difficulty, total_words, correct_words, pronunciation_score, writing_score)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [userId, language, category_id || null, difficulty || null, total_words, correct_words, avgPronunciation, avgWriting]);

    // 2. Update per-word progress
    if (Array.isArray(answers)) {
      for (const a of answers) {
        if (!a.word_id) continue;
        await db.query(`
          INSERT INTO lang_word_progress (user_id, language, word_id, correct_attempts, total_attempts, last_practiced, mastered)
          VALUES ($1, $2, $3, $4, 1, NOW(), false)
          ON CONFLICT (user_id, word_id) DO UPDATE SET
            correct_attempts = lang_word_progress.correct_attempts + $4,
            total_attempts   = lang_word_progress.total_attempts + 1,
            last_practiced   = NOW(),
            mastered         = (lang_word_progress.correct_attempts + $4) >= 3,
            updated_at       = NOW()
        `, [userId, language, a.word_id, a.correct ? 1 : 0]);
      }
    }

    // 3. Upsert aggregate stats (streak logic)
    const today = new Date().toISOString().split('T')[0];
    const accuracy = Math.round((correct_words / total_words) * 100 * 100) / 100;
    const stats = await q1(`SELECT * FROM lang_user_stats WHERE user_id = $1 AND language = $2`, [userId, language]);

    if (stats) {
      const lastDate  = stats.last_practice_date ? String(stats.last_practice_date).split('T')[0] : null;
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const streak    = lastDate === yesterday ? stats.practice_streak + 1
                      : lastDate === today     ? stats.practice_streak
                      : 1;
      const longestStreak = Math.max(stats.longest_streak, streak);
      const newLearned  = stats.words_learned + correct_words;
      const newSessions = stats.total_sessions + 1;
      const newAccuracy = ((stats.overall_accuracy * stats.total_sessions) + accuracy) / newSessions;

      await db.query(`
        UPDATE lang_user_stats SET
          words_learned       = $1,
          practice_streak      = $2,
          longest_streak       = $3,
          total_sessions       = $4,
          total_practice_secs  = total_practice_secs + $5,
          overall_accuracy     = $6,
          last_practice_date   = $7,
          updated_at           = NOW()
        WHERE user_id = $8 AND language = $9
      `, [newLearned, streak, longestStreak, newSessions, duration_secs || 0, newAccuracy, today, userId, language]);
    } else {
      await db.query(`
        INSERT INTO lang_user_stats
          (user_id, language, words_learned, practice_streak, longest_streak, total_sessions, total_practice_secs, overall_accuracy, last_practice_date)
        VALUES ($1, $2, $3, 1, 1, 1, $4, $5, $6)
      `, [userId, language, correct_words, duration_secs || 0, accuracy, today]);
    }

    // words_mastered is a rollup of lang_word_progress, refreshed here so
    // /progress doesn't need a live COUNT on every read.
    await db.query(`
      UPDATE lang_user_stats SET words_mastered = (
        SELECT COUNT(*)::int FROM lang_word_progress WHERE user_id = $1 AND language = $2 AND mastered = true
      ) WHERE user_id = $1 AND language = $2
    `, [userId, language]);

    const afterUnlocked = computeUnlocked(await getLevelTotals(userId, language));
    let newlyUnlockedLevel = null;
    if (!beforeUnlocked.Intermediate && afterUnlocked.Intermediate) newlyUnlockedLevel = 'Intermediate';
    else if (!beforeUnlocked.Advanced && afterUnlocked.Advanced)     newlyUnlockedLevel = 'Advanced';

    res.json({ success: true, message: 'Session saved.', newly_unlocked_level: newlyUnlockedLevel });
  } catch (err) {
    console.error(`[LangMasterclass] POST /${language}/sessions`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/language-masterclass/:language/progress
// The logged-in student's stats + recent sessions for this language —
// mirrors English Masterclass's /progress, feeds a future dashboard card.
router.get('/:language/progress', async (req, res) => {
  const { language } = req.params;
  const userId = req.user.id;
  try {
    const [stats, sessions, masteredCount] = await Promise.all([
      q1(`SELECT * FROM lang_user_stats WHERE user_id = $1 AND language = $2`, [userId, language]),
      q(`SELECT ps.*, c.icon_emoji, c.name AS category_name
           FROM lang_practice_sessions ps
           LEFT JOIN lang_categories c ON c.id = ps.category_id
          WHERE ps.user_id = $1 AND ps.language = $2
          ORDER BY ps.created_at DESC
          LIMIT 10`, [userId, language]),
      q1(`SELECT COUNT(*)::int AS count FROM lang_word_progress WHERE user_id = $1 AND language = $2 AND mastered = true`, [userId, language]),
    ]);

    res.json({
      success: true,
      data: {
        stats: stats || {
          words_learned: 0, words_mastered: 0, practice_streak: 0,
          longest_streak: 0, total_sessions: 0, overall_accuracy: 0,
        },
        mastered_count: masteredCount?.count || 0,
        recent_sessions: sessions,
      },
    });
  } catch (err) {
    console.error(`[LangMasterclass] GET /${language}/progress`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/language-masterclass/:language/level-progress
router.get('/:language/level-progress', async (req, res) => {
  const { language } = req.params;
  try {
    const byDiff = await getLevelTotals(req.user.id, language);

    // Per-level detail for progress bars: "18/30 questions, 82% accuracy".
    // Same shape as English Masterclass's level_detail (see getLevelTotals's
    // comment above) — kept identical on purpose so LangLevelGate.jsx can
    // consume this exactly like EM's LevelGate.jsx does.
    const levelDetail = {};
    ['Beginner', 'Intermediate', 'Advanced'].forEach(diff => {
      const t = byDiff[diff] || { totalWords: 0, correctWords: 0 };
      levelDetail[diff] = {
        questions_answered: t.totalWords,
        questions_required: QUESTIONS_PER_LEVEL,
        accuracy: t.totalWords ? Math.round((t.correctWords / t.totalWords) * 1000) / 10 : 0,
        accuracy_required: LEVEL_UNLOCK_ACCURACY,
        passed: hasPassedLevel(byDiff, diff),
      };
    });

    res.json({
      success: true,
      data: {
        unlocked: computeUnlocked(byDiff),
        totals: byDiff,
        level_detail: levelDetail,
        questions_per_level: QUESTIONS_PER_LEVEL,
        unlock_accuracy: LEVEL_UNLOCK_ACCURACY,
      },
    });
  } catch (err) {
    console.error(`[LangMasterclass] GET /${language}/level-progress`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES — content CMS for lang_categories / lang_words, generalized by
// :language. Mirrors englishMasterclassRoutes.js's admin block exactly (same
// shape, same endpoints) so AdminLanguageMasterclass.jsx on the frontend can
// reuse the same UI patterns AdminEnglishMasterclass.jsx already established.
// Gated by requireLanguageEnabled above (applies to all /:language/* routes),
// so this only ever manages content for a language that's actually live.
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/language-masterclass/:language/admin/categories
router.get('/:language/admin/categories', adminOnly, async (req, res) => {
  const { language } = req.params;
  try {
    const rows = await q(`
      SELECT c.*, COUNT(w.id)::int AS word_count
        FROM lang_categories c
        LEFT JOIN lang_words w ON w.category_id = c.id
       WHERE c.language = $1
       GROUP BY c.id
       ORDER BY c.order_index ASC, c.name ASC
    `, [language]);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/language-masterclass/:language/admin/categories
router.post('/:language/admin/categories', adminOnly, async (req, res) => {
  const { language } = req.params;
  const { name, description, difficulty, icon_emoji, order_index } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'name is required' });
  try {
    const row = await q1(`
      INSERT INTO lang_categories (language, name, description, difficulty, icon_emoji, order_index, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [language, name, description || '', difficulty || 'Beginner', icon_emoji || '📚', order_index || 0, req.user.id]);
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: `A category named "${name}" already exists for this language.` });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/language-masterclass/:language/admin/categories/:id
router.patch('/:language/admin/categories/:id', adminOnly, async (req, res) => {
  const { language, id } = req.params;
  const { name, description, difficulty, icon_emoji, order_index, is_active } = req.body;
  try {
    const row = await q1(`
      UPDATE lang_categories SET
        name        = COALESCE($1, name),
        description = COALESCE($2, description),
        difficulty  = COALESCE($3, difficulty),
        icon_emoji  = COALESCE($4, icon_emoji),
        order_index = COALESCE($5, order_index),
        is_active   = COALESCE($6, is_active),
        updated_at  = NOW()
      WHERE id = $7 AND language = $8
      RETURNING *
    `, [name, description, difficulty, icon_emoji, order_index, is_active, id, language]);
    if (!row) return res.status(404).json({ success: false, error: 'Category not found' });
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/language-masterclass/:language/admin/categories/:id
router.delete('/:language/admin/categories/:id', adminOnly, async (req, res) => {
  const { language, id } = req.params;
  try {
    await db.query(`DELETE FROM lang_categories WHERE id = $1 AND language = $2`, [id, language]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/language-masterclass/:language/admin/words?category_id=...
router.get('/:language/admin/words', adminOnly, async (req, res) => {
  const { language } = req.params;
  const { category_id } = req.query;
  try {
    const rows = await q(`
      SELECT w.*, c.name AS category_name
        FROM lang_words w
        JOIN lang_categories c ON c.id = w.category_id
       WHERE c.language = $1
       ${category_id ? 'AND w.category_id = $2' : ''}
       ORDER BY c.order_index, w.word ASC
    `, category_id ? [language, category_id] : [language]);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/language-masterclass/:language/admin/words
router.post('/:language/admin/words', adminOnly, async (req, res) => {
  const { category_id, word, phonetic, definition, example_sentence, icon_emoji } = req.body;
  if (!category_id || !word) return res.status(400).json({ success: false, error: 'category_id and word are required' });
  try {
    const row = await q1(`
      INSERT INTO lang_words (category_id, word, phonetic, definition, example_sentence, icon_emoji, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (category_id, word) DO NOTHING
      RETURNING *
    `, [category_id, word.trim(), phonetic, definition, example_sentence, icon_emoji || null, req.user.id]);
    if (!row) return res.status(409).json({ success: false, error: 'Word already exists in this category' });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/language-masterclass/:language/admin/words/:id
router.patch('/:language/admin/words/:id', adminOnly, async (req, res) => {
  const { word, phonetic, definition, example_sentence, icon_emoji, is_active } = req.body;
  try {
    const row = await q1(`
      UPDATE lang_words SET
        word             = COALESCE($1, word),
        phonetic         = COALESCE($2, phonetic),
        definition       = COALESCE($3, definition),
        example_sentence = COALESCE($4, example_sentence),
        icon_emoji       = COALESCE($5, icon_emoji),
        is_active        = COALESCE($6, is_active),
        updated_at       = NOW()
      WHERE id = $7
      RETURNING *
    `, [word, phonetic, definition, example_sentence, icon_emoji, is_active, req.params.id]);
    if (!row) return res.status(404).json({ success: false, error: 'Word not found' });
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/language-masterclass/:language/admin/words/:id
router.delete('/:language/admin/words/:id', adminOnly, async (req, res) => {
  try {
    await db.query(`DELETE FROM lang_words WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/language-masterclass/:language/admin/generate-words
// Admin: use Gemini to generate a word list for a category, in the target
// language (not English) — the one real difference from EM's version of
// this route.
router.post('/:language/admin/generate-words', adminOnly, async (req, res) => {
  const { language } = req.params;
  const label = LANGUAGE_LABEL[language];
  const { category_id, category_name, difficulty, count = 10 } = req.body;
  if (!category_id || !category_name) {
    return res.status(400).json({ success: false, error: 'category_id and category_name are required' });
  }

  try {
    const prompt = `You are an expert ${label} language teacher creating vocabulary lists for learners around the world.

Generate ${Math.min(count, 20)} ${label} vocabulary words/phrases for the category: "${category_name}" (difficulty: ${difficulty || 'Beginner'}).

IMPORTANT:
- The "word" field must be in ${label}, not English.
- Phonetics should use standard IPA (or a clear romanization for non-Latin scripts).
- Example sentences must be natural ${label} sentences using the word.
- The definition should be in clear, simple English.

Respond ONLY with a JSON array, no markdown, no extra text:
[
  {
    "word": "the ${label} word or phrase",
    "phonetic": "/IPA/ or romanization",
    "definition": "Clear, simple English definition",
    "example_sentence": "A natural ${label} example sentence"
  }
]`;

    const raw     = await generate(prompt, 'generate-questions');
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const words   = JSON.parse(cleaned);

    if (!Array.isArray(words)) throw new Error('Gemini did not return an array');

    const inserted = [];
    for (const w of words) {
      if (!w.word) continue;
      try {
        const row = await q1(`
          INSERT INTO lang_words (category_id, word, phonetic, definition, example_sentence, created_by)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (category_id, word) DO NOTHING
          RETURNING *
        `, [category_id, w.word.trim(), w.phonetic, w.definition, w.example_sentence, req.user.id]);
        if (row) inserted.push(row);
      } catch (_) { /* skip individual insert errors */ }
    }

    res.json({
      success:  true,
      inserted: inserted.length,
      skipped:  words.length - inserted.length,
      data:     inserted,
    });
  } catch (err) {
    console.error(`[LangMasterclass] POST /${language}/admin/generate-words`, err.message);
    res.status(500).json({ success: false, error: 'AI generation failed: ' + err.message });
  }
});

module.exports = router;
