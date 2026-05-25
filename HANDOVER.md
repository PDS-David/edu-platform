# AISchoolonair — Agent Handover Document

**Date**: 25 May 2026  
**Repo**: https://github.com/PDS-David/edu-platform  
**Live URL**: https://www.aischoolonair.ng  
**Staging**: https://staging.aischoolonair.ng  
**Server**: Hetzner CX23 — `ssh root@178.104.51.118`  
**Database**: Supabase PostgreSQL (connection string in `/opt/aischoolonair/api.env`)

---

## Architecture Overview

```
Browser → Caddy (TLS + proxy) → api:5000 (Node/Express)
                              → web:80  (React SPA via nginx)
                              → api_staging:5000 (staging)
                              → web_staging:80  (staging)
                              → redis:6379 (shared)
```

**All Docker containers live in `/opt/aischoolonair/`**

Key files on server:
- `/opt/aischoolonair/api.env` — production secrets (never commit)
- `/opt/aischoolonair/api.staging.env` — staging secrets
- `/opt/aischoolonair/Caddyfile` — reverse proxy config
- `/opt/aischoolonair/docker-compose.yml` — service definitions

**Persistent volumes** (Docker named):
- `uploads_data` → `/app/uploads` in api container (local file storage)
- `caddy_data` → TLS certificates (never delete)

**Authentication**: JWT bearer tokens. Admin/teacher roles are stored in `users.role` (PostgreSQL enum `enum_users_role`).

---

## Standard Deployment Workflow

```bash
ssh root@178.104.51.118
cd /opt/aischoolonair
git pull
docker compose build api web
docker compose up -d --no-deps api web
docker logs aischool_api --tail=30
```

---

## Current Status (25 May 2026)

### What's Working
- Production site loads at https://www.aischoolonair.ng
- Login, registration, student dashboard
- Past papers scraper UI (frontend complete)
- Admin catalog (exam types + subjects CRUD)
- Bulk upload file drop zone (frontend complete)

### Known Issues and Fixes Applied This Session

#### 1. BULK UPLOAD — BLOCKED BY MISSING ENV VAR ⚠️ PRIORITY 1
**Symptom**: Uploading files returns HTTP 503 "File uploads are disabled until durable storage is configured"  
**Root cause**: `ALLOW_LOCAL_UPLOADS=true` is NOT set in `/opt/aischoolonair/api.env`  
**Fix**: Run `echo "ALLOW_LOCAL_UPLOADS=true" >> /opt/aischoolonair/api.env` then rebuild API  
**Why**: The app is on Hetzner with persistent Docker volumes — local uploads are safe. The 503 guard was written for Render's ephemeral filesystem and must be overridden.

#### 2. USERS LIST 500 ERROR — enum comparison fix (PUSHED TO GITHUB)
**Symptom**: Admin → Users page shows 500; logs show `invalid input value for enum enum_users_role: ""`  
**Root cause**: `WHERE role = :role` fails when `:role` is `''` (empty string) and `role` column is a PostgreSQL enum  
**Fix applied**: `server/routes/users.js` — changed to `WHERE role::text = :role` (cast enum to text before comparison)  
**Commit**: `e2265a1` — already in GitHub, will deploy on next `git pull`

#### 3. ADMIN ANALYTICS "Failed to load analytics" (quiz_attempts missing)
**Symptom**: Admin dashboard Analytics section shows error triangle  
**Root cause**: `quiz_attempts` table doesn't exist in the live database  
**Fix**: Run `node /app/scripts/fix_live_schema.js` inside the api container (see below)

#### 4. SUBJECTS COUNT = 0 in admin dashboard
**Symptom**: Admin dashboard shows "Total Subjects: 0"  
**Root cause**: `subjects.exam_board_id` UUID column was missing; after adding it, subjects need to be linked to `exam_boards` rows  
**Fix**: Run the schema migration, then add subjects via Admin → Catalog → expand any Exam Type → Add Subject

#### 5. PAST PAPERS filter "column pp.exam_board does not exist"
**Root cause**: `past_papers.exam_board` column was missing  
**Fix**: Run schema migration (included in fix_live_schema.js)

#### 6. STAGING API crash loop
**Symptom**: `aischool_api_staging` container restarts every 60s with "Database connection failed"  
**Root cause**: `api.staging.env` has placeholder `DATABASE_URL` not pointing to real DB  
**Fix**: Copy production DATABASE_URL to staging env (see fix script)

#### 7. SECURITY: `.env` file served publicly
**Symptom**: `GET /.env HTTP/1.1" 200` in web container logs  
**Root cause**: Nginx SPA container serves ALL files; `.env` is not present in client/dist but the path falls through  
**Status**: Low risk (no .env in client dist) but worth adding Caddy deny rule

---

