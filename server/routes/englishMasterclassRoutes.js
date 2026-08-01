'use strict';
// server/routes/englishMasterclassRoutes.js
// All routes for the English Masterclass module.
// Mounted at /api/english-masterclass with protect middleware already applied.

const express    = require('express');
const router     = express.Router();
const { Pool }   = require('pg');
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

// ─── level-unlock rules ────────────────────────────────────────────────────
// A student unlocks the next difficulty tier once they've answered at least
// QUESTIONS_PER_LEVEL questions (cumulative, across however many sessions it
// takes — not one sitting) within the current tier, at LEVEL_UNLOCK_ACCURACY%
// or better overall.
//
// Why cumulative rather than "one 30-question session": each category only
// seeds 5-10 words today (see em_words seed data), so no single category
// session can reach 30 questions without a large content-authoring pass this
// change didn't include. Cumulative-across-sessions delivers the "30
// questions per level" requirement today without reseeding content, and
// naturally encourages practicing multiple categories within a tier before
// advancing — which is arguably the better learning behaviour anyway.
const QUESTIONS_PER_LEVEL     = 30;
const LEVEL_UNLOCK_ACCURACY   = 70;

// Cumulative { totalWords, correctWords } per difficulty for a user.
//
// Deliberately reads ps.difficulty (frozen on the session row at save-time)
// rather than joining live to em_categories.difficulty. A category can be
// hard-deleted by an admin at any time (em_practice_sessions.category_id is
// ON DELETE SET NULL, not CASCADE) — an INNER JOIN here would silently drop
// every session that ever used that category out of a student's totals,
// potentially re-locking a level they'd already legitimately earned. Once a
// session is saved, its contribution to level math must never depend on the
// category continuing to exist.
async function getLevelTotals(userId) {
  const rows = await q(`
    SELECT ps.difficulty,
           COALESCE(SUM(ps.total_words), 0)::int   AS total_words,
           COALESCE(SUM(ps.correct_words), 0)::int AS correct_words
      FROM em_practice_sessions ps
     WHERE ps.user_id = $1
       AND ps.difficulty IS NOT NULL
     GROUP BY ps.difficulty
  `, [userId]);
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

// Which tier does passing `diff` unlock? null if there's nothing further.
const NEXT_LEVEL = { Beginner: 'Intermediate', Intermediate: 'Advanced', Advanced: null };

// ═════════════════════════════════════════════════════════════════════════════
// EM REGISTRATION — separate one-time opt-in, distinct from AISchoolOnAir signup
// ═════════════════════════════════════════════════════════════════════════════
// A valid AISchoolOnAir login is NOT enough to use English Masterclass. The
// user must explicitly hit this endpoint once. It reuses the same `users`
// row/credentials rather than a second account, but still enforces the
// "one registration does not cover both apps" requirement via the
// em_registered_at gate below.
//
// This route is intentionally declared BEFORE requireEmRegistration so a
// student who isn't registered yet can still call it.
router.post('/register', async (req, res) => {
  const userId = req.user.id;

  // Tenant boundary: a student linked to a school can only register for EM
  // if that school was actually provisioned for it. req.school is set by
  // protect (server/middleware/auth.js) when the user has a school_id — this
  // reuses that lookup rather than querying again. Standalone students
  // (no school_id) are unaffected, same as before.
  if (req.school && !req.school.enable_em) {
    return res.status(403).json({
      success: false,
      error: 'Your school has not been registered for English Masterclass. Contact your school admin or App Admin.',
      code: 'EM_NOT_ENABLED_FOR_SCHOOL',
    });
  }

  // Tenant students: nothing to register — access is already fully
  // determined by the school gate above (see requireEmRegistration's
  // updated comment for why). Harmless no-op success rather than an
  // error, matching languageMasterclassRoutes.js's identical Prompt-1
  // pattern for the other 7 languages, in case a stale bookmark or the
  // pre-pivot frontend still calls this.
  if (req.school) {
    return res.json({ success: true, em_registered_at: req.user.em_registered_at || new Date().toISOString() });
  }

  try {
    const row = await q1(
      `UPDATE users
          SET em_registered_at = COALESCE(em_registered_at, NOW())
        WHERE id = $1
        RETURNING em_registered_at`,
      [userId]
    );
    if (!row) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, em_registered_at: row.em_registered_at });
  } catch (err) {
    console.error('[EM] POST /register', err.message);
    res.status(500).json({ success: false, error: 'Could not complete English Masterclass registration.' });
  }
});

