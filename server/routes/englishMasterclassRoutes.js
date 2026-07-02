'use strict';
// server/routes/englishMasterclassRoutes.js
// All routes for the English Masterclass module.
// Mounted at /api/english-masterclass with protect middleware already applied.

const express    = require('express');
const router     = express.Router();
const { Pool }   = require('pg');
const { generate } = require('../services/ai');
const { authorize } = require('../middleware/auth');

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
// other EM route. Admin/teacher roles pass through untouched — this only
// applies to the student-facing surface.
function requireEmRegistration(req, res, next) {
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
// Generate British English TTS audio via Gemini, return base64 audio
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
          text: `You are a British English language tutor. 
Speak the following word clearly with a standard British Received Pronunciation (RP) accent, 
slowly and clearly so a learner can hear each sound distinctly. 
Say only the word, nothing else: "${word}"`
        }]
      }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'en-GB-Standard-B' }
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

// POST /api/english-masterclass/word-explain
// AI generates definition, example sentence, and usage tip for a word.
// Accepts optional word_id — if supplied and the word's DB fields are empty,
// the AI result is backfilled so subsequent students get it instantly (GAP 2).
router.post('/word-explain', async (req, res) => {
  const { word, context, word_id } = req.body;
  if (!word) return res.status(400).json({ success: false, error: 'word is required' });

  try {
    const prompt = `You are an expert British English teacher. A student in Nigeria is learning British English.

Provide the following for the word: "${word}"
Context (category): ${context || 'General British English'}

Respond in this exact JSON format (no markdown, no extra text):
{
  "definition": "A clear, simple definition in British English",
  "phonetic": "British IPA pronunciation e.g. /wɔːtə/",
  "example_sentence": "A natural example sentence showing British usage",
  "usage_tip": "A tip specific to Nigerian learners — common mistake to avoid or cultural note",
  "british_vs_american": "If the word differs from American English, explain briefly. Otherwise write null."
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

  try {
    // 1. Save session
    await db.query(`
      INSERT INTO em_practice_sessions (user_id, category_id, category_name, total_words, correct_words, accuracy, duration_secs)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [userId, category_id || null, category_name, total_words, correct_words, accuracy, duration_secs || 0]);

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

    res.json({ success: true, message: 'Session saved.' });
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
// Rules:
//   Beginner    — always unlocked
//   Intermediate — unlocked after student completes at least 1 Beginner session
//                  with accuracy >= 60%
//   Advanced    — unlocked after student completes at least 1 Intermediate session
//                  with accuracy >= 60%
// Also returns per-category best accuracy so the UI can show a mini progress bar.
router.get('/level-progress', async (req, res) => {
  const userId = req.user.id;
  try {
    // Fetch all sessions for this user (with the category's difficulty)
    const sessions = await q(`
      SELECT ps.category_id, ps.accuracy, c.difficulty
        FROM em_practice_sessions ps
        JOIN em_categories c ON c.id = ps.category_id
       WHERE ps.user_id = $1
    `, [userId]);

    const hasPassedDifficulty = (diff) =>
      sessions.some(s => s.difficulty === diff && s.accuracy >= 60);

    const beginnerUnlocked      = true;
    const intermediateUnlocked  = hasPassedDifficulty('Beginner');
    const advancedUnlocked      = hasPassedDifficulty('Intermediate');

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
        unlocked: {
          Beginner:     beginnerUnlocked,
          Intermediate: intermediateUnlocked,
          Advanced:     advancedUnlocked,
        },
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
    const prompt = `You are an expert British English language teacher creating vocabulary lists for Nigerian students learning British English.

Generate ${Math.min(count, 20)} vocabulary words for the category: "${category_name}" (difficulty: ${difficulty || 'Beginner'}).

IMPORTANT: 
- Use only genuine British English words, spellings, and pronunciations.
- Phonetics must use British IPA (Received Pronunciation).
- Example sentences must reflect British cultural context.
- Spellings must be British (e.g. colour not color, realise not realize).

Respond ONLY with a JSON array, no markdown, no extra text:
[
  {
    "word": "the exact word",
    "phonetic": "/British IPA/",
    "definition": "Clear British English definition",
    "example_sentence": "Natural British English example sentence"
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
