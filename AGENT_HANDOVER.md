# Agent Handover — AISchoolonair / EAC Learning Platform
**Repo:** https://github.com/PDS-David/edu-platform  
**Server:** Hetzner CX23 — IP `178.104.51.118`  
**Domains:** `www.aischoolonair.ng` (prod) · `staging.aischoolonair.ng`  
**Last updated:** 2026-05-26

---

## 1. Stack at a Glance

| Layer | Technology |
|-------|-----------|
| Reverse proxy | Caddy 2 (ZeroSSL certs, auto-HTTPS) |
| API | Node 22 / Express 4 — container `aischool_api` on internal `:5000` |
| Frontend | React 18 + Vite — container `aischool_web` served by nginx |
| Database | PostgreSQL on Render (external), accessed via `DATABASE_URL` |
| Cache / Queues | Redis 7 — container `aischool_redis` |
| Auth | JWT (`jsonwebtoken`) + `protect` middleware |
| Payments | Paystack (live keys prod, test keys staging) |
| AI | Google Gemini (`@google/genai`) |
| File storage | Local Docker volume (`uploads_data`) — R2 available via env vars |

**Repo layout:**
```
edu-platform/
├── server/           Express API
│   ├── routes/       One file per resource — all mounted in server.js
│   ├── controllers/  auth.js, quizController.js, subjects.js, subtopicProgressController.js
│   ├── services/     AI, analytics, progress, weakConcept, remediation, etc.
│   ├── models/       Sequelize models (User, Quiz, etc.)
│   ├── middleware/   auth (protect/authorize), rateLimiter, requestId, requestLogger
│   ├── scripts/      run_complete_migration.js ← THE migration entry point
│   └── server.js     App bootstrap + all route mounts
├── client/           React SPA
│   └── src/
│       ├── pages/    One component per page/route
│       ├── components/
│       ├── services/apiClient.js  ← Axios instance, all API calls go through this
│       └── hooks/
├── docker-compose.yml  6 services: caddy, api, web, api_staging, web_staging, redis
├── Caddyfile           TLS termination + reverse proxy rules
├── deploy.sh           One-command deploy (git pull → migrate → build → restart)
├── api.env.example     Template for production secrets
└── api.staging.env.example  Template for staging secrets
```

---

## 2. How to Deploy

```bash
# SSH in
ssh root@178.104.51.118

# Navigate to repo (docker-compose.yml lives here)
cd /opt/aischoolonair

# One-command deploy (runs from anywhere thanks to BASH_SOURCE fix)
bash deploy.sh
```

`deploy.sh` does: `git pull` → DB migration → `docker compose build api web` → `docker compose up -d --no-deps api web`

**Health check:**
```bash
curl https://www.aischoolonair.ng/api/health
# Expected: {"success":true,"data":{"status":"ok","timestamp":"..."}}
```

**Manual migration only (no rebuild):**
```bash
cd /opt/aischoolonair
docker cp server/scripts/run_complete_migration.js aischool_api:/tmp/run_complete_migration.js
docker exec aischool_api node /tmp/run_complete_migration.js
```

**View logs:**
```bash
docker compose logs -f api        # API logs
docker compose logs -f caddy      # TLS / proxy logs
```

---

## 3. What Was Fixed in This Session (commits c270eb0 → 4a7f1f5)

### `c270eb0` — `/api/health` + `deploy.sh`
- **`Cannot GET /api/health`**: Caddy proxies `/api/*` → `api:5000` so the Express server receives the path as `/api/health`. Express only had `/health`. Added `/api/health` alias.
- **`docker compose: no configuration file provided`**: `deploy.sh` now uses `BASH_SOURCE[0]` to self-locate and `cd` to the repo root before any `docker compose` call — safe to invoke from any directory.

### `49a1b73` — Missing routes, double-mount, body limit, junk files
- **`PATCH /api/users/preferences` was silently 404ing**: The route existed only in the unmounted `userRoutes.js`. Ported it into the mounted `users.js`. This route is called by `OnboardingPage` to save exam board selections, subject enrolments, daily goal, and study schedule. Without it, every onboarding completion discarded all user selections.
- **`GET /api/ai/chat/session` was 404ing**: `aiChatRoute.js` was never mounted. Now mounted at `/api/ai` alongside `aiRoutes.js`.
- **Double-mount of `/api/subtopics`**: Both `subtopicRoutes` and `subtopicProgressRoutes` were mounted at the same path, causing route collisions. `subtopicProgressRoutes` moved to `/api/subtopic-progress`. Three frontend callers updated (`QuizTab.jsx`, `SubtopicPage.jsx`, `progressApi.js`).
- **Body parser limit**: Raised from `1mb` to `5mb` for `express.json` and `express.urlencoded`.
- **Junk files deleted**: `TeacherResourcesPage_patches.txt` and `question_template.json` removed from `client/src/pages/`.