// Gate: students must have completed EM registration before touching any
// other EM route. App Admin (role 'admin', global — manages EM content
// platform-wide, never tied to a school) passes through untouched.
//
// Also enforces the tenant boundary live, on every request, for EVERY role
// tied to a tenant school — student, teacher, and school_admin — not just
// students: if a school has since had enable_em turned off
// (PATCH /schools/:id/services), everyone at that school loses EM access
// immediately, not just students at their next registration attempt.
// req.school is set by protect (server/middleware/auth.js) for any
// student/teacher/school_admin with a school_id; standalone users (no
// school_id) have req.school undefined and are unaffected.
function requireEmRegistration(req, res, next) {
  if (req.school && !req.school.enable_em) {
    return res.status(403).json({
      success: false,
      error: 'Your school has not been registered for English Masterclass. Contact your school admin or App Admin.',
      code: 'EM_NOT_ENABLED_FOR_SCHOOL',
    });
  }
  // Tenant students: access is fully determined by the school gate above.
  // This mirrors Prompt 1's collapse of the per-language access model
  // (languageMasterclassRoutes.js's requireLanguageRegistration) — that
  // change never touched THIS file, so tenant students at a fully-enabled
  // school were still being blocked here until a manual one-time click,
  // contradicting Da's explicit "no other registration needed... ALL
  // LANGUAGES" instruction. English is one of the 8 languages; it should
  // not have been the one exception.
  //
  // Standalone (non-tenant) users are deliberately left requiring
  // em_registered_at — English Masterclass's standalone path is its own
  // parallel signup flow (registerForEnglishMasterclass in auth.js,
  // EMSignupPage.jsx) with its own account-creation semantics, separate
  // from the 8-language user_language_registrations system Prompt 1's
  // standalone-user symmetric-unlock decision applies to. Unifying those
  // two standalone paths is a real, separate decision — flagged to Da
  // rather than silently folded in here.
  if (req.school) return next();
  if (req.user.role !== 'student') return next();
  if (!req.user.em_registered_at) {
    return res.status(403).json({
      success: false,
      error: 'You need to register for English Masterclass before you can access it.',
      code: 'EM_REGISTRATION_REQUIRED',
    });
  }
  next();
}
router.use(requireEmRegistration);

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC (student-facing) ROUTES
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/english-masterclass/categories
// List all active categories with word counts
router.get('/categories', async (req, res) => {
  try {
    const rows = await q(`
      SELECT c.id, c.name, c.description, c.difficulty, c.icon_emoji,
             COUNT(w.id)::int AS word_count
        FROM em_categories c
        LEFT JOIN em_words w ON w.category_id = c.id AND w.is_active = true
       WHERE c.is_active = true
       GROUP BY c.id
       ORDER BY c.order_index ASC, c.name ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[EM] GET /categories', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/english-masterclass/categories/:id/words
// Return up to 10 random active words for a session
router.get('/categories/:id/words', async (req, res) => {
  try {
    const rows = await q(`
      SELECT w.id, w.word, w.phonetic, w.definition, w.example_sentence, w.difficulty
        FROM em_words w
       WHERE w.category_id = $1 AND w.is_active = true
       ORDER BY RANDOM()
       LIMIT 10
    `, [req.params.id]);

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'No words found for this category yet.' });
    }
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[EM] GET /categories/:id/words', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/english-masterclass/audio
// Generate spoken-word TTS audio via Gemini, return base64 audio
router.post('/audio', async (req, res) => {
  const { word } = req.body;
  if (!word) return res.status(400).json({ success: false, error: 'word is required' });

  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        parts: [{
          text: `You are an English language tutor. 
Speak the following word clearly in standard, neutral English pronunciation, 
slowly and clearly so a learner can hear each sound distinctly. 
Say only the word, nothing else: "${word}"`
        }]
      }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          // 'Kore' is one of Gemini's built-in TTS voices — a neutral voice
          // name, not tied to any national accent. (The previous value,
          // 'en-GB-Standard-B', is a Google Cloud Text-to-Speech voice name
          // format, not a valid name for this API — it wasn't just
          // British-branded, it likely wasn't working at all, silently
          // falling through to the browser TTS fallback every time.)
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }
          }
        }
      }
    });

    // Extract audio from response
    const audioPart = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('audio/'));

    if (audioPart?.inlineData?.data) {
      return res.json({
        success: true,
        audio: audioPart.inlineData.data,
        mimeType: audioPart.inlineData.mimeType,
      });
    }

    // Fallback: Gemini audio not available on this tier — signal client to use browser TTS
    return res.json({ success: false, fallback: true, error: 'Gemini audio unavailable, use browser TTS' });

  } catch (err) {
    console.error('[EM] POST /audio', err.message);
    // Non-fatal: client falls back to browser TTS
    res.json({ success: false, fallback: true, error: err.message });
  }
});

// POST /api/english-masterclass/pronunciation-score
// Mic-based speaking practice. The client records a short clip of the
// student saying `word` and sends it here as base64 audio. Gemini transcribes
// and scores it.
//
// Accent fairness: the prompt explicitly instructs the model NOT to grade
// against a single "native" accent standard (British/American/etc). Nigerian
// English, Indian English, and other World Englishes are all valid targets —
// scoring is about whether the word was produced clearly and recognisably,
// not about matching one accent. This is the "internationally acceptable"
// framing requested — a Nigerian student should not be marked down for
// sounding Nigerian.
router.post('/pronunciation-score', pronunciationLimiter, async (req, res) => {
  const { word, word_id, audio, mime_type } = req.body;
  const userId = req.user.id;
  if (!word)  return res.status(400).json({ success: false, error: 'word is required' });
  if (!audio) return res.status(400).json({ success: false, error: 'audio is required' });

  // Guard against oversized payloads — a few seconds of speech is at most
  // a few hundred KB; reject anything absurd rather than pass it to Gemini.
  if (audio.length > 4_000_000) {
    return res.status(413).json({ success: false, error: 'That recording is too long. Please keep it to one word.' });
  }

  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `You are a supportive English pronunciation coach for learners around the world (Nigeria, India, and elsewhere all use valid, legitimate English accents).

The student was asked to say the word: "${word}"

Listen to the attached audio and evaluate it. Judge ONLY whether the word is clearly and recognisably produced — correct syllables, correct sounds, correct stress. Do NOT penalise the student for having a Nigerian, Indian, or any other non-British/non-American accent. Only mark it down if the word itself is genuinely unclear, mispronounced (wrong sounds/syllables), or a different word entirely.

Respond in this exact JSON format, no markdown, no extra text:
{
  "heard": "what you heard the student say, as plain text",
  "score": <integer 0-100>,
  "matched": <true if it is recognisably the target word, false otherwise>,
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

    // Persist the attempt, including the audio clip itself, so scores can be
    // audited/re-graded later instead of only surviving as a session average.
    // Non-fatal: a storage failure must not break the student's result.
    let audioUrl = null;
    try {
      if (r2.isR2Enabled()) {
        const buffer = Buffer.from(audio, 'base64');
        const ext = (mime_type || 'audio/webm').split('/')[1]?.split(';')[0] || 'webm';
        const uploaded = await r2.uploadBuffer({
          buffer,
          originalname: `pronunciation-${userId}-${Date.now()}.${ext}`,
          mimetype: mime_type || 'audio/webm',
        });
        audioUrl = uploaded?.url || null;
      }
      await db.query(`
        INSERT INTO em_pronunciation_attempts
          (user_id, word_id, word_text, audio_url, heard, score, matched, feedback)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [userId, word_id || null, word, audioUrl, data.heard || null, score, !!data.matched, data.feedback || null]);
    } catch (persistErr) {
      console.warn('[EM] pronunciation-score persistence failed:', persistErr.message);
    }

    return res.json({
      success: true,
      score,
      heard: data.heard || '',
      matched: !!data.matched,
      feedback: data.feedback || '',
    });
  } catch (err) {
    console.error('[EM] POST /pronunciation-score', err.message);
    res.status(500).json({ success: false, error: 'Pronunciation check is temporarily unavailable. Please try again shortly.' });
  }
});

// POST /api/english-masterclass/writing-score
// Short writing exercise: student writes a sentence using `word`, in
// response to `prompt`. Gemini grades usage/grammar/clarity and the
// attempt is persisted (unlike pronunciation, there's no separate binary
// blob to store — the text submission IS the artifact, so it's saved as-is).
router.post('/writing-score', pronunciationLimiter, async (req, res) => {
  const { word, word_id, prompt, text, sentence_count } = req.body;
  const userId = req.user.id;
  if (!word)  return res.status(400).json({ success: false, error: 'word is required' });
  if (!text || !text.trim()) return res.status(400).json({ success: false, error: 'text is required' });
  if (text.length > 4000) {
    return res.status(413).json({ success: false, error: 'That response is too long. Please shorten it a little.' });
  }

  // How many sentences was the student actually asked for? Default to 1 for
  // older clients / direct API calls that don't send it.
  const requiredCount = Number.isInteger(sentence_count) && sentence_count > 0 ? sentence_count : 1;

  const effectivePrompt = prompt || (requiredCount === 1
    ? `Write one sentence using the word "${word}" correctly.`
    : `Write ${requiredCount} different sentences using the word "${word}" correctly.`);

  try {
    const gradingPrompt = `You are a supportive English writing coach for learners around the world (Nigeria, India, Britain, the US, and elsewhere all use valid, legitimate English). Do NOT penalise regional vocabulary or spelling choices that are correct in World Englishes — only genuine grammar errors or misuse of the target word.

The student was asked to: "${effectivePrompt}"
They needed to write exactly ${requiredCount} distinct sentence(s), each correctly using the target word.
Target word: "${word}"
Student's response: "${text.trim()}"

First, count how many separate sentences the student actually wrote (lines/sentences separated by line breaks, full stops, or similar). Then evaluate whether the target word was used correctly (right meaning, right grammatical form) in each sentence, and whether each sentence is grammatically sound.

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
        INSERT INTO em_writing_submissions
          (user_id, word_id, word_text, prompt, submission_text, score, used_word_correctly, grammar_notes, feedback,
           sentence_count_required, sentence_count_written, sentence_count_met)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `, [userId, word_id || null, word, effectivePrompt, text.trim(), score, !!data.used_word_correctly, data.grammar_notes || null, data.feedback || null,
          requiredCount, sentencesWritten, sentenceCountMet]);
    } catch (persistErr) {
      console.warn('[EM] writing-score persistence failed:', persistErr.message);
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
    console.error('[EM] POST /writing-score', err.message);
    res.status(500).json({ success: false, error: 'Writing check is temporarily unavailable. Please try again shortly.' });
  }
});

// POST /api/english-masterclass/word-explain
// AI generates definition, example sentence, and usage tip for a word.
// Accepts optional word_id — if supplied and the word's DB fields are empty,
// the AI result is backfilled so subsequent students get it instantly (GAP 2).
router.post('/word-explain', async (req, res) => {
  const { word, context, word_id } = req.body;
  if (!word) return res.status(400).json({ success: false, error: 'word is required' });

  try {
    const prompt = `You are an expert English language teacher helping a student in Nigeria build strong, internationally understood English vocabulary.

Provide the following for the word: "${word}"
Context (category): ${context || 'General English vocabulary'}

Respond in this exact JSON format (no markdown, no extra text):
{
  "definition": "A clear, simple definition in plain English",
  "phonetic": "IPA pronunciation e.g. /ˈwɔːtər/",
  "example_sentence": "A natural example sentence showing everyday usage",
  "usage_tip": "A tip specific to Nigerian learners — common mistake to avoid or cultural note",
  "regional_note": "If this word or its spelling commonly differs across English-speaking regions (e.g. British vs American), briefly note that as neutral trivia. Otherwise write null."
}`;

    const raw = await generate(prompt, 'explain');
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const data = JSON.parse(cleaned);

    // GAP 2: Backfill DB — only write if the word row has empty/null fields
    // (never overwrite admin-curated content)
    if (word_id) {
      try {
        await db.query(`
          UPDATE em_words
          SET
            definition       = CASE WHEN (definition IS NULL OR definition = '') THEN $1 ELSE definition END,
            example_sentence = CASE WHEN (example_sentence IS NULL OR example_sentence = '') THEN $2 ELSE example_sentence END,
            phonetic         = CASE WHEN (phonetic IS NULL OR phonetic = '') THEN $3 ELSE phonetic END,
            updated_at       = NOW()
          WHERE id = $4
        `, [data.definition || null, data.example_sentence || null, data.phonetic || null, word_id]);
      } catch (backfillErr) {
        // Non-fatal: backfill failure must not break the student's explain response
        console.warn('[EM] word-explain backfill failed:', backfillErr.message);
      }
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('[EM] POST /word-explain', err.message);
    res.status(500).json({ success: false, error: 'Could not generate explanation.' });
  }
});

// POST /api/english-masterclass/sessions
// Save a completed practice session and update user stats
router.post('/sessions', async (req, res) => {
  const userId = req.user.id;
  const { category_id, category_name, total_words, correct_words, duration_secs, answers } = req.body;

  if (!total_words || total_words < 1) {
    return res.status(400).json({ success: false, error: 'Invalid session data' });
  }

  const accuracy = Math.round((correct_words / total_words) * 100 * 100) / 100;

  // Average pronunciation_score across answers that actually attempted the
  // mic exercise. Speaking practice is optional per word, so this stays null
  // (not 0) when nobody used the mic — a student who never touches the mic
  // shouldn't have their average dragged down.
  const pronScores = Array.isArray(answers)
    ? answers.map(a => a.pronunciation_score).filter(s => typeof s === 'number')
    : [];
  const avgPronunciation = pronScores.length
    ? Math.round((pronScores.reduce((s, v) => s + v, 0) / pronScores.length) * 100) / 100
    : null;

  // Same logic for writing_score: null (not 0) when nobody attempted the
  // writing exercise for any word this session, so averages aren't dragged down.
  const writingScores = Array.isArray(answers)
    ? answers.map(a => a.writing_score).filter(s => typeof s === 'number')
    : [];
  const avgWriting = writingScores.length
    ? Math.round((writingScores.reduce((s, v) => s + v, 0) / writingScores.length) * 100) / 100
    : null;

  try {
    // Snapshot unlock state BEFORE this session counts, so we can tell if
    // saving it just pushed the student over the line into a new level.
    const beforeUnlocked = computeUnlocked(await getLevelTotals(userId));

    // Freeze the category's difficulty onto the session row now, while the
    // category still (probably) exists — see getLevelTotals for why this
    // must not be looked up live at read-time. If the category has already
    // been deleted out from under an in-flight session (category_id sent by
    // the client no longer resolves), difficulty stays NULL and this
    // session simply won't count toward any level's totals, which is the
    // same as today's behaviour for a session with no category at all —
    // never a crash, never a silent regression of past progress.
    let difficulty = null;
    if (category_id) {
      const cat = await q1(`SELECT difficulty FROM em_categories WHERE id = $1`, [category_id]);
      difficulty = cat?.difficulty || null;
    }

    // 1. Save session
    await db.query(`
      INSERT INTO em_practice_sessions (user_id, category_id, category_name, total_words, correct_words, accuracy, duration_secs, pronunciation_score, writing_score, difficulty)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [userId, category_id || null, category_name, total_words, correct_words, accuracy, duration_secs || 0, avgPronunciation, avgWriting, difficulty]);

    // 2. Update per-word progress
    if (Array.isArray(answers)) {
      for (const a of answers) {
        await db.query(`
          INSERT INTO em_word_progress (user_id, word_id, correct_attempts, total_attempts, last_practiced, mastered)
          VALUES ($1, $2, $3, 1, NOW(), false)
          ON CONFLICT (user_id, word_id) DO UPDATE SET
            correct_attempts = em_word_progress.correct_attempts + $3,
            total_attempts   = em_word_progress.total_attempts + 1,
            last_practiced   = NOW(),
            mastered         = (em_word_progress.correct_attempts + $3) >= 3,
            updated_at       = NOW()
        `, [userId, a.word_id, a.correct ? 1 : 0]);
      }
    }

    // 3. Upsert aggregate stats (streak logic)
    const today = new Date().toISOString().split('T')[0];
    const stats = await q1(`SELECT * FROM em_user_stats WHERE user_id = $1`, [userId]);

    if (stats) {
      const lastDate  = stats.last_practice_date ? stats.last_practice_date.toISOString?.().split('T')[0] || String(stats.last_practice_date).split('T')[0] : null;
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const streak    = lastDate === yesterday ? stats.practice_streak + 1
                      : lastDate === today     ? stats.practice_streak
                      : 1;
      const longestStreak = Math.max(stats.longest_streak, streak);
      const newLearned  = stats.words_learned + correct_words;
      const newSessions = stats.total_sessions + 1;
      const newAccuracy = ((stats.overall_accuracy * stats.total_sessions) + accuracy) / newSessions;

      await db.query(`
        UPDATE em_user_stats SET
          words_learned       = $1,
          practice_streak     = $2,
          longest_streak      = $3,
          total_sessions      = $4,
          total_practice_secs = total_practice_secs + $5,
          overall_accuracy    = $6,
          last_practice_date  = $7,
          updated_at          = NOW()
        WHERE user_id = $8
      `, [newLearned, streak, longestStreak, newSessions, duration_secs || 0, newAccuracy, today, userId]);
    } else {
      await db.query(`
        INSERT INTO em_user_stats
          (user_id, words_learned, practice_streak, longest_streak, total_sessions, total_practice_secs, overall_accuracy, last_practice_date)
        VALUES ($1, $2, 1, 1, 1, $3, $4, $5)
      `, [userId, correct_words, duration_secs || 0, accuracy, today]);
    }

    // Did saving this session just cross the 30-question / 70%-accuracy line
    // for a level that was locked a moment ago? Compare snapshots.
    const afterUnlocked = computeUnlocked(await getLevelTotals(userId));
    let newlyUnlockedLevel = null;
    if (!beforeUnlocked.Intermediate && afterUnlocked.Intermediate) newlyUnlockedLevel = 'Intermediate';
    else if (!beforeUnlocked.Advanced && afterUnlocked.Advanced)     newlyUnlockedLevel = 'Advanced';

    res.json({
      success: true,
      message: 'Session saved.',
      newly_unlocked_level: newlyUnlockedLevel,
    });
  } catch (err) {
    console.error('[EM] POST /sessions', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/english-masterclass/progress
// Get the logged-in student's stats + recent sessions
router.get('/progress', async (req, res) => {
  const userId = req.user.id;
  try {
    const [stats, sessions, masteredCount] = await Promise.all([
      q1(`SELECT * FROM em_user_stats WHERE user_id = $1`, [userId]),
      q(`SELECT ps.*, c.icon_emoji
           FROM em_practice_sessions ps
           LEFT JOIN em_categories c ON c.id = ps.category_id
          WHERE ps.user_id = $1
          ORDER BY ps.created_at DESC
          LIMIT 10`, [userId]),
      q1(`SELECT COUNT(*)::int AS count FROM em_word_progress WHERE user_id = $1 AND mastered = true`, [userId]),
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
      }
    });
  } catch (err) {
    console.error('[EM] GET /progress', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/english-masterclass/level-progress
// Returns which difficulty tiers are unlocked for the current student.
// Rules (see QUESTIONS_PER_LEVEL / LEVEL_UNLOCK_ACCURACY at top of file):
//   Beginner     — always unlocked
//   Intermediate — unlocked once the student has answered at least 30
//                  questions total across any Beginner-difficulty sessions
//                  (cumulative, any number of sessions) at >= 70% accuracy
//   Advanced     — same rule, applied to Intermediate-difficulty sessions
// Also returns per-category best accuracy so the UI can show a mini progress bar.
router.get('/level-progress', async (req, res) => {
  const userId = req.user.id;
  try {
    const byDiff   = await getLevelTotals(userId);
    const unlocked = computeUnlocked(byDiff);

    // Per-level detail for progress bars: "18/30 questions, 82% accuracy".
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

    // Per-category best accuracy
    const catBest = await q(`
      SELECT ps.category_id,
             MAX(ps.accuracy)::numeric(5,1) AS best_accuracy,
             COUNT(*)::int AS session_count
        FROM em_practice_sessions ps
       WHERE ps.user_id = $1
       GROUP BY ps.category_id
    `, [userId]);

    const categoryProgress = {};
    catBest.forEach(r => {
      categoryProgress[r.category_id] = {
        best_accuracy: parseFloat(r.best_accuracy),
        session_count: r.session_count,
      };
    });

    res.json({
      success: true,
      data: {
        unlocked,
        level_detail: levelDetail,
        category_progress: categoryProgress,
      },
    });
  } catch (err) {
    console.error('[EM] GET /level-progress', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/english-masterclass/admin/categories
router.get('/admin/categories', adminOnly, async (req, res) => {
  try {
    const rows = await q(`
      SELECT c.*, COUNT(w.id)::int AS word_count
        FROM em_categories c
        LEFT JOIN em_words w ON w.category_id = c.id
       GROUP BY c.id
       ORDER BY c.order_index ASC, c.name ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/english-masterclass/admin/categories
router.post('/admin/categories', adminOnly, async (req, res) => {
  const { name, description, difficulty, icon_emoji, order_index } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'name is required' });
  try {
    const row = await q1(`
      INSERT INTO em_categories (name, description, difficulty, icon_emoji, order_index, created_by)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `, [name, description || '', difficulty || 'Beginner', icon_emoji || '📚', order_index || 0, req.user.id]);
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/english-masterclass/admin/categories/:id
router.patch('/admin/categories/:id', adminOnly, async (req, res) => {
  const { name, description, difficulty, icon_emoji, order_index, is_active } = req.body;
  try {
    const row = await q1(`
      UPDATE em_categories SET
        name        = COALESCE($1, name),
        description = COALESCE($2, description),
        difficulty  = COALESCE($3, difficulty),
        icon_emoji  = COALESCE($4, icon_emoji),
        order_index = COALESCE($5, order_index),
        is_active   = COALESCE($6, is_active),
        updated_at  = NOW()
      WHERE id = $7
      RETURNING *
    `, [name, description, difficulty, icon_emoji, order_index, is_active, req.params.id]);
    if (!row) return res.status(404).json({ success: false, error: 'Category not found' });
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/english-masterclass/admin/categories/:id
router.delete('/admin/categories/:id', adminOnly, async (req, res) => {
  try {
    await db.query(`DELETE FROM em_categories WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/english-masterclass/admin/words?category_id=...
router.get('/admin/words', adminOnly, async (req, res) => {
  const { category_id } = req.query;
  try {
    const rows = await q(`
      SELECT w.*, c.name AS category_name
        FROM em_words w
        JOIN em_categories c ON c.id = w.category_id
       ${category_id ? 'WHERE w.category_id = $1' : ''}
       ORDER BY c.order_index, w.order_index, w.word ASC
    `, category_id ? [category_id] : []);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/english-masterclass/admin/words
router.post('/admin/words', adminOnly, async (req, res) => {
  const { category_id, word, phonetic, definition, example_sentence, difficulty } = req.body;
  if (!category_id || !word) return res.status(400).json({ success: false, error: 'category_id and word are required' });
  try {
    const row = await q1(`
      INSERT INTO em_words (category_id, word, phonetic, definition, example_sentence, difficulty, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (category_id, word) DO NOTHING
      RETURNING *
    `, [category_id, word.trim(), phonetic, definition, example_sentence, difficulty || 'Beginner', req.user.id]);
    if (!row) return res.status(409).json({ success: false, error: 'Word already exists in this category' });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/english-masterclass/admin/words/:id
router.patch('/admin/words/:id', adminOnly, async (req, res) => {
  const { word, phonetic, definition, example_sentence, difficulty, is_active } = req.body;
  try {
    const row = await q1(`
      UPDATE em_words SET
        word             = COALESCE($1, word),
        phonetic         = COALESCE($2, phonetic),
        definition       = COALESCE($3, definition),
        example_sentence = COALESCE($4, example_sentence),
        difficulty       = COALESCE($5, difficulty),
        is_active        = COALESCE($6, is_active),
        updated_at       = NOW()
      WHERE id = $7
      RETURNING *
    `, [word, phonetic, definition, example_sentence, difficulty, is_active, req.params.id]);
    if (!row) return res.status(404).json({ success: false, error: 'Word not found' });
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/english-masterclass/admin/words/:id
router.delete('/admin/words/:id', adminOnly, async (req, res) => {
  try {
    await db.query(`DELETE FROM em_words WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/english-masterclass/admin/generate-words
// Admin: use Gemini to generate a word list for a category
router.post('/admin/generate-words', adminOnly, async (req, res) => {
  const { category_id, category_name, difficulty, count = 10 } = req.body;
  if (!category_id || !category_name) {
    return res.status(400).json({ success: false, error: 'category_id and category_name are required' });
  }

  try {
    const prompt = `You are an expert English language teacher creating vocabulary lists for Nigerian students building strong, internationally understood English.

Generate ${Math.min(count, 20)} vocabulary words for the category: "${category_name}" (difficulty: ${difficulty || 'Beginner'}).

IMPORTANT: 
- Use widely understood, everyday English words — the kind used across English-speaking countries, not words specific to one region only.
- Phonetics should use standard IPA.
- Example sentences should be natural and clear, in an everyday, internationally understood context.
- Spelling conventions (e.g. colour/color, realise/realize) are both acceptable — prefer whichever is more natural for the word; consistency within a single word entry matters more than which convention is chosen.

Respond ONLY with a JSON array, no markdown, no extra text:
[
  {
    "word": "the exact word",
    "phonetic": "/IPA/",
    "definition": "Clear, simple English definition",
    "example_sentence": "A natural example sentence"
  }
]`;

    const raw     = await generate(prompt, 'generate-questions');
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const words   = JSON.parse(cleaned);

    if (!Array.isArray(words)) throw new Error('Gemini did not return an array');

    // Bulk insert, skip duplicates
    const inserted = [];
    for (const w of words) {
      if (!w.word) continue;
      try {
        const row = await q1(`
          INSERT INTO em_words (category_id, word, phonetic, definition, example_sentence, difficulty, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (category_id, word) DO NOTHING
          RETURNING *
        `, [category_id, w.word.trim(), w.phonetic, w.definition, w.example_sentence, difficulty || 'Beginner', req.user.id]);
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
    console.error('[EM] POST /admin/generate-words', err.message);
    res.status(500).json({ success: false, error: 'AI generation failed: ' + err.message });
  }
});

module.exports = router;
