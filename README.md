# AISchoolonair

Nigerian secondary-school EdTech platform. Students practice past-paper questions,
get AI-generated explanations, and track their progress across WAEC, JAMB, NECO,
GCE, JUPEB, IELTS, TOEFL, SAT and Language Labs.

**Live site:** https://www.aischoolonair.ng  
**Staging:** https://staging.aischoolonair.ng  
**Repo:** https://github.com/PDS-David/edu-platform

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js 22 + Express |
| Database | PostgreSQL 18 (hosted on Render) |
| AI | Google Gemini 2.5 Flash |
| File storage | Cloudflare R2 (production) / local disk (dev) |
| Queue / cache | Redis + BullMQ |
| Payments | Paystack |
| Production host | Hetzner CX23 — Docker Compose + Caddy |
| CI/CD | Manual `./deploy.sh` on the server |

---

## Repository Layout

```
edu-platform/
├── client/                  # React SPA (Vite)
│   ├── src/
│   │   ├── pages/           # One file per route/screen
│   │   ├── components/      # Reusable UI pieces
│   │   ├── context/         # AuthContext — global auth state
│   │   ├── services/api.js  # Axios instance — all API calls go here
│   │   └── config/          # Branding, feature flags
│   ├── public/              # Static assets (logos)
│   ├── Dockerfile           # nginx — serves built SPA
│   └── .env.example         # VITE_API_URL
│
├── server/                  # Node/Express API
│   ├── server.js            # Entry point, middleware, route mounting
│   ├── controllers/         # auth.js — register, login, getMe
│   ├── routes/              # One file per resource group
│   ├── models/              # Sequelize models
│   ├── services/            # ai.js hub, aiQuestionGenerator, etc.
│   ├── middleware/           # auth guard, rate limit, upload
│   ├── config/database.js   # Sequelize + connection pool
│   ├── utils/response.js    # success() / error() helpers
│   ├── Dockerfile           # Node 22 Alpine production image
│   └── .env.example         # All required server env vars
│
├── database/                # SQL migration files (run in order)
│   ├── migration_001.sql    # Core tables, free_trial enum
│   ├── migration_002.sql    # Questions columns, payments
│   ├── migration_003.sql    # AI chat, badges, concepts, videos
│   └── migrate_roles_and_curricula.sql  # Exam boards + admin seed
│
├── nginx/nginx.conf         # nginx config inside web container
├── Caddyfile                # Reverse proxy + TLS (production)
├── docker-compose.yml       # Production + staging services
├── api.env.example          # Template for Hetzner api.env
├── api.staging.env.example  # Template for staging env
├── deploy.sh                # Run on server: git pull + rebuild
├── hetzner-bootstrap.sh     # One-time server setup script
├── render.yaml              # Render.com deployment config
└── DEPLOYMENT.md            # Full Hetzner step-by-step guide
```

---

## Running Locally

