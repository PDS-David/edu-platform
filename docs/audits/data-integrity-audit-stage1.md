# Data Integrity Audit — Stage 1 Findings

Repo: PDS-David/edu-platform, audited at commit `40c7d40` (main).
Method: systematically searched every file in `server/routes/*.js` for the
specific anti-pattern already found and fixed in `quizzes.js`/`pastPaperRoutes.js`
(catch blocks that silently return `success: true` on a genuine query error),
then manually verified each hit against the actual schema
(`server/scripts/run_complete_migration.js`) to separate real bugs from
legitimate defensive code. Also manually checked the highest-stakes
multi-step write path (quiz submission) for transaction safety.

**This is an audit only. Nothing below has been fixed. No code was changed
in this pass.**

---

## HIGH SEVERITY

### H1 — Quiz attempt submission loop has no transaction
**File:** `server/routes/quizzes.js`, `POST /attempt`, the `for (const answer of answers)` loop (~line 156-245)

Each answer in a submission is inserted as its own `practice_attempts` row via
a separate `await sequelize.query(INSERT...)` call, with no
`sequelize.transaction()` wrapping the loop. If any single iteration fails
partway through a submission (DB blip, connection drop, anything) — say,
question 25 of 40 in a mock exam — every row inserted before that point
(1-24) stays permanently committed, and the remaining rows (26-40) are never
inserted. The result is a partial, orphaned `session_id` with an incomplete
set of attempts, indistinguishable in the database from a real (but
low-question-count) attempt. If the student retries, they get a second,
separate `session_id` — the broken one from the failed attempt is never
cleaned up and could skew any aggregate that doesn't specifically filter for
"complete" sessions.

Directly relevant given this codebase's own history: two related bugs in
this exact loop were already found and fixed (grading against the wrong
field, and a NOT NULL violation on `created_at`/`updated_at` that silently
failed every single insert for a period) — both evidence that this insert
path is fragile and has already produced real data loss once. This is the
one remaining structural gap in it.

**Suggested fix:** wrap the loop (and the subsequent `results.push` /
scoring accumulation, which should stay in sync with what's actually
committed) in `const t = await sequelize.transaction(); ... await t.commit()`
with rollback on any thrown error, following the exact pattern already used
correctly in `schoolRoutes.js`'s `POST /register`.

---

## MEDIUM SEVERITY

All of the following share the same anti-pattern: a catch block that
returns `success: true` with empty/zero data on **any** error, with **no
logging**, making a genuine query failure completely indistinguishable —
to both the user and to server logs — from "there's genuinely no data yet."
Two of them (`analytics.js`/`analyticsRoutes.js` badges, `catalogRoutes.js`
teacher-subjects) have a comment claiming the underlying table "may not
exist yet" — verified against the migration script, **both tables have
existed since their `CREATE TABLE IF NOT EXISTS` was added**, so those
comments are stale and the defensive code is now pointlessly hiding real
errors.

### M1 — Student dashboard: 4 endpoints, zero logging on failure
**File:** `server/routes/dashboardRoutes.js`
- `GET /overview` (~line 51) — the primary stats a student sees on login (attempts, accuracy, streak, XP)
- `GET /weak-topics` (~line 77)
- `GET /recommendations` (~line 108)
- `GET /sessions` (~line 130)

All four: `catch (err) { return res.json({ success: true, data: [] or {} }); }`
— no `console.error`, nothing. This is the single highest-traffic surface
in the whole audit (every student, every login) with the weakest error
visibility. A real bug here (bad join, column typo) would present as "no
data yet" forever, with zero signal to anyone that something's wrong.

### M2 — Notifications: same pattern, stale "may not exist" comment
**File:** `server/routes/notificationsRoutes.js`, `GET /` (~line 19)
`notifications` table confirmed to exist in the migration script (line 403).
Comment says "Table may not exist yet — return empty list instead of 500."
It's existed the whole time; this just hides real failures.

### M3 — Analytics badges: same pattern, stale comment, AND a dead duplicate file
**Files:** `server/routes/analyticsRoutes.js` `GET /badges` (~line 474) —
this is the one actually mounted (`app.use('/api/analytics', protect,
analyticsRoutes)` in `server.js`).

`user_badges` table confirmed to exist (migration line 395).

**Separately:** `server/routes/analytics.js` contains an apparently
line-for-line duplicate of this same route (and possibly others — not
fully diffed against its sibling), but is **never required or mounted
anywhere** — confirmed via `grep -rn "require.*routes/analytics'"` across
the whole server directory, only `analyticsRoutes.js` is referenced. It's
dead code. Not a live bug, but worth flagging: a future edit could easily
land in the wrong file (this happened almost by accident during this
audit), and it's unclear whether the two files have silently diverged in
other routes beyond `/badges`.

### M4 — Teacher-subjects (catalog): same pattern, stale comment
**File:** `server/routes/catalogRoutes.js`, ~line 407
`teacher_subjects` table confirmed to exist (migration line 669). Comment
says "teacher_subjects may not exist yet."

---

## LOW SEVERITY

### L1 — Questions/subjects search: same pattern, but at least logged
**Files:**
- `server/routes/questionsRoutes.js`, `GET /random` (~line 243)
- `server/routes/subjectsRoutes.js`, `GET /search` (~line 87)

Both call `console.error()` before faking success, so a real failure is at
least visible in server logs — meaningfully better than the medium-severity
items above, since Da/an operator could catch it there. Still returns a
false-positive "success, zero results" to the actual client/student, which
for `/questions/random` specifically means a genuine failure could present
as "no questions available for this subject" rather than a clear retry-able
error.

---

## VERIFIED SAFE — not findings, listed so the next agent doesn't re-check them

- `server/routes/notesRoutes.js` (~line 35) and `server/routes/teacherRoutes.js`
  (~line 335) both fake success only after checking `err.message` for the
  *specific* known table-not-exists case, and return a real 500 for anything
  else. Correct pattern — do not touch.
- `server/routes/authRoutes.js` (~line 242, the keep-alive/token-refresh
  endpoint) fakes success deliberately and explains why in an inline comment
  (existing token expires naturally, refresh interceptor handles it next
  request) — a genuine, reasoned degradation, not a bug.
- `resourceRoutes.js`'s manual cleanup deletes on `resource_assignments`/
  `resource_user_assignments` before deleting a resource (lines ~779-780) are
  wrapped in `.catch(() => {})` with no logging, but both tables have a real
  `ON DELETE CASCADE` foreign key back to `resources` at the database level
  (confirmed in the migration script) — so even if these manual pre-deletes
  silently failed, the CASCADE constraint cleans them up correctly when the
  parent row is deleted immediately after. Redundant code, not a data-loss
  risk. Not worth spending stage 2/3 time on.
- `schoolRoutes.js`'s `POST /register` (school + admin account creation) is
  already correctly wrapped in `sequelize.transaction()`. Correct pattern.

---

## Scope note for the next stage

This pass searched specifically for the "fake success in a catch block"
anti-pattern across `server/routes/*.js`, plus one manual transaction-safety
check on the highest-stakes write path. It did **not** exhaustively check:
- Every other multi-step write for transaction safety (resource upload +
  metadata, EM session recording, payment recording, etc.)
- Missing database constraints (unique/foreign-key/not-null) beyond what
  came up incidentally
- `server/controllers/*.js` or `server/services/*.js` (only `server/routes/`
  was searched)
- Frontend-side data handling

Stage 2/3 should decide whether to extend the same search methodology to
those areas, or focus purely on fixing what's already found here — see the
handover prompts below.
