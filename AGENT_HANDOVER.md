# Agent Handover — AISchoolonair / EAC Learning Platform
**Repo:** https://github.com/PDS-David/edu-platform  
**Server:** Hetzner CX23 — `178.104.51.118`  
**Domains:** `www.aischoolonair.ng` (prod) · `staging.aischoolonair.ng`  
**Last updated:** 2026-05-26  
**Head commit:** `845ec0b`

---

## 1. One-Command Deploy

```bash
ssh root@178.104.51.118
bash /opt/aischoolonair/fix_and_deploy.sh
```

`fix_and_deploy.sh` does (in order):
1. Self-update from git
2. `git pull origin main`
3. `docker compose build --no-cache api` (forces fresh `npm ci`)
4. `docker compose build web`
5. `docker compose up -d --no-deps --force-recreate api web`
6. Run DB migration inside new container
7. Health check `https://www.aischoolonair.ng/api/health`

**Health check:**
```bash
curl https://www.aischoolonair.ng/api/health
# Expected: {"success":true,"data":{"status":"ok","timestamp":"..."}}
```

**View live logs:**
```bash
docker compose logs -f api        # API logs (errors, slow queries)
docker compose logs -f caddy      # TLS / proxy
docker compose -f docker-compose.yml logs --tail=20 api
```

---

## 2. Stack

| Layer | Technology |
|-------|-----------|
| Reverse proxy | Caddy 2 (ZeroSSL certs) |
| API | Node 22 / Express — container `aischool_api` port `5000` |
| Frontend | React 18 + Vite — container `aischool_web` (nginx) |
| Database | PostgreSQL on Render (external) via `DATABASE_URL` |
| Cache | Redis 7 — container `aischool_redis` |
| Auth | JWT (`jsonwebtoken`) + `protect` middleware |
| Payments | Paystack (live keys prod / test keys staging) |
| AI | Google Gemini (`@google/genai`) + Anthropic Claude (`@anthropic-ai/sdk`) |
| File storage | Docker volume `uploads_data` (R2 optional via env vars) |

---

## 3. Critical Architecture Facts

**`apiClient` error normalisation** — `client/src/services/apiClient.js` normalises ALL Axios errors to:
```js
{ message: string, status: number, raw: AxiosError }
```
The server sends `{ error: "some message" }` in the body. The interceptor maps `response.data.error → normalizedError.message`. Therefore in every `catch` block, the correct field is **`err.message`**, never `err.error`. This caused multiple silent failures — now fixed everywhere in admin pages. Keep this in mind for any new catch blocks.

**`free_limit_reached` signal** — `subscriptionGuard` sends HTTP 403 with `{ error: 'free_limit_reached' }`. After apiClient normalisation this becomes `err.message === 'free_limit_reached'`. Student-facing pages now check `err.message` correctly — the upgrade wall/paywall will now fire.

**Route mounts** — All 42 route files are mounted (only `testRoutes.js` is intentionally empty). Do not create a new route file without also adding `app.use('/api/...', protect, yourRoute)` in `server.js`.

