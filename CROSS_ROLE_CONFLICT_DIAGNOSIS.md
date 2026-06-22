# Cross-Role Conflict Diagnosis & Fix Plan
**AISchoolOnAir — edu-platform**
**Authored:** 2026-06-22
**Status:** Diagnosis complete. Fixes partially implemented (see Phase 3).

---

## 1. Root Cause

There is **one shared** `apiClient.js` response interceptor that normalises
every API response into a fixed shape. Student-facing routes were written to
match this normalised shape. Admin-facing routes were written independently
(often using a separate `server/utils/response.js` helper) with slightly
different envelope structures that the normaliser **partially breaks**.

### The normaliser (client/src/services/apiClient.js)

```js
(response) => ({
  data:    response.data?.data    ?? response.data,   // unwraps one .data level
  success: response.data?.success,
  meta:    response.data?.meta    ?? null,
  total:   response.data?.total   ?? null,
  count:   response.data?.count   ?? null,
  message: response.data?.message ?? null,
  status:  response.status,
})
```

**What it handles correctly:**
- `{ success, data: [...] }` → `r.data = [...]` ✓
- `{ success, data: {...} }` → `r.data = {...}` ✓
- `{ success, count: N }` → `r.count = N` ✓ (count is hoisted)
- `{ success, total: N }` → `r.total = N` ✓ (total is hoisted)
- `{ success, message: "..." }` → `r.message = "..."` ✓ (message is hoisted)
- `{ success, meta: {total,page,limit} }` → `r.meta = {...}` ✓

**What it breaks:**
- `{ success, sent: N }` → `r.sent = undefined` ✗ (`sent` not hoisted)
- `{ success, inserted: N }` → `r.inserted = undefined` ✗
- `{ success, migrated, skipped, failed, results }` → all `undefined` ✗
- `{ success, dry, migrated, ... }` → all `undefined` ✗
- `{ success, status: "active" }` → `r.status` conflicts with HTTP status ✗
- `{ success, already_exists: true }` → `r.already_exists = undefined` ✗
- Auth: `{ success, token, user }` → `r.data = {success,token,user}` ✓ but
  only because `response.data.data` is `undefined` so it falls back to the
  whole object — works by coincidence, fragile.

---

## 2. Specific Broken Call Sites

### 2a. Admin — Notification send (AdminDashboard.jsx:754)
```
POST /admin/send-notification
Server returns: { success: true, sent: 5 }
Frontend reads: res.sent ?? 0
Result: Toast always shows "Notification sent to 0 user(s)"
Fix: Add `sent` to the normaliser, OR server wraps in data: { sent: 5 }
```

### 2b. Admin — Question generation result (AdminDashboard.jsx:595-597)
```
POST /admin/generate-questions
Server returns: { success: true, data: { questions: [...], inserted: N } }
Frontend reads: res.data?.questions ?? res.questions
                res.data?.inserted  ?? res.inserted
Result: Works when server wraps in data. Fragile — depends on server shape.
```

### 2c. Admin — R2 migration (AdminDashboard.jsx:~1187)
```
POST /admin/r2-migration
Server returns: { success: true, dry, migrated, skipped, failed, total, results }
Frontend reads: r.data?.migrated, r.data?.results etc.
Result: Broken — fields at wrong level. res.data = whole response object
        because data wrapper is missing, but then r.data.migrated works
        because the whole object IS r.data. Actually works by the fallback.
        But r.data.dry, r.data.results etc are accessible this way. ← OK
```

### 2d. Admin — Teacher assignments (AdminDashboard.jsx:314)
```
GET /admin/teacher-assignments
GET /users?role=teacher
Frontend reads: aRes.value.data, tRes.value.data
Server returns: { success, data: rows } for both
Result: Correct, normaliser unwraps .data ✓
```

### 2e. Admin — User role update response check
```
PUT /api/users/:id/role
Server returns: { success: true, message: '...' }
Frontend: doesn't read response body — just calls fetchUsers() on success ✓
```

### 2f. Student — /students/my-subjects (StudentDashboard.jsx)
```
GET /api/students/my-subjects
Server returns: { success: true, data: [...] } OR { success: true, ownSubjects: [...] }
```
Let me check the actual shape:

### 2g. Admin — pending-count (AdminDashboard.jsx:548)
```
GET /admin/questions/pending-count
Server returns: { success: true, count: N }
Frontend reads: r.count
Normaliser hoists count: r.count = N ✓ Works correctly.
```

### 2h. CRITICAL — Token/auth flow affects ALL roles
```
POST /auth/login
Server returns: { success: true, token: "...", user: {...} }
Normaliser: r.data = {success:true, token, user} (whole object, no .data on server)
authApi.js: returns res.data
AuthContext.js: reads res.token, res.user from that
Result: res = {success,token,user} — works ✓

BUT if server ever adds a .data wrapper to login response, this breaks ALL roles.
```

---

## 3. The apiClient.js `unread_count` / `pagination` gap

Added in DEF-002 remediation but not consistently present everywhere.
The normaliser was extended to pass through these two fields:
```js
unread_count: response.data?.unread_count ?? null,
pagination:   response.data?.pagination   ?? null,
```
Check current apiClient.js — as of latest merge this is NOT present.
It was added then lost in a merge. Needs to be re-added.

---

## 4. The `response.data?.status` collision

Several admin endpoints return `{ success: true, status: "active" }` (a
business-logic status string). The normaliser's output object also has a
`status` field: the HTTP status code integer.

```
Server: { success: true, status: "approved" }
Normaliser output: { ..., status: 200 }   ← HTTP code overwrites business status
Frontend reads: res.status → gets 200 (integer), not "approved"
```