## Complete Fix Procedure (run on server)

SSH in and run these commands in order:

```bash
ssh root@178.104.51.118
cd /opt/aischoolonair

# Step 1: Pull latest code (includes role::text fix + migration script)
git pull

# Step 2: Add ALLOW_LOCAL_UPLOADS to production env
grep -q "ALLOW_LOCAL_UPLOADS" api.env || echo "ALLOW_LOCAL_UPLOADS=true" >> api.env

# Step 3: Fix staging DATABASE_URL
PROD_DB=$(grep "^DATABASE_URL=" api.env | cut -d= -f2-)
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${PROD_DB}|" api.staging.env
grep -q "ALLOW_LOCAL_UPLOADS" api.staging.env || echo "ALLOW_LOCAL_UPLOADS=true" >> api.staging.env

# Step 4: Run database schema migrations
docker exec aischool_api node /app/scripts/fix_live_schema.js

# Step 5: Rebuild and restart
docker compose build api api_staging
docker compose up -d --no-deps api api_staging

# Step 6: Verify
sleep 15
docker ps --format "table {{.Names}}\t{{.Status}}" | grep aischool
docker logs aischool_api --tail=20
```

---

## Repository Structure

```
edu-platform/
├── client/src/
│   ├── pages/
│   │   ├── AdminDashboard.jsx        ← Admin UI (tabs: Analytics, Users, Catalog, Bulk Upload, etc.)
│   │   ├── StudentDashboard.jsx
│   │   ├── TeacherDashboard.jsx
│   │   └── PastPapersPage.jsx
│   ├── components/
│   │   ├── AdminBulkUploadPanel.jsx  ← The bulk upload UI component (3-stage workflow)
│   │   └── TopNav.jsx
│   └── services/
│       └── apiClient.js              ← Axios instance, base URL = /api (relative)
├── server/
│   ├── routes/
│   │   ├── resourceRoutes.js         ← /api/resources/* (bulk-upload, staged, assign-meta, assign-users)
│   │   ├── adminRoutes.js            ← /api/admin/* (platform-stats, generate-questions)
│   │   ├── catalogRoutes.js          ← /api/catalog/* (types, all-subjects, types/:id/subjects)
│   │   ├── teacherRoutes.js          ← /api/teacher/* (topics, subtopics, classes)
│   │   ├── users.js                  ← /api/users (list with role filter)
│   │   └── pastPaperRoutes.js        ← /api/past-papers
│   ├── scripts/
│   │   └── fix_live_schema.js        ← Run this to fix all DB schema issues
│   ├── middleware/auth.js             ← protect (JWT verify) + authorize (role gate)
│   ├── config/database.js            ← Sequelize connection (uses DATABASE_URL env)
│   └── server.js                     ← Express app, route mounting, CORS
├── database/                         ← SQL migration files (mostly gitignored *.sql)
├── docker-compose.yml
├── Caddyfile
├── api.env.example                   ← Template for api.env (NEVER commit api.env)
└── api.staging.env.example
```

---

## Bulk Upload Flow — Complete Technical Picture

**Frontend**: `AdminBulkUploadPanel.jsx` — 3 stages:
1. Drop/select up to 20 files → POST to `/api/resources/bulk-upload`
2. Staged files list → each file gets metadata (Exam Type, Subject, Topic) via PUT `/api/resources/:id/assign-meta`
3. (Optional) Push to students via PUT `/api/resources/:id/assign-users`

**Backend gate**: The upload 503 requires EITHER `R2_*` env vars (Cloudflare R2 bucket) OR `ALLOW_LOCAL_UPLOADS=true`. Hetzner uses local disk with Docker volumes so must set `ALLOW_LOCAL_UPLOADS=true`.

**File storage**: Without R2, files go to `/app/uploads/resources/` inside the api container which maps to Docker volume `uploads_data` → persistent across restarts.

**Key API routes**:
```
POST /api/resources/bulk-upload       ← multer file upload, saves to disk/R2, returns staged rows
GET  /api/resources/staged            ← lists resources WHERE is_staged = true
PUT  /api/resources/:id/assign-meta  ← sets subject/topic/kind, sets is_staged=false
PUT  /api/resources/:id/assign-users ← creates resource_user_assignments rows
DELETE /api/resources/:id            ← removes file from disk + DB
GET  /api/catalog/types              ← exam boards list (for dropdowns)
GET  /api/catalog/all-subjects       ← all active subjects (requires subjects.exam_board_id UUID)
GET  /api/catalog/types/:id/subjects ← subjects filtered by exam board
GET  /api/teacher/topics?subject_id= ← topics for a subject
GET  /api/teacher/subtopics?topic_id=← subtopics for a topic
```

