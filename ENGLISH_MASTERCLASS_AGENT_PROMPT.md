# English Masterclass — Agent Scrutiny & Completion Prompt

## Context

Repository: PDS-David/edu-platform
Token: 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
Production: https://www.aischoolonair.ng

This is a large EdTech platform (Nigerian exam prep). You are being asked to
scrutinise and complete ONE module only: **English Masterclass**. Do not touch
anything else unless a bug in a shared service (e.g. ai.js or apiClient.js)
is directly breaking the English Masterclass.

---

## What English Masterclass is supposed to do

A standalone British English vocabulary training module integrated into
AISchoolOnAir. It shares the platform's JWT auth, PostgreSQL database, and
Gemini AI — no Supabase, no second login, no separate deployment.

**Student experience:**
1. Student clicks "English Masterclass" in their sidebar
2. Sees a category grid (Beginner/Intermediate/Advanced)
3. Picks a category → gets 10 random words for a session
4. For each word: a large Listen button plays the word aloud in British English
   (Gemini TTS with en-GB voice, falls back to browser SpeechSynthesis at lang=en-GB)
5. Student types what they heard → Submit or Skip
6. Correct/wrong feedback shown for 900ms, then next word
7. "Ask AI to explain this word" button → Gemini returns definition, IPA
   phonetic, example sentence, usage tip for Nigerian learners, and British vs
   American comparison — shown inline without leaving the session
8. After all 10 words: session summary with per-word results and accuracy
9. Session saved to server; streak and stats updated
10. "My Progress" tab shows streak, words learned, mastered count, accuracy,
    total time, recent session history

**Admin experience:**
1. Admin clicks "English Masterclass" in their sidebar → goes to /admin/english-masterclass
2. Sees all categories with word counts, expandable
3. Can create/edit/delete categories (name, description, difficulty, icon emoji)
4. Expands a category → sees its words with edit/delete per word
5. "AI Fill" button on word form: types a word, clicks AI Fill → Gemini
   auto-populates phonetic, definition, example sentence
6. "Generate with AI" panel per category: choose 5/10/15/20 words → Gemini
   bulk-generates and inserts British English vocabulary

---

## Exact files to read first — in this order

Start by reading these files in full before diagnosing or changing anything:

1. `server/routes/englishMasterclassRoutes.js` — all backend logic (466 lines)
2. `client/src/pages/EnglishMasterclass.jsx` — student frontend (656 lines)
3. `client/src/pages/AdminEnglishMasterclass.jsx` — admin frontend (517 lines)
4. `database/migration_english_masterclass.sql` — DB schema + seed data (195 lines)

Then verify wiring by checking these specific lines:

```bash
# Route mounted in server:
grep "english-masterclass" server/server.js

# Migration in auto-run list:
grep "migration_english_masterclass" server/scripts/setupDb.js

# Student route registered:
grep "english-masterclass" client/src/App.jsx

# Admin route registered:
grep "english-masterclass" client/src/App.jsx

# Student sidebar item:
grep "English Masterclass" client/src/pages/StudentDashboard.jsx

# Admin sidebar link:
grep "english-masterclass" client/src/pages/AdminDashboard.jsx
```

Expected results (all should return hits):
- `server/server.js`: `app.use('/api/english-masterclass', protect, englishMasterclassRoutes)`
- `setupDb.js`: `'migration_english_masterclass.sql'`
- `App.jsx`: two routes — `/student/english-masterclass` and `/admin/english-masterclass`
- `StudentDashboard.jsx`: sidebar item with `Languages` icon
- `AdminDashboard.jsx`: `href: '/admin/english-masterclass'`

---

## Database tables (5 tables, all prefixed `em_`)

```sql
em_categories     — vocabulary categories (id, name, description, difficulty, icon_emoji, order_index, is_active)
em_words          — words (id, category_id, word, phonetic, definition, example_sentence, difficulty, is_active)
                    UNIQUE (category_id, word)
em_word_progress  — per-user per-word tracking (user_id, word_id, correct_attempts, total_attempts, mastered)
                    UNIQUE (user_id, word_id)
em_practice_sessions — session history (user_id, category_id, category_name, total_words, correct_words, accuracy, duration_secs)
em_user_stats     — aggregate stats (user_id PK, words_learned, practice_streak, longest_streak, total_sessions, overall_accuracy, last_practice_date)
```

The migration seeds 6 categories and ~45 words. It auto-runs on server start
via `server/scripts/setupDb.js`. If tables don't exist, the migration needs
to run. Can also be run manually:
```bash
node server/scripts/run_english_masterclass_migration.js
```

---

## API endpoints (all under /api/english-masterclass, all require JWT)

Student:
```
GET  /categories              → list active categories with word counts
GET  /categories/:id/words   → 10 random active words for a session
POST /audio                  → { word } → Gemini TTS base64 audio OR { fallback: true }
POST /word-explain           → { word, context } → { definition, phonetic, example_sentence, usage_tip, british_vs_american }
POST /sessions               → save session + update per-word progress + update streak stats
GET  /progress               → { stats, mastered_count, recent_sessions }
```