### Prerequisites
- Node.js 22+
- PostgreSQL 14+
- A free [Google AI Studio](https://aistudio.google.com) API key (Gemini)

### 1. Clone and install

```bash
git clone https://github.com/PDS-David/edu-platform.git
cd edu-platform

# Backend
cd server && npm install && cd ..

# Frontend
cd client && npm install && cd ..
```

### 2. Create environment files

**Backend** — copy and fill in:
```bash
cp server/.env.example server/.env
```

Minimum required values in `server/.env`:
```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/edu_platform
JWT_SECRET=any-long-random-string-at-least-32-chars
CLIENT_URL=http://localhost:5173
GEMINI_API_KEY=your-key-from-aistudio.google.com
```

**Frontend** — copy and fill in:
```bash
cp client/.env.example client/.env
```

`client/.env`:
```env
VITE_API_URL=http://localhost:5000/api
```

### 3. Set up the database

```bash
# Create the database
psql -U postgres -c "CREATE DATABASE edu_platform;"

# Run migrations in order
psql -U postgres -d edu_platform -f database/migration_001.sql
psql -U postgres -d edu_platform -f database/migration_002.sql
psql -U postgres -d edu_platform -f database/migration_003.sql
psql -U postgres -d edu_platform -f database/migrate_roles_and_curricula.sql
```

The last migration seeds:
- Admin account: `admin@aischoolonair.com` / `password123` — **change this immediately**
- All 12 exam boards (JAMB, WAEC, NECO, GCE, JUPEB, IELTS, TOEFL, SAT, 3× Language Labs)

### 4. Start the app

```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

Open http://localhost:5173

---

## Deploying (Hetzner + GitHub Actions)

Production runs on a Hetzner CX23 (IP `178.104.51.118`) with Docker + Caddy as
a reverse proxy and the database on Supabase (PostgreSQL via `DATABASE_URL`).

Deployment is automated via GitHub Actions → SSH → `deploy.sh`:

1. Push to `main` — `deploy.yml` SSHs into the Hetzner server and runs
   `deploy.sh`, which builds the Docker image and runs DB migrations.
2. Required GitHub Actions secrets: `HETZNER_HOST`, `HETZNER_USER`,
   `HETZNER_SSH_KEY`, `REGISTRY_USER`, `REGISTRY_PASSWORD`.
3. Server env vars live in `/opt/aischoolonair/server/.env` on the Hetzner
   server. Required: `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`,
   `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, `EMAIL_USER`, `EMAIL_PASS`.
4. The `render.yaml` file in the repo root is **stale and unused**.

---

## Deploying to Hetzner (production)

Full step-by-step: **see [DEPLOYMENT.md](./DEPLOYMENT.md)**

Quick summary:
```bash
# On the Hetzner server (Ubuntu 24.04)
bash hetzner-bootstrap.sh          # one-time setup
cp api.env.example api.env
nano api.env                       # fill in all REPLACE_ME values
./deploy.sh                        # builds + starts all containers
```

Services started by `docker-compose.yml`:
- `caddy` — TLS termination + reverse proxy (ports 80/443)
- `api` — Node/Express (internal :5000)
- `web` — React SPA via nginx (internal :80)
- `api_staging` + `web_staging` — mirrors for staging.aischoolonair.ng
- `redis` — BullMQ queues + rate limiting (internal :6379)

---

## Environment Variables Reference

### Server (`server/.env` or `api.env` on Hetzner)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Full PostgreSQL connection string |
| `JWT_SECRET` | ✅ | 64-char random hex — never change in production |
| `GEMINI_API_KEY` | ✅ | Google AI Studio — Gemini 2.5 Flash |
| `CLIENT_URL` | ✅ | Browser origin e.g. `https://www.aischoolonair.ng` |
| `PAYSTACK_SECRET_KEY` | payments | `sk_live_...` or `sk_test_...` |
| `PAYSTACK_WEBHOOK_SECRET` | payments | From Paystack dashboard |
| `EMAIL_USER` / `EMAIL_PASS` | email | Gmail + App Password |
| `REDIS_URL` | queues | `redis://redis:6379` in Docker, `redis://localhost:6379` locally |
| `R2_ACCOUNT_ID` | file storage | Cloudflare R2 (optional — falls back to local disk) |
| `R2_ACCESS_KEY_ID` | file storage | R2 API token |
| `R2_SECRET_ACCESS_KEY` | file storage | R2 API secret |
| `R2_BUCKET` | file storage | Bucket name |
| `R2_PUBLIC_BASE_URL` | file storage | Public r2.dev URL or custom CDN domain |

### Client (`client/.env`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Full API base URL e.g. `https://www.aischoolonair.ng/api` or `/api` in Docker |

---

## Database Migrations

Run SQL files from the `database/` folder **in this exact order**:

| File | What it creates |
|---|---|
| `migration_001.sql` | Users, subjects, topics, subtopics, classes, `free_trial` enum |
| `migration_002.sql` | Questions extended columns, payment tables |
| `migration_003.sql` | AI chat, badges, concepts, videos, resources, past papers |
| `migrate_roles_and_curricula.sql` | Exam boards, admin user seed |

All migrations use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` — safe to re-run.

---

## AI Architecture

All AI calls are routed through `server/services/ai.js` as the central hub.

```
Admin/Teacher request
       │
       ▼
  ai.js generate(prompt, task)
       │
       ├── task = 'generate-questions'  → gemini-2.5-flash
       ├── task = 'explain'             → gemini-2.5-flash
       ├── task = 'hint'                → gemini-2.5-flash
       ├── task = 'essay-mark'          → gemini-2.5-flash
       └── fallback chain: gemini-2.5-flash-preview → gemini-1.5-flash

Exceptions (bypass hub — direct Gemini call):
  aiChatRoute.js /chat/stream  → SSE streaming (must be direct)
  aiRoutes.js    /mark-image   → multimodal image input (must be direct)
```

**Rule:** Never add direct Gemini calls to new routes. Always use `generate(prompt, task)`.

---

## Admin Accounts

After running migrations, one admin exists:

| Email | Password |
|---|---|
| `admin@aischoolonair.com` | `password123` |

**Change the password immediately after first login.**

A second account `admin@schoolonair.com` may exist from early testing — delete it from the DB:
```sql
DELETE FROM users WHERE email = 'admin@schoolonair.com';
```

---

## Common Issues

**Login returns 500**
- Check `DATABASE_URL` is set and correct
- Run `docker logs aischool_api --tail 50` and look for the actual error
- The DB connection test runs at startup — if it fails, the container exits

**Fonts not loading (CSP error)**
- The Caddy CSP header must include `https://fonts.googleapis.com` in `style-src`
- Already fixed in `Caddyfile` — restart Caddy: `docker compose restart caddy`

**Google Fonts blocked on Render**
- Set a custom `Content-Security-Policy` header in Render dashboard → your static site → Headers

**Onboarding loop (student redirected to /onboarding every login)**
- Fixed in `client/src/pages/OnboardingPage.jsx` — `updateUser()` is called after preferences save
- If students are stuck: run `UPDATE users SET onboarding_complete = true WHERE role = 'student';`

**AI question generation times out**
- Gemini can take 30-60s for 10 questions
- Axios timeout is set to 90s in `client/src/services/api.js`
- Try generating 5 questions instead of 10

**`subject_id` UUID error on resource upload**
- Resources use INTEGER IDs for `topic_id` and `subtopic_id`
- Only `users.id` (and FKs to it) are UUID
- Never call `parseInt()` on any `_id` field — check the model first

---

## Contributing

1. Fork → branch → PR against `main`
2. Run `node --check` on any server files you change
3. No emojis in `.sql` files — they cause WIN1252/UTF8 encoding errors in psql on Windows
4. All AI tasks must be added to `GEMINI_MODEL_MAP` in `server/services/ai.js` before use
5. Never throw at module load time — only inside functions