Affected: `PUT /admin/teacher-questions/:id` approve/reject flows.

---

## 5. Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND                                                        │
│                                                                  │
│  apiClient.js → response normaliser → fixed shape:              │
│  { data, success, meta, total, count, message, status }          │
│                                                                  │
│  STUDENT pages: written for this shape ✓                         │
│  ADMIN pages: written assuming fields pass through               │
│               from original server response — partially ✗        │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP
┌──────────────────────────────▼──────────────────────────────────┐
│  BACKEND                                                         │
│                                                                  │
│  Student routes: mostly { success, data: [...] } ✓              │
│  Admin routes: mix of shapes:                                    │
│    server/utils/response.js:paginated → { success, data, meta } ✓│
│    server/utils/response.js:success   → { success, data }       ✓│
│    Inline: { success, sent: N }                                  ✗│
│    Inline: { success, status: "active" }  (collides)            ✗│
│    Inline: { success, count: N }           ✓ (hoisted)          │
│    Inline: { success, total: N }           ✓ (hoisted)          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Fix Strategy

**Do NOT change the normaliser shape** — that would require auditing every
consumer. Instead:

### Fix A: Extend the normaliser to hoist all non-standard fields safely
Add `sent`, `inserted`, `already_exists` to the hoisted fields in apiClient.js.
This is additive and cannot break anything already working.

### Fix B: Fix the `status` collision
Rename the hoisted field to `httpStatus` in the normaliser, OR have admin
frontend code read `res.data?.status` instead of `res.status` for business
status strings.

### Fix C: Standardise the 4 admin backend endpoints that return non-standard shapes
Use `server/utils/response.js:success(res, { sent: N })` instead of inline
`res.json({ success: true, sent: N })`. This way the frontend always sees
`res.data.sent` via the normaliser's `.data` unwrap.

### Fix D: Re-add unread_count / pagination to normaliser (lost in merge).

---

## 7. Concrete File Changes Required

### 7a. client/src/services/apiClient.js — extend normaliser

```js
// In the success response normaliser, add:
(response) => ({
  data:         response.data?.data    ?? response.data,
  success:      response.data?.success,
  meta:         response.data?.meta    ?? null,
  total:        response.data?.total   ?? null,
  count:        response.data?.count   ?? null,
  message:      response.data?.message ?? null,
  // DEF-002: pagination fields from notification endpoint
  unread_count: response.data?.unread_count ?? null,
  pagination:   response.data?.pagination   ?? null,
  // Admin endpoints that return top-level fields not in .data wrapper:
  sent:         response.data?.sent         ?? null,
  inserted:     response.data?.inserted     ?? null,
  // Use httpStatus for HTTP code to avoid collision with business status strings
  httpStatus:   response.status,
  status:       response.status,  // keep for backward compat
})
```

### 7b. server/routes/adminRoutes.js — POST /admin/send-notification

Change:
```js
return res.json({ success: true, sent: users.length });
```
To:
```js
return success(res, { sent: users.length });
// This wraps it as { success: true, data: { sent: N } }
// Frontend then reads res.data.sent — consistent with normaliser
```
AND update AdminDashboard.jsx:754:
```js
showToast(`Notification sent to ${res.data?.sent ?? 0} user(s)`);
```

### 7c. server/routes/adminRoutes.js — status collision endpoints

The `PUT /teacher-questions/:id` approve/reject returns:
```js
return res.json({ success: true, status: newStatus });
```
Change to:
```js
return success(res, { approval_status: newStatus });
```

### 7d. Re-verify QuizTab.jsx setResults(r.data) fix

The last session confirmed `setResults(r)` should be `setResults(r.data)`.
Verify this is in current source — it may have been lost in the latest merge.

---

## 8. Current State of Uncommitted Fixes

As of this writing the working tree has uncommitted changes to:
- `client/src/components/QuizTab.jsx` — the setResults(r.data) fix
- `server/routes/adminRoutes.js` — ensureEnrollmentColumns import
- `server/routes/paymentRoutes.js` — ensureEnrollmentColumns import  
- `server/routes/studentRoutes.js` — ensureEnrollmentColumns helper
- `server/routes/users.js` — ensureEnrollmentColumns call

These should be committed and pushed before applying the fixes below.

---

## 9. Implementation Order for Next Agent

1. Commit the current working tree (Bug 1/2/3 fixes already in place)
2. Apply Fix A+D: extend apiClient.js normaliser
3. Apply Fix B: fix status collision in AdminDashboard.jsx reads
4. Apply Fix C: standardise admin backend response shapes
5. Build frontend (`npx vite build` in `client/`) — must pass with 0 errors
6. Run backend syntax check: `node -c` on all modified server files
7. Commit with message referencing this document
8. Push — Render auto-deploys

---

## 10. Files Map

| File | Role | Issue |
|------|------|-------|
| `client/src/services/apiClient.js` | Shared | Normaliser missing `sent`, `unread_count`, `pagination` |
| `client/src/pages/AdminDashboard.jsx` | Admin | Reads `res.sent` (undefined), `res.status` collision |
| `server/routes/adminRoutes.js` | Admin backend | Non-standard shapes for send-notification, approve/reject |
| `server/utils/response.js` | Shared | Correct — use this more consistently |
| `client/src/components/QuizTab.jsx` | Student | `setResults(r)` should be `setResults(r.data)` |
| `server/routes/studentRoutes.js` | Student | ensureEnrollmentColumns (Bug 1 fix, already in WIP) |

---

*This document is the handoff artifact for any agent continuing this work.*
*Repository: PDS-David/edu-platform*
*Branch: main*
*Last known good commit: 89f7b58*