Admin only:
```
GET    /admin/categories
POST   /admin/categories
PATCH  /admin/categories/:id
DELETE /admin/categories/:id
GET    /admin/words?category_id=...
POST   /admin/words
PATCH  /admin/words/:id
DELETE /admin/words/:id
POST   /admin/generate-words → { category_id, category_name, difficulty, count } → bulk AI generation
```

---

## Known gaps to complete

These were identified but not yet implemented:

### GAP 1 — Student dashboard progress card (missing)
The student's main dashboard at `/student/dashboard` has no English Masterclass
card. The brief explicitly requested progress be visible on the dashboard.

**What to build:**
- In `client/src/pages/StudentDashboard.jsx`, inside `DashboardContent`,
  add a small card after the existing metric strip (or at the bottom of the
  page) that shows: streak days, words learned, and a "Continue Practice →"
  link to `/student/english-masterclass`
- Fetch from `GET /api/english-masterclass/progress` (already exists)
- Show a "Start English Masterclass →" CTA if the student has 0 sessions
- Keep it lightweight — this is a teaser card, not the full progress view

### GAP 2 — AI explain not saved back to DB (inefficiency)
When a student clicks "Ask AI to explain this word" during practice, the
Gemini response is shown inline but never written back to `em_words.definition`
and `em_words.example_sentence`. Every student triggers a fresh Gemini call
for the same word.

**What to build:**
- In `POST /api/english-masterclass/word-explain`, after the Gemini call
  succeeds, do a `UPDATE em_words SET definition=..., example_sentence=...,
  phonetic=... WHERE id=...` — but only if those fields are currently null/empty
  (don't overwrite admin-curated content)
- The `word-explain` route currently receives `{ word, context }` — it needs
  to also accept `{ word_id }` so it can do the backfill. Update the
  frontend call in `EnglishMasterclass.jsx` to pass `word_id` alongside `word`

### GAP 3 — Gemini audio tier (needs graceful handling)
`POST /api/english-masterclass/audio` tries Gemini's `responseModalities: ['AUDIO']`
which requires a paid Gemini tier. On the free tier it throws an error and
returns `{ fallback: true }` — the client then uses browser SpeechSynthesis.
This is intentional and the fallback works. However:

- The current error is caught and returns `{ success: false, fallback: true }`
  but the client checks `res.data?.audio` — if `res.data` is the whole
  response object (depending on apiClient normalisation), this may be
  `res.data.data?.audio`. Verify the exact field path the client reads.
- If Gemini audio is available and working, verify the base64 audio plays
  correctly in the browser (`new Audio('data:audio/wav;base64,...')`)
- If Gemini audio is not available on the current API key, the browser TTS
  fallback must reliably use a British voice. Add a voices-loaded handler:
  `window.speechSynthesis.onvoiceschanged = () => { ... }` since voices
  aren't synchronously available on first call in some browsers

### GAP 4 — Admin sidebar item style
In `AdminDashboard.jsx`, the English Masterclass nav item uses `icon: null`
and renders a hardcoded `🇬🇧` emoji span. This works but is inconsistent with
every other nav item which uses Lucide icons. Import `Languages` from
`lucide-react` in AdminDashboard and use it, matching the student sidebar.

---

## How to verify the module end-to-end (test checklist)

Run through this as a student (David Temitope account or any student):

1. Log in as student → check sidebar has "English Masterclass" entry
2. Click it → `/student/english-masterclass` loads
3. Category grid shows 6 categories (or more if admin has added)
4. Click a category → 10 words load, first word shown
5. Click Listen button → word plays (either Gemini audio or browser TTS)
6. Type the word → Submit → green "Correct!" or red "The word was: X"
7. After 900ms → next word appears
8. Click "Ask AI to explain this word" → explanation panel expands with
   definition, phonetic, example, tip, British vs American note
9. Complete all 10 words → session summary shows
10. "Practice Again" reloads same category; "New Category" returns to grid
11. Click "My Progress" tab → stats show (first session: 1 session, accuracy %)
12. Log in as admin → click "English Masterclass" in admin sidebar
13. `/admin/english-masterclass` loads with 6 categories
14. Click a category → expand → see its words
15. Click "AI Fill" on a word → definition/phonetic/example populate
16. Click "Generate with AI" → choose 10 words → Gemini generates and inserts

---

## Rules for this agent

1. Read all 4 English Masterclass files before changing anything
2. Do not touch files outside the English Masterclass module unless a shared
   service is directly broken (and even then, make the minimal surgical fix)
3. Verify balance after editing any .jsx file:
   ```python
   python3 -c "
   for f in ['client/src/pages/EnglishMasterclass.jsx',
             'client/src/pages/AdminEnglishMasterclass.jsx']:
       c = open(f).read()
       print(f.split('/')[-1], 'braces:', c.count('{')-c.count('}'),
             'parens:', c.count('(')-c.count(')'))
   "
   ```
4. Syntax check server files: `node --check server/routes/englishMasterclassRoutes.js`
5. Pull before pushing — concurrent agents are active on this repo:
   ```bash
   git pull --rebase https://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@github.com/PDS-David/edu-platform.git main
   git push https://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@github.com/PDS-David/edu-platform.git main
   ```
6. Commit messages: `fix(english-masterclass): ...` or `feat(english-masterclass): ...`
7. All work goes directly to `main` — no branches