**`subtopicProgressRoutes`** is mounted at `/api/subtopic-progress` (NOT `/api/subtopics` — that's `subtopicRoutes`). All frontend callers updated.

**`teacherOnly` middleware** allows both `teacher` and `admin` roles. Admin can create topics, subtopics, and call all teacher endpoints.

---

## 4. What Was Fixed in This Session

### `f05fa2f` — Error messages + teacher dropdown

**Bug 1 — All admin error messages showed hardcoded fallback strings**  
`err?.error` was used in 12 catch blocks across `AdminDashboard.jsx` and `AdminBulkUploadPanel.jsx`. Since `apiClient` normalises errors to `{ message }` (not `{ error }`), `err?.error` was always `undefined` → every failure showed the hardcoded string ("Could not create the new topic", "Failed to load analytics", etc.) regardless of the actual server error. Fixed all 12 to `err?.message`.

**Bug 2 — Teacher dropdown always empty in Add Assignment modal**  
Two sub-causes:
- `TeacherAssignmentPanel` called `GET /users?role=teacher` which filters by `is_active` column directly. Teachers registered before the column got a `DEFAULT` value have `NULL` `is_active` and were excluded.
- The `setTeachers` condition was `tRes.value?.data` (truthy check) — an empty `[]` is falsy, so the state was never updated.

Fixed: switched to `GET /admin/teachers` (uses `COALESCE(is_active, true)`) and replaced the truthy check with `Array.isArray()`.

### `845ec0b` — Upgrade wall / paywall never fired

**Bug — Free-plan students never saw the upgrade prompt**  
`QuizPage`, `MockExamPage`, `PracticeMode`, and `AIChatWidget` all checked `err.error === 'free_limit_reached'`. Since `apiClient` maps `response.data.error → err.message`, `err.error` was always `undefined`. Students on the free plan could exhaust their allocation without ever being prompted to upgrade.  
Fixed: `err.error` → `err.message` in all four files.

---

## 5. Remaining Issues — Prioritised

### 🔴 HIGH

**H1 — `aiChatRoute` still shows "Optional module missing" warning on deploy**  
The module file exists and all its dependencies are in `package.json`. The warning persists because the running container was built from a cached image that predates some of the service files. The next `bash fix_and_deploy.sh` run (which does `--no-cache` build) will resolve it permanently. If the warning continues after a no-cache build, check:
```bash
docker exec aischool_api node -e "require('./routes/aiChatRoute')" 2>&1
```
The real error will be printed. Most likely cause is `@anthropic-ai/sdk` failing to initialise without `ANTHROPIC_API_KEY` in `api.env`.

**H2 — `answer_options` table is empty (0 rows)**  
The migration log shows `questions: 10, answer_options: 0`. Questions exist but have no answer options — any quiz attempt will have nothing to render. This is a content seeding issue, not a code bug. Either:
- Seed sample answer options via a SQL script, OR
- Upload question bank PDFs through Bulk Upload → Question Bank type → AI extraction will populate `questions` + `answer_options` automatically.

**H3 — `pending_exam_board_ids` uses `::uuid[]` cast in `auth.js`**  
`auth.js` line 84: `:pendingIds::uuid[]`. Exam board IDs are `INTEGER` on the live DB. For teacher registration via AdminDashboard, `pendingIds = []` so the cast is `'{}'::uuid[]` which is valid (empty array has no type conflict). But if a student registers with exam board selections, the cast will fail with a Postgres type error and registration crashes. Fix:
```js
// Change line 84 in server/controllers/auth.js:
:pendingIds::uuid[]  →  :pendingIds::integer[]
// And update the pending_exam_board_ids column type in the users table if needed
```

### 🟡 MEDIUM

**M1 — Analytics panel: `daily_activity` chart will always be empty**  
Platform stats reads from `quiz_attempts` table. The verification log shows `questions: 10, answer_options: 0` — no answer options means no quiz attempts can be completed, so `quiz_attempts` stays empty. Fix H2 first; analytics will populate naturally once students can complete quizzes.

**M2 — Paystack webhook URL needs updating**  
The old Render deploy URL is likely still registered on Paystack. Update in Paystack Dashboard → Settings → API Keys & Webhooks:
```
https://www.aischoolonair.ng/api/payments/webhook
```

**M3 — Render services not yet suspended**  
The old Render API service may still be running and billing. Suspend or delete it (keep the Render Postgres DB — `DATABASE_URL` still points there).

**M4 — No GitHub Actions CI/CD**  
Every deploy requires SSH. Add `.github/workflows/deploy.yml`:
```yaml
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: 178.104.51.118
          username: root
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: bash /opt/aischoolonair/fix_and_deploy.sh
```

### 🟢 LOW

**L1 — `useProgress` / `useUpdateProgress` hooks are dead code**  
`client/src/hooks/useProgress.js` has no callers. Either wire up or delete.

**L2 — `GET /api/analytics/summary` returns empty on fresh DB**  
`analyticsRoutes.js` joins against `practice_attempts` which is empty until students complete quizzes. Guarded with try/catch so it won't crash, but returns zeros. Resolves naturally after H2 is fixed.

**L3 — `WhatsAppButton` renders on Login/Register/Landing pages**  
It's outside all route guards in `App.jsx`. Confirm with client whether intentional.

---

## 6. Route Reference

```
GET  /api/health                  ← Docker healthcheck + deploy script
GET  /api/admin/platform-stats    ← Analytics panel (PlatformAnalyticsPanel)
GET  /api/admin/teachers          ← Teacher dropdown in Add Assignment modal
GET  /api/admin/teacher-assignments
POST /api/admin/teacher-assignments
DEL  /api/admin/teacher-assignments/:id
GET  /api/users?role=teacher      ← User management panel (NOT the teacher dropdown)
PATCH /api/users/preferences      ← OnboardingPage + SettingsPage
GET  /api/exam-boards             ← ExamBoardSelector, OnboardingPage, RegisterPage
GET  /api/exam-boards/:code/subjects
GET  /api/exam-boards/:code       ← detail view (added this session)
GET  /api/catalog/all-subjects    ← AdminBulkUploadPanel subject picker
POST /api/teacher/topics          ← AdminBulkUploadPanel new-topic creation
POST /api/teacher/subtopics       ← AdminBulkUploadPanel new-subtopic creation
PUT  /api/resources/:id/assign-meta  ← Bulk upload Save & Publish
PUT  /api/resources/:id/assign-users ← Bulk upload push to students
GET  /api/students/my-subjects    ← StudentSubjectsPage
GET  /api/ai/chat                 ← AIChatWidget (POST)
GET  /api/ai/chat/session         ← AIChatWidget session restore
```

---

## 7. Environment Variables

**Required in `api.env` (production):**
```
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://...          # Render Postgres
REDIS_URL=redis://redis:6379
JWT_SECRET=                            # 64-char hex
JWT_EXPIRE=7d
SESSION_SECRET=                        # 64-char hex
CLIENT_URL=https://www.aischoolonair.ng
SERVER_BASE_URL=https://www.aischoolonair.ng
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_WEBHOOK_SECRET=...
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash-lite
ANTHROPIC_API_KEY=                     # Required for aiChatRoute / aiOrchestrator
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=
ALLOW_LOCAL_UPLOADS=true
```

---

## 8. Key Decisions — Do Not Change Without Discussion

1. **`err?.message` not `err?.error`** — apiClient always puts the server error message in `.message`. Never use `.error` in catch blocks.
2. **`free_limit_reached` checked via `err.message`** — subscriptionGuard signals are normalised to `.message` by apiClient.
3. **`/api/subtopic-progress`** (not `/api/subtopics`) for the progress routes.
4. **`/admin/teachers`** for the teacher dropdown — not `/users?role=teacher`.
5. **`fix_and_deploy.sh` with `--no-cache`** — ensures `npm ci` always picks up new packages.
6. **UI components must not be modified** — all fixes are backend/data layer only.

---

## 9. Contact

**Pronoia Digital Services**  
Phone: +234 810 755 1000
