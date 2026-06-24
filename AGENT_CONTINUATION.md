# AISchoolOnAir — Master Continuation Prompt
**Repository:** PDS-David/edu-platform  
**Production:** https://www.aischoolonair.ng  
**Last updated:** 2026-06-25  
**GitHub token:** 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

---

## Platform summary

AISchoolOnAir is a Nigerian EdTech platform targeting JAMB/WAEC/NECO/JUPEB exam preparation.

**Stack:**
- Frontend: React 18 + Vite, Tailwind CSS, React Router v6 (`/client/src`)
- Backend: Node.js + Express (`/server`)
- Database: PostgreSQL (accessed via raw `pg` Pool — Sequelize also present but being phased out)
- AI: Google Gemini via `@google/genai` SDK, centralised in `server/services/ai.js`
- Auth: JWT Bearer tokens. In-memory primary store + sessionStorage fallback + HttpOnly refresh cookie
- Storage: Cloudflare R2 (S3-compatible) for files/videos
- Hosting: Render.com (API) + Caddy reverse proxy

**Three user roles:** `student`, `teacher`, `admin`

**Key middleware:**
- `server/middleware/auth.js` — `protect` (validates JWT, attaches `req.user`), `authorize(...roles)` (role gate)

---

## How to start work

```bash
git clone https://github.com/PDS-David/edu-platform.git
cd edu-platform
# Or if already cloned:
git pull https://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@github.com/PDS-David/edu-platform.git main
```

**Push pattern:**
```bash
git add -A
git commit -m "fix: description"
git push https://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@github.com/PDS-David/edu-platform.git main
# If rejected, pull --rebase first:
git pull --rebase https://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@github.com/PDS-David/edu-platform.git main
git push https://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@github.com/PDS-David/edu-platform.git main
```

**Never use branches** unless specifically asked. All work goes directly to `main`.

---

## What has been built (chronological)

### Phase 1 — Core security & auth hardening
- DEF-001: JWT moved from `localStorage` → sessionStorage (namespaced key `aischoolonair.token`)
- DEF-002: Notification routes fixed (response shape normalisation)
- DEF-003: Student dashboard routing fixed — `StudentDashboard` is now the layout shell, `DashboardContent` is the index child. Was self-referencing loop.
- DEF-004: `authorize('student')` added to all `/api/dashboard/*` routes
- DEF-005: Global axios timeout reduced 90s → 15s; per-request constants exported from `apiClient.js`
- DEF-006: Silent API failures in dashboard replaced with per-section error banners + Retry buttons
- DEF-007: File downloads routed through `/api/resources/:id/download` (protect middleware)
- DEF-008: Notification optimistic update fixed — state only updates after server PATCH confirms
- DEF-009: Mobile navigation added to student dashboard (hamburger drawer + bottom nav bar)
- DEF-010: `daily_goal` added to `protect` middleware SELECT
- DEF-011: `exam_boards.id` type mismatch fixed in recommendations query (cast to `::text`)
- DEF-013 to DEF-018: Various medium/low fixes (null guards, error boundaries, URL canonicalization)

### Phase 2 — Question Review Queue enforcement
**Policy:** All AI-generated questions → `status='pending'` (require admin approval). Teacher-manually-created questions → `status='approved'` immediately (no review required).

- All 7 `INSERT INTO questions` paths audited and corrected:
  - `adminRoutes.js` AI Generate panel: already correct (`pending`) — one regression reverted
  - `aiQuestionGenerator.js` (quiz fallback gap-filler): was `approved`, fixed to `pending`
  - `remediationService.js` (weak-topic AI): was `approved`, fixed to `pending`
  - `resourceQuestionExtractor.js`: already correct (`pending`)
  - `teacherRoutes.js` POST /questions: no status set at all, now explicitly `status='approved', is_ai_generated=false`
  - `questionsRoutes.js` POST /submit (ContributeQuestion page): no status set, now `pending`
  - `questionImporter.js` CLI: admin-curated bulk import, left as `approved` (deliberate)