**Auth**: All resource routes require Bearer JWT. `authorize('admin', 'teacher')` means only those roles can upload. `teacherOnly` middleware in teacher routes checks `['teacher', 'admin'].includes(req.user.role)`.

---

## Database Schema: Key Tables

```sql
-- Core user table (Supabase auth.users merged)
users: id UUID, email, first_name, last_name, role (enum: student/teacher/admin),
       is_active, subscription_status, pending_exam_board_ids UUID[]

-- Exam boards (what the UI calls "Exam Types")
exam_boards: id UUID, code VARCHAR, name, full_name, icon_emoji, 
             display_order, is_active, country

-- Subjects linked to exam boards
subjects: id INTEGER, name, code, exam_board_id UUID → exam_boards.id,
          exam_board_code, is_active, level

-- Topics and subtopics (hierarchical curriculum)
topics:    id INTEGER, subject_id INTEGER, name, is_active
subtopics: id INTEGER, topic_id INTEGER, subject_id INTEGER, name, is_active

-- File resources (bulk uploaded content)
resources: id UUID, title, resource_type, file_url, file_size_bytes,
           original_filename, mime_type, is_staged, is_active,
           subject_id INTEGER, topic_id INTEGER, subtopic_id INTEGER,
           push_type, content_kind, uploaded_by UUID, created_at, updated_at

-- Student resource assignments
resource_user_assignments: id, resource_id UUID, user_id UUID, push_type, assigned_at

-- Quiz system (required for analytics)
quiz_attempts: id UUID, student_id UUID, quiz_id UUID, score, percentage, created_at
student_answers: id UUID, attempt_id UUID, question_id UUID, is_correct, created_at
```

---

## Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `503 File uploads disabled` | `ALLOW_LOCAL_UPLOADS` missing | Add to api.env + rebuild |
| `column "uploaded_at" does not exist` | Old code had extra column in INSERT | Fixed in repo (2x NOW() not 3x) |
| `invalid input value for enum enum_users_role: ""` | role comparison on enum without cast | Fixed: `role::text = :role` |
| `relation "quiz_attempts" does not exist` | Table not created | Run fix_live_schema.js |
| `column pp.exam_board does not exist` | Missing column in past_papers | Run fix_live_schema.js |
| `column s.exam_board_id does not exist` | Missing column in subjects | Run fix_live_schema.js |
| Staging crash loop ("Database connection terminated") | Bad DATABASE_URL in api.staging.env | Copy from api.env |
| `GET /api/admin/platform-stats 500` | quiz_attempts table missing | Run fix_live_schema.js |

---

## Environment Variables Reference

**Required in api.env for bulk upload to work on Hetzner:**
```
ALLOW_LOCAL_UPLOADS=true    ← CRITICAL — without this, bulk upload returns 503
NODE_ENV=production
DATABASE_URL=postgresql://...supabase.com.../postgres
JWT_SECRET=<64-char hex>
CLIENT_URL=https://www.aischoolonair.ng
PROD_CLIENT_URL=https://aischoolonair.ng
```

**Optional (for Cloudflare R2 cloud storage instead of local disk):**
```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=aischoolonair-uploads
R2_PUBLIC_BASE_URL=https://pub-xxx.r2.dev
```
If R2 vars are set, R2 is used. Otherwise local disk is used (requires ALLOW_LOCAL_UPLOADS=true).

---

## Admin Dashboard Tabs (what each does)

- **Analytics** — platform stats (requires quiz_attempts + student_answers tables)
- **Users** — list/search/filter users by role; role filter requires `role::text` cast fix
- **Schools** — school management (separate feature)
- **Content** — content management
- **Catalog** — Exam Types (exam_boards table) + Subjects (subjects table) CRUD
- **Teachers** — teacher assignment to subjects
- **AI Generate** — AI question generation (requires exam_board + subject selection)
- **Bulk Upload** — file upload → staging → assign metadata → push to students
- **Past Papers** — scrape/filter past papers (requires past_papers.exam_board column)
- **Settings** — platform settings

---

## Next Agent Action Items (Priority Order)

1. **[IMMEDIATE]** SSH in and run the fix procedure above — this unblocks bulk upload
2. **[IMMEDIATE]** Run `docker exec aischool_api node /app/scripts/fix_live_schema.js`
3. **[VERIFY]** Test bulk upload at https://www.aischoolonair.ng/admin/dashboard
4. **[DATA]** Add at least one Subject under each Exam Type via Admin → Catalog (subjects count is 0)
5. **[VERIFY]** Confirm admin analytics loads after quiz_attempts table is created
6. **[VERIFY]** Confirm users list loads without 500 error
7. **[SECURITY]** Add Caddyfile deny rule for `/.env` and `/api.env` paths
8. **[STAGING]** Fix staging DATABASE_URL so staging container stops crash-looping