### `a44971c` — Route ordering, exam-boards enrichment, progressApi path
- **`DELETE /:id` before `PATCH /preferences`**: Express would match `DELETE /users/preferences` against the `/:id` wildcard. Moved `DELETE /:id` to after all named routes.
- **`GET /api/exam-boards` missing `full_name` / `country`**: `examBoardRoutes.js` SELECT now returns `full_name` and `country`. Also added `GET /:code` detail route (was only in the unmounted `examBoardsRoutes.js`).
- **`progressApi.updateProgress` sent `subtopicId` in the body** instead of the URL path. Fixed to `POST /subtopic-progress/:subtopicId`.

### `4a7f1f5` — Parameterised query, missing DB columns
- **`GET /api/users/` used `sequelize.escape()` string interpolation** for LIKE search. Replaced with named Sequelize replacements (`:searchLike`, `:noSearch`). Role clause retains allowlist-guarded literal injection because Postgres cannot cast a `$1` placeholder to an enum.
- **User preference columns missing from migration**: `PATCH /users/preferences` writes to `onboarding_complete`, `daily_goal`, `preferred_study_days`, `preferred_study_time`, `xp_points`, `study_streak_days`, `last_login`, `avatar_url`, `phone`, `country`, `subscription_expires_at`, `subscription_status`. These existed in the Sequelize model but not in `run_complete_migration.js`. Added `ALTER TABLE users ADD COLUMN IF NOT EXISTS` for all of them.

---

## 4. Remaining Bugs — Prioritised

### 🔴 HIGH

**H1 — Seven unmounted route files (backend dead code)**  
Files that exist in `server/routes/` but are never mounted in `server.js`:

| File | Routes | Status |
|------|--------|--------|
| `examBoardsRoutes.js` | `GET /`, `GET /:code/subjects`, `GET /:code` | **Superseded** — all three routes now in mounted `examBoardRoutes.js`. Delete this file. |
| `aiQuestionGenerationRoutes.js` | `GET /:subjectId` | Frontend calls `/admin/generate-questions` (in `adminRoutes.js`). Not called from UI. Audit then delete or mount at e.g. `/api/ai-question-gen`. |
| `examTypeActivation.js` | `POST /activate-exam-types` | Frontend calls `/payments/activate-exam-types` (in `paymentRoutes.js`). Not needed. Delete. |
| `engineValidationRoutes.js` | `GET /validate` | No frontend caller found. Internal/dev tool. Delete or mount at `/api/engine/validate`. |
| `examIntelligenceRoutes.js` | `GET /analysis/:subjectId` | No frontend caller found. Mount at `/api/exam-intelligence` or delete. |
| `explanationRoute.js` | `GET /enhance`, `POST /invalidate` | No frontend caller found. Admin/AI tools. Mount at `/api/explanation` or delete. |
| `testRoutes.js` | (empty) | Empty file — delete. |

**Action:** Delete the superseded/unused ones; mount the rest at appropriate paths if you want to activate them.

**H2 — `noSearch` boolean replacement may not short-circuit in Postgres**  
In `GET /api/users/`, the query uses `:noSearch` as a SQL boolean:
```sql
WHERE 1=1 AND (:noSearch OR email ILIKE :searchLike ...)
```
Sequelize may pass JS `true`/`false` correctly as Postgres booleans, but if it doesn't, all user-list queries will return zero rows when no search term is given. **Test this immediately after deploy.** Fallback fix: check `!search` in JS and conditionally omit the AND clause entirely, same pattern used for `roleClause`.

---

### 🟡 MEDIUM

**M1 — `useProgress` / `useUpdateProgress` hooks are dead code**  
`client/src/hooks/useProgress.js` — no callers anywhere. Either wire up to replace the scattered inline progress calls in `SubtopicPage.jsx` and `QuizTab.jsx`, or delete the file and `client/src/api/progressApi.js`.

**M2 — `/student/resources` and `/student/files` are orphaned routes**  
Both render `StudentFilesPage` but neither appears in the student sidebar nav. Students can only reach them by typing the URL directly. Add sidebar links (in `StudentLayout`) or remove the duplicate route from `App.jsx`. **Do not change the UI component — only the nav link or route definition.**