- `COALESCE(status, 'approved')` fail-open defaults tightened to `COALESCE(status, 'pending')` everywhere students fetch questions
- `GET /api/admin/questions/pending` + `PUT /api/admin/questions/:id/review` already existed and are the per-question approval mechanism — no changes needed
- `remediationService.js` POST /students/remediation response: stripped of raw question content (was leaking unreviewed AI text directly to students in HTTP response)
- `server/tests/pipeline.test.js` assertion updated to expect `pending` not `approved`

### Phase 3 — AI Question Generator fixes
- Gemini fallback chain fixed: replaced dead `gemini-2.0-flash` (retired) and `gemini-2.5-flash-preview-05-20` (stale snapshot) with `gemini-2.5-flash-lite` → `gemini-flash-latest`
- `aiService.js` markImage() also had hardcoded dead model — same fix applied
- Admin Generate panel: count capped at 15, options 5/10/15 to reduce timeout risk

### Phase 4 — Teacher Add Question: inline topic/subtopic creation
- `client/src/pages/TeacherAddQuestionPage.jsx` fully rewritten
- Added `+ Add new topic…` / `+ Add new subtopic…` sentinel option in dropdowns
- Calls existing `POST /teacher/topics` and `POST /teacher/subtopics` to create inline
- Auto-selects newly created topic/subtopic in cascade

### Phase 5 — Quiz options empty + results broken
**Root cause:** Two parallel option-storage schemes in DB — `questions.options` JSONB column vs separate `answer_options` table. `GET /api/questions/random` only read JSONB; `remediationService.js` only wrote to table.

- `GET /questions/random`: falls back to `answer_options` table when JSONB is missing/malformed; drops questions with no usable options from either source
- `remediationService.js`: now dual-writes JSONB column AND `answer_options` table
- Admin Question Review: broken questions (empty options / no correct answer) now show red warning; Approve button disabled
- `POST /quizzes/attempt`: replaced silent scoring of 0 with explicit `409 QUESTIONS_UNAVAILABLE`
- `QuizTab.jsx` `submitQuiz`: errors now logged and surfaced to student with message + Back button (was empty catch swallowing everything)
- `ResultsScreen` catch block: now logs and shows actual error message (was bare `catch {}`)

### Phase 6 — Quiz results page: 4 display bugs
- **Response field "No answer given":** Server was sending `selected_answer`, page was reading `selected_option_text` — field name mismatch. Fixed: server now sends `selected_option_text`
- **Examiner Recommendation "--":** Only returned by GET endpoint; quiz uses POST response directly as `inlineResult`. Fixed: POST now computes and includes `examiner_recommendation`
- **Benchmark "--":** Same. Fixed: POST includes `benchmark: null` (no class avg data at submission time; field now present so destructuring works)
- **Marking Scheme empty:** `MarkingScheme` component read `qData.ai_explanation` (a plain string) as if it were an object. Fixed: now reads `qData.ai_marking_scheme` (`{status, whyExplanation}`), falls back to plain explanation string
- **401 console errors on subtopic mount:** `SubtopicPage` fired API calls before auth token was available. Fixed: added `user` guard to main fetch useEffect

### Phase 7 — Admin/Teacher/Student feature fixes
- **A1 (Exam types):** Recycle-bin flow — deactivate cascades to subjects automatically; deleted exam types move to a recoverable trash panel
- **A2 (Account Settings 404):** Account Settings page built for all three roles
- **T1 (Edit topic/subtopic):** Inline editing added to Teacher content management UI
- **T2/S4 (View/Download "No internet"):** Cloudflare R2 signed URL CORS issue fixed
- **S1 (Subject limits):** JAMB/JUPEB capped at 4 subjects; WAEC/NECO at 9 — enforced at enrollment
- **S2a (Unenroll):** Unenroll button added to student subjects page
- **S3 (Delete student account):** `X-Admin-Action: confirmed` header now sent correctly from admin UI
- **Various:** Mock exam history, global quiz history, subject catalog enrol button, quiz results refresh, profile photo upload, topic search, onboarding subject limits, Cambridge exam type added

