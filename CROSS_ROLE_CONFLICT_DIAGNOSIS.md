# Cross-Role Conflict Diagnosis & Fix Log

## Root Cause

A single shared response normaliser in `client/src/services/apiClient.js` flattened
every server response into a fixed shape:

```js
{ data, success, meta, total, count, message, status: HTTP_INTEGER }
```

Two structural problems caused student/admin fixes to break each other:

### Problem 1 — Custom fields were silently swallowed

Admin backend routes return non-standard top-level fields:
- `send-notification` → `{ success:true, sent: N }`
- `questions/review` → `{ success:true, status: 'approved' }`

The normaliser only hoisted `data, success, meta, total, count, message` — so
`sent`, `inserted`, `approval_status` etc. were stripped. Frontend read `res.sent`
→ `undefined` → "Notification sent to 0 user(s)".

### Problem 2 — `status` field collision

The normaliser set `status: response.status` (HTTP integer 200/201).
Any backend that returned a *business-logic* status string at top level
(e.g. `{ success:true, status:'approved' }`) would have it clobbered by 200.

---

## Fix Applied (this session)

**`client/src/services/apiClient.js`** — Extended normaliser to:
1. Hoist all custom fields: `sent`, `inserted`, `already_exists`, `unread_count`
2. Expose business status as `r.approval_status` (not `r.status`)
3. Expose HTTP integer as `r.httpStatus` (renamed from `r.status`)
4. Double-hoist: checks both `raw.field` and `raw.data.field` for resilience

**`client/src/pages/AdminDashboard.jsx`** — Fixed line 754:
- `res.sent ?? 0` → `res.sent ?? res.data?.sent ?? 0`

---

## Server-side Response Shape Inventory

All backend routes should use this pattern:
```js
return res.json({ success: true, data: <payload> });
```

### Routes that already comply ✓
- `GET /admin/platform-stats` → `{ success, data: {...} }`
- `GET /admin/questions/pending` → `{ success, data: [...], total: N }`
- `PUT /admin/questions/:id/review` → `{ success, status: 'approved'|'rejected' }`
- `GET /users/stats` → `{ success, data: {...} }`
- `GET /users` → `{ success, data: [...], total: N }`

### Routes with non-standard shapes (hoisted by normaliser)
- `POST /admin/send-notification` → `{ success, sent: N }` → `r.sent` ✓
- `GET /admin/questions/pending-count` → `{ success, count: N }` → `r.count` ✓

---

## Remaining Work for Next Agent

### 1. Verify `QuizTab.jsx` line ~700 still has `setResults(r.data)` not `setResults(r)`
The quiz results fix has been lost and re-applied multiple times across merges.
Check: `grep -n "setResults" client/src/components/QuizTab.jsx`
Should see: `setResults(directResults)` in ResultsScreen — if it says `setResults(r)`
that's the bug.

### 2. Check `TeacherResourcesPage.jsx` upload response
The XHR upload at line ~145 parses the response manually (not via apiClient).
Verify the JSON it reads matches what `/api/resources/bulk-upload` returns.
`grep -n "resolve\|reject\|JSON.parse" client/src/pages/TeacherResourcesPage.jsx | head -20`

### 3. Admin approval flow in `AdminDashboard.jsx`
Line ~595: `const qs = res?.data?.questions ?? res?.questions ?? []`
This double-fallback pattern is correct. Verify the admin question assignment
endpoint (`GET /admin/assignments`) returns `{ data: { questions: [...] } }`.

### 4. Unread notifications count
`GET /api/notifications/unread-count` may return `{ count: N }` at top level.
The normaliser now hoists `unread_count` but the backend may use `count` not
`unread_count`. Verify: `grep -n "unread" server/routes/` and the frontend
component that reads it.

### 5. Run the Supabase SQL patches
The following SQL must be run on Supabase SQL Editor if not already done:
```sql
-- patch_enrollment_status_columns.sql
ALTER TABLE student_subjects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';
ALTER TABLE student_subjects ADD COLUMN IF NOT EXISTS enrollment_source TEXT DEFAULT 'explicit';
ALTER TABLE student_exam_types ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';

-- test_assignments columns
ALTER TABLE test_assignments ADD COLUMN IF NOT EXISTS score INTEGER;
ALTER TABLE test_assignments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE test_assignments ADD COLUMN IF NOT EXISTS total_time_ms BIGINT;

-- auth hardening (enables server-side token revocation)
-- Run database/migration_auth_hardening.sql in full
```

### 6. Remaining known 404: `GET /api/ai/chat/session`
This route exists in `aiChatRoute.js` and is mounted correctly. If still 404,
check `safeRequire` isn't silently swallowing a load error:
`node --check server/routes/aiChatRoute.js`

---

## How to Continue

```bash
cd /home/claude/edu-platform
git pull origin main
# Make fixes
cd client && npm run build  # always verify build before committing
cd ..
git add -A && git commit -m "fix: <description>" && git push origin main
```