**M3 — `/admin/home` route is orphaned**  
`<Route path="home" element={<DashboardHome />} />` exists under the admin guard but no sidebar link points to it. Same fix pattern as M2.

**M4 — Paystack webhook URL needs updating on Paystack dashboard**  
The original Render deploy URL is still registered on Paystack. Update the webhook endpoint in Paystack dashboard → Settings → API to:  
`https://www.aischoolonair.ng/api/payments/webhook`  
Caddy has a dedicated `@webhook` route block for raw-body passthrough (HMAC verification happens in `paymentRoutes.js`).

**M5 — Render services not yet suspended**  
The platform migrated to Hetzner but the old Render services may still be running and incurring charges. Suspend or delete:
- The Render API service  
- The Render static site (if any)  
Keep the **Render Postgres database** — it's still the active DB (`DATABASE_URL` points to it).

---

### 🟢 LOW

**L1 — No GitHub Actions CI/CD**  
Every deploy requires an SSH session. Add `.github/workflows/deploy.yml`:
```yaml
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Hetzner
        uses: appleboy/ssh-action@v1
        with:
          host: 178.104.51.118
          username: root
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: bash /opt/aischoolonair/deploy.sh
```
Add `HETZNER_SSH_KEY` (private key) to GitHub repo secrets.

**L2 — `subscription_status` column type risk**  
`run_complete_migration.js` adds `subscription_status` as `VARCHAR(20) DEFAULT 'free_trial'`. The Sequelize User model defines it as a Postgres enum (`enum_users_subscription_status`). On a fresh DB where Sequelize sync runs first, this is fine. On an existing DB the `IF NOT EXISTS` is a no-op. No action needed unless provisioning a completely fresh database without running Sequelize sync first.

**L3 — `WhatsAppButton` renders on all public pages**  
It's in `App.jsx` outside all route guards, so it appears on Login, Register, and Landing. Intentional per client — leave unless told otherwise.

**L4 — Security hardening (post-stabilisation)**  
- Rate limiting is in place (`globalLimiter`, `aiLimiter`) — review thresholds for production traffic.  
- `helmet` CSP is configured in `Caddyfile` (not in Express) — verify no CSP violations in browser console.  
- `DB_SSL=false` should **not** be set in production `api.env`; the DB config defaults to SSL when `NODE_ENV=production`.

---

## 5. Environment Variables Cheat Sheet

**Required in `api.env` (production):**
```
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://...          # Render Postgres connection string
REDIS_URL=redis://redis:6379
JWT_SECRET=                            # 64-char hex
JWT_EXPIRE=7d
SESSION_SECRET=                        # 64-char hex
CLIENT_URL=https://www.aischoolonair.ng
PROD_CLIENT_URL=https://www.aischoolonair.ng
SERVER_BASE_URL=https://www.aischoolonair.ng
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_WEBHOOK_SECRET=...
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=AISchoolonair <noreply@aischoolonair.ng>
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash-lite
ALLOW_LOCAL_UPLOADS=true               # set false only if R2 is configured
```

**Optional (R2 object storage):**
```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
```

**Staging (`api.staging.env`):** same shape but with `sk_test_...` Paystack keys and `CLIENT_URL=https://staging.aischoolonair.ng`.

---

## 6. Database Notes

- **Engine:** PostgreSQL (Render-managed, external to Hetzner)
- **Database name:** `edu_platform`
- **ORM:** Sequelize (raw SQL queries throughout — no Sequelize model `.find()` calls in routes)
- **Migration:** `server/scripts/run_complete_migration.js` — idempotent, safe to re-run, covers all tables and column patches
- **SSL:** Always enabled in production (`rejectUnauthorized: false` for Render's self-signed cert)

---

## 7. Key Architectural Decisions (don't change without discussion)

1. **`/api/health` at both `/health` and `/api/health`** — needed because Caddy's healthcheck and the Docker healthcheck use different paths.
2. **`subtopicProgressRoutes` at `/api/subtopic-progress`** (not `/api/subtopics`) — moved to avoid route collision.
3. **`aiChatRoute` mounted alongside `aiRoutes` at `/api/ai`** — both handle different sub-paths, no collision.
4. **`express.json` limit is `5mb`** — raised from `1mb` to accommodate bulk metadata requests.
5. **Frontend `VITE_API_URL=/api`** (relative path, baked at build time) — means the SPA always hits the same origin, no CORS cookie issues regardless of domain.
6. **UI must not be modified** — all fixes are backend-only unless explicitly instructed otherwise.

---

## 8. Contact

**Pronoia Digital Services**  
Phone: +234 810 755 1000