### Phase 8 — English Masterclass module (most recent, commit b0893a5)
Complete standalone British English vocabulary training module integrated into AISchoolOnAir.

**Database (auto-run via `server/scripts/setupDb.js`):**
- 5 new tables: `em_categories`, `em_words`, `em_word_progress`, `em_practice_sessions`, `em_user_stats`
- SQL: `database/migration_english_masterclass.sql`
- Seeded: 6 categories, ~45 starter words (Everyday British, Idioms, Formal English, Slang, Pronunciation, Spelling Patterns)

**Backend:** `server/routes/englishMasterclassRoutes.js` → mounted at `/api/english-masterclass`
- Student: categories, words, audio (Gemini TTS with `en-GB-Standard-B` voice, falls back to browser `lang=en-GB`), word-explain (AI definition/phonetic/example/tip), sessions (save + streak), progress
- Admin (adminOnly): CRUD categories, CRUD words, AI generate word lists per category

**Frontend — Student:** `client/src/pages/EnglishMasterclass.jsx`
- Route: `/student/english-masterclass`
- Practice tab: category picker → Listen (Gemini audio) → type → submit/skip → AI explain panel → session summary
- My Progress tab: stats cards + recent sessions

**Frontend — Admin:** `client/src/pages/AdminEnglishMasterclass.jsx`
- Route: `/admin/english-masterclass`
- Category management with expandable word lists, AI Fill per word, bulk AI generation per category

**Wiring:**
- Student sidebar: "English Masterclass" (Languages icon) after Exam Types
- Admin sidebar: "English Masterclass" link → `/admin/english-masterclass`
- `App.jsx`: routes registered
- `server/server.js`: route mounted
- `setupDb.js`: migration added to auto-run list

---

## Key architecture rules (do not break these)

1. **Never deploy without pulling first.** Remote is actively receiving concurrent agent pushes. Always `git pull --rebase` if push is rejected.

2. **Question status policy:**
   - AI-generated → `status='pending'`, `is_ai_generated=true` — requires admin approval in Review Queue
   - Teacher manual → `status='approved'`, `is_ai_generated=false` — live immediately
   - Every `INSERT INTO questions` must set both fields explicitly. `COALESCE` defaults everywhere are now `'pending'` (fail safe).

3. **Dual option storage:** `questions.options` JSONB column AND `answer_options` table. Every AI insert path must write both. `GET /questions/random` falls back to the table if JSONB is empty — but new inserts should still write both correctly at source.

4. **Token management:** `client/src/utils/token.js` uses sessionStorage with key `aischoolonair.token`. Never read from `localStorage` directly. The apiClient interceptor reads via `getToken()` and redirects to `/login` on 401.

5. **Migration pattern:** Drop SQL files in `/database/`, register filename in `server/scripts/setupDb.js` migrations array, use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` throughout. Auto-runs on server start.

6. **Route registration:** `server/server.js` uses `safeRequire()` for all routes. Pattern: `const xRoutes = safeRequire('./routes/xRoutes'); if (xRoutes) app.use('/api/x', protect, xRoutes);`

7. **AI service:** Always use `server/services/ai.js`'s `generate(prompt, type)` function for text generation. Current fallback chain: `gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-flash-latest`. For audio/multimodal, use `@google/genai` directly with the same fallback pattern.

8. **Frontend balance check before committing:**
   ```python
   python3 -c "
   for f in ['client/src/pages/YourPage.jsx']:
       c = open(f).read()
       print(f, 'braces:', c.count('{')-c.count('}'), 'parens:', c.count('(')-c.count(')'))
   "
   ```

9. **Admin dashboard nav:** `navItems` array in `AdminDashboard.jsx`. Items with an `href` property navigate to a dedicated page; items without open an inline panel via `setActivePanel`.

10. **Student dashboard sidebar:** `sidebarItems` array in `StudentDashboard.jsx`. Bottom mobile nav is a hardcoded 5-item subset. Additional items appear in the hamburger drawer automatically.

---

## Known remaining gaps (not yet fixed as of last session)

The following were identified but not addressed — prioritise these:

1. **English Masterclass audio tier:** Gemini's audio generation (`responseModalities: ['AUDIO']`) requires a paid API tier. On the free tier it silently falls back to browser TTS. If Gemini audio is returning errors, this is expected — the fallback is intentional and works. No code fix needed unless upgrading the API tier.

2. **`aiChatRoute.js` dead model:** The streaming AI tutor chat still hardcodes `gemini-2.0-flash` (retired) with no fallback. Same root cause as the AI Generate fix in Phase 3. Not addressed because it was out of scope at the time.

3. **`quizService.js` dead export:** `generateQuizByTopic` is imported by `quizController.js` but doesn't exist as an export in `quizService.js` — this route throws `generateQuizByTopic is not a function` at runtime. The route is not wired to any frontend page, so it's dead traffic, but it should be cleaned up.

4. **Benchmark data:** `benchmark: null` is currently hardcoded in the quiz results POST response. Real benchmark data (class average score and time) requires aggregating across `practice_attempts` for the same subtopic. This is a genuine data feature to build.

5. **English Masterclass progress card on student dashboard:** The brief requested a progress card on the student dashboard. Currently English Masterclass has its own My Progress tab but no card on the main `/student/dashboard` summary. This should be added to `DashboardContent` in `StudentDashboard.jsx` — fetch from `GET /api/english-masterclass/progress` and show streak + words learned.

6. **English Masterclass: Gemini word-explain not saving back to DB:** When a student clicks "Ask AI to explain this word" during practice, the AI response is shown inline but not written back to the word's `definition`/`example_sentence` fields. This means every student triggers a fresh Gemini call for the same word. An optimisation would be to save the AI response back to `em_words` on first generation.

---

## File map (most important files)

```
edu-platform/
├── client/src/
│   ├── App.jsx                          ← All routes defined here
│   ├── services/apiClient.js            ← Axios instance, token interceptor
│   ├── utils/token.js                   ← sessionStorage token management
│   ├── context/AuthContext.jsx          ← Auth state, user object
│   ├── pages/
│   │   ├── StudentDashboard.jsx         ← Student layout shell + sidebar + DashboardContent
│   │   ├── EnglishMasterclass.jsx       ← English Masterclass student page (NEW)
│   │   ├── AdminEnglishMasterclass.jsx  ← English Masterclass admin page (NEW)
│   │   ├── AdminDashboard.jsx           ← Admin layout + all admin panels
│   │   ├── QuizResultsPage.jsx          ← Quiz results rendering
│   │   └── TeacherAddQuestionPage.jsx   ← Teacher add question with inline topic/subtopic creation
│   └── components/
│       ├── QuizTab.jsx                  ← Full quiz session + results UI
│       └── TopNav.jsx                   ← Notification fetch + unread badge
├── server/
│   ├── server.js                        ← Express app, all route mounts
│   ├── middleware/auth.js               ← protect, authorize, daily_goal in SELECT
│   ├── services/
│   │   ├── ai.js                        ← Central Gemini hub, fallback chain
│   │   └── aiService.js                 ← markImage() multimodal
│   ├── routes/
│   │   ├── englishMasterclassRoutes.js  ← English Masterclass API (NEW)
│   │   ├── questionsRoutes.js           ← /questions/random (answer_options fallback)
│   │   ├── quizzes.js                   ← POST /attempt, GET /attempt/:id
│   │   ├── adminRoutes.js               ← Admin AI generate, review, user management
│   │   ├── teacherRoutes.js             ← Teacher questions, topics, subtopics
│   │   ├── dashboardRoutes.js           ← Student dashboard aggregations
│   │   └── studentRoutes.js             ← Student-facing data routes
│   └── scripts/
│       ├── setupDb.js                   ← Auto-runs all migrations on server start
│       └── run_english_masterclass_migration.js ← Standalone EM migration script
└── database/
    ├── migration_english_masterclass.sql ← English Masterclass tables + seed (NEW)
    └── *.sql                             ← Other migrations (all idempotent)
```
