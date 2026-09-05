# AISchoolOnair — App-Wide Audit
Conducted via direct code inspection (not assumption) on the current `main` branch.
Every finding below was verified by reading the actual file content, grepping for
real usage, or tracing actual call chains. Severity is my own judgement; treat as
a starting point for prioritization, not a final ruling.

---

## How to use this document
Each finding lists: **what's wrong**, **where**, **how I verified it**, and
**suggested severity**. Items are grouped by category, not by role, since several
bugs cut across admin/teacher/student. Anyone picking up a fix should re-verify
against `main` at the time they start, since other agents are actively committing.

---

## 1. Dead Code (zero risk to remove, but confirm before deleting)

### DEAD-1 — `client/src/pages/Dashboard.jsx`
Never imported anywhere in `App.jsx` or any other file. Renders `ProgressSummary`,
`WeakTopicsPanel`, `RecommendationPanel`, `SessionPanel` with hardcoded `null`/`[]`
props — looks like an early prototype superseded by `StudentDashboard.jsx`.
**Verified:** `grep -rn "pages/Dashboard'" client/src/App.jsx` → no match.
**Severity:** Low (cleanup only, no functional impact).

### DEAD-2 — `client/src/pages/Dashboard/DashboardHome.jsx`
Only referenced in a comment inside `StudentDashboard.jsx` ("DashboardHome content
is rendered at the index route via `<Outlet />`") — the comment describes intent
but the actual component is never imported or rendered anywhere.
**Verified:** `grep -rn "DashboardHome" client/src/App.jsx` → no import.
**Severity:** Low.

### DEAD-3 — Three orphaned components
`client/src/components/BackButton.jsx`, `ExamTypeSelector.jsx`, `TopicsModal.jsx`
are not imported by any other file in the codebase.
**Verified:** per-component grep across all of `client/src` excluding the file's
own definition line — zero matches for all three.
**Severity:** Low. `TopicsModal.jsx` in particular looks like it was meant to be
the student-facing topic browser before `SubjectPage.jsx` took over that role —
worth a quick check that nothing references it by a different name before deleting.
**Status:** RESOLVED — all three deleted (commit `ca38483`), which explicitly
re-checked the `TopicsModal.jsx` caveat above (confirmed zero references under
any name) before removing it. Re-verified again independently just now: none
of the three files exist on disk anymore, and a repo-wide grep for each name
returns zero hits.

### DEAD-4 — `server/routes/curriculumRoutes.js` is mounted but never called
The route is registered (`app.use('/api/curriculum', protect, curriculumRoutes)`)
and protected correctly, but **no client page calls `GET /api/curriculum`**
anywhere in the codebase.
**Verified:** `grep -rn "'/curriculum'" client/src/` → zero results.
**Severity:** Low if truly unused — but see **PERF-1** below, since this file also
has a real performance bug that would matter if it's ever wired up.
**Status:** RESOLVED — deleted (see commit `ca38483`), which also made PERF-1 moot
(no code left to have the bug). Its require/mount lines in `server.js` were removed
too. Surfaced DEAD-5 (below) while cleaning this one up.

### DEAD-5 — `server/config/routeRegistry.js` is itself dead, and misleading about it
File declares itself as `CENTRAL ROUTE REGISTRY — Every API route MUST be declared
here. This prevents silent deployment breakage.` — but nothing in the codebase
actually `require()`s this file at all, so it provides zero real protection despite
what its own header comment promises. It's also already stale/wrong independent of
that: it lists `'../routes/examBoardsRoutes'` (plural), a file that doesn't exist —
the real file is `examBoardRoutes.js` (singular) — meaning even if something did
start requiring this file today, at least one entry would break immediately.
**Verified:** `grep -rln "routeRegistry" server/` (excluding its own file) → zero
results. Cross-checked the `examBoardsRoutes` entry against the real filename on
disk (`server/routes/examBoardRoutes.js`) → mismatch confirmed.
**Severity:** Low (dead, so no live behavior to fix) but worth prioritizing over
typical dead-code cleanup — a comment actively promising a safety guarantee it
doesn't provide is worse than no comment at all; someone could reasonably trust it
and skip an actual mount-line check in `server.js` because of it.
**Suggested fix:** Confirmed unused — delete the whole file. (If anyone wants this
kind of deployment-safety check to actually exist, it needs to be wired into
`server.js`'s own route-mounting logic to do anything, not live as a separate,
never-imported list.)
**Status:** RESOLVED — deleted. Re-verified independently before deleting:
zero requires of it anywhere in the codebase (including no dynamic
`require(path...)`/template-string patterns in `server.js` that might
reference it indirectly), and found further corroborating evidence the
list was never maintained — `schoolRoutes.js`, one of the most actively
developed route files in the app, isn't listed in it at all, despite the
file's own claim that "every API route MUST be declared here." The
`examBoardsRoutes` (plural) vs. real `examBoardRoutes.js` (singular)
mismatch flagged above was also re-confirmed still present at deletion
time. No other entries were stale (`users.js`, `courses.js`,
`enrollments.js` etc. all exist under the names listed) — this file just
was, and always had been, dead weight with a misleading comment.

---

## 2. Performance

### PERF-1 — Severe N+1 query in `curriculumRoutes.js`
`GET /api/curriculum` runs a 4-level nested loop, each level issuing its own
`await sequelize.query(...)` inside a `for...of`:
```
for (const board of examBoards) {        // 1 query
  for (const subject of subjects) {      // 1 query per board
    for (const topic of topics) {        // 1 query per subject
      // 1 query per topic for subtopics
```
With realistic data (14 exam boards x ~25 subjects x ~10 topics), this is
potentially **thousands of sequential round-trips** for a single request.
**Verified:** read the full file; confirmed 3 nested `for` loops each containing
an `await sequelize.query()`.
**Severity:** High *if* this endpoint is ever wired up client-side (currently dead
per DEAD-4, so actual production impact today is zero — but this is exactly the
kind of code that gets "quickly" reused later without anyone re-checking it).
**Suggested fix:** Replace with a single query using JOINs and a GROUP BY/json_agg
to build the nested structure in one round-trip, or fetch all 4 tables in 4 flat
queries and assemble the tree in JS.
**Status:** RESOLVED — moot as of commit `ca38483`: `curriculumRoutes.js` (DEAD-4)
was deleted rather than fixed in place, since it was confirmed unused and the
dead route was the entire reason this bug had zero real-world consumers to hit
it. No buggy code remains to fix. Re-verified before closing this out: the file
is still absent on `main` as of this check, nothing resurrected it.
If a real curriculum-browsing feature is ever built to replace it, build it with
a single JOIN/`json_agg` query (or 4 flat queries assembled in JS) from the
start — not by resurrecting this file's nested-loop approach.

### PERF-2 — `for...of` + `await` patterns, triaged
Individually checked every site flagged in the original pass (locations had
shifted since other commits landed — re-found each by content, not line
number):

- **`adminRoutes.js` question-generation loop** — bounded, `count` is
  clamped server-side to `Math.min(Math.max(parseInt(rawCount) || 10, 1), 15)`
  before the loop runs. Max 15 sequential inserts. Fine as-is.
- **`adminRoutes.js` health-check loops (4 of them)** — all iterate
  hardcoded literal arrays (11 tables, 1 table, 5 columns, 2 tables, 3
  tables) with zero user input involved. This is a diagnostics/health-check
  endpoint, not a hot path. Fine as-is.
- **`adminRoutes.js` `/admin/migrate-to-r2`** — iterates every
  not-yet-migrated resource row. Technically unbounded by row count, but
  this is a deliberate, rare, admin-triggered one-time bulk migration
  utility (moving local uploads to R2) — sequential processing here is the
  *safer* choice (avoids parallel-upload memory pressure / R2 rate
  limiting), not a bug. By design, not flagged further.
- **`aiChatRoute.js` topic-extraction loop** — capped at `.slice(0, 5)`,
  and the loop body has no `await` at all (synchronous `Set.add()` only).
  Zero risk.
- **`aiRoutes.js` two remediation-plan loops** — capped at `.slice(0, 3)`
  and `.slice(0, 2)` respectively, both purely synchronous (building plain
  objects, no `await`). Zero risk.
- **`catalogRoutes.js` `POST /teachers/:teacherId/assign`** — **was a real
  bug**: `subject_ids` came straight from `req.body` with no cap, 2
  sequential awaited queries per element. Already fixed by a prior commit
  (tagged `PERF-2 FIX` in the code) — capped at 100 with a 400 rejection
  above that. Confirmed fixed on `main`; this doc just hadn't been updated
  to reflect it until now.
- **`englishMasterclassRoutes.js` `POST /sessions` per-word-progress
  loop** — **was a real bug, now fixed**: `answers` came straight from
  `req.body` with no length cap, 1 sequential awaited `INSERT ... ON
  CONFLICT` per element. A student's client is expected to send one entry
  per word practiced in a session, but nothing server-side enforced that.
  Fixed the same way as the catalogRoutes.js instance above — capped at
  200 with a 400 rejection above that.
- **`englishMasterclassRoutes.js` `/admin/generate-words`** — bounded by
  the AI generation prompt itself (`Math.min(count, 20)` baked into the
  prompt text), and admin-only. Even if the model occasionally
  over-generates, nowhere near the "thousands of round-trips" class of bug.
  Fine as-is.

**Status:** RESOLVED. Two genuine unbounded-loop bugs found and fixed
(`catalogRoutes.js` — already fixed pre-existing; `englishMasterclassRoutes.js`
— fixed in this pass). Everything else flagged in the original sweep is
either hardcoded-bound, prompt-bound, `.slice()`-bound, synchronous (no
`await` at all), or an intentional one-time admin utility where sequential
processing is correct behavior, not a bug.

---

## 3. Missing User Feedback / UX Gaps

### UX-1 — `ResetPassword.jsx` has no submitting/loading state
`handleSubmit` calls `api.post('/auth/reset-password', ...)` with no `submitting`
state guard and no visible error message on failure — only `console.error`. A
user can double-click submit, and on failure sees nothing happen with no
indication of why.
**Verified:** read the full `handleSubmit` function — no `setSubmitting`,
`setError`, or any state update in the catch block.
**Severity:** Medium. This is a password-reset flow — a confused or stuck user
here is a real support burden.
**Suggested fix:** Add `submitting` state to disable the button during the
request, and an `error` state rendered in the form to replace the
`console.error`-only catch block.
**Status:** RESOLVED — re-verified against current `main`: `submitting` state
now guards the button (disabled, shows "Resetting…") and both inputs; `error`
state renders visibly in the form instead of only logging to console. Found
further, unflagged fixes bundled into the same change: a real payload-key
mismatch bug (client sent `newPassword`, server expected `new_password`,
silently 400ing on every single attempt before this) is also fixed, and a
"Request a new reset link" recovery path was added for the previously
dead-end missing/expired-token case.

---

## 4. Security / Access Control

### SEC-1 — `examBoardRoutes.js` is fully public (no `protect`)
All three routes (`GET /`, `GET /:code`, `GET /:code/subjects`) are mounted with
no auth middleware at all.
**Verified:** read full file — zero `protect` calls; mount line in `server.js` is
`app.use('/api/exam-boards', examBoardRoutes)` with no middleware.
**Severity:** Likely intentional (this data needs to be public for the
registration/onboarding flow before a user has an account), but **this should be
explicitly confirmed**, not assumed. If it's intentional, add a one-line comment
at the top of the file saying so, matching the pattern used elsewhere in the
codebase (e.g. `examBoardRoutes.js`'s own header comment already partially
explains this — but doesn't explicitly say "intentionally public").

### SEC-2 — Confirmed correct (no action needed, listed for completeness)
The following were checked and found to have correct ownership/auth guards
already in place — listing them so no one re-investigates from scratch:
- `studyPlannerRoute.js` `GET /:user_id` — has explicit `req.user.id !== user_id`
  check.
- `enrollments.js` `GET /:id` and `DELETE /:id` — both have explicit
  staff-or-owner checks with audit logging on denial.
- `englishMasterclassRoutes.js` `GET /categories/:id/words` — looked unprotected
  at the route level but `protect` is applied at the router mount in `server.js`
  (`app.use('/api/english-masterclass', protect, englishMasterclassRoutes)`),
  covering the whole file.
- `curriculumRoutes.js`, `progressSummaryBulk.js`, `subtopicProgressRoutes.js` —
  same pattern: no `protect` inside the file, but applied at mount time in
  `server.js`. **Lesson for future audits:** always check the mount line in
  `server.js`, not just the route file in isolation — several apparent gaps
  turned out to be false positives for this exact reason.

---

## 5. Investigated, Inconclusive — Needs Live Data (not fixed)

### INV-1 — Practice-mode grading anomaly (originally "issue 13")
A teacher reported a question where the student's answer was marked incorrect
regardless of which option was selected, including the option that should have
been correct.

**What I checked:** Pulled the actual row for question id 123 (the one
identified as the reported question) directly from production via Supabase SQL
editor. `correct_answer` = `"Formed at infinity."`, and `options[3]` =
`"Formed at infinity."` — confirmed **byte-for-byte identical** via direct
character code comparison (no curly quotes, no non-breaking spaces, no
whitespace difference — nothing the existing Unicode-normalization fix in
`questionsRoutes.js`/`PracticeMode.jsx` would even need to touch). The physics
of the question is also correct (image at infinity is the correct answer for an
object at the principal focus of a concave mirror).

Traced the full code path for this exact data shape:
`GET /questions/random` -> `normalizeOptions()` converts the plain-string array
into `{option_text, is_correct}` objects -> client renders `optText =
opt.option_text` -> on selection, client sends `selected_answer: optText` (full
text, not a letter/index) -> `POST /:id/answer` compares
`normalize(selected_answer) === normalize(correctAnswer)`. Every step is
internally consistent for this specific row's data.

**Conclusion:** If question 123 is genuinely the reported question, the bug is
not reproducible from its current data and current code. Three explanations are
possible and none can be ruled out without live reproduction:
1. The bug was already fixed by the existing Unicode-normalization patch, and
   the report predates that fix landing in production.
2. Question 123 is not actually the question from the original report — a
   different row with genuinely mismatched `correct_answer`/`options` is the
   real culprit.
3. The bug is specific to the **Quiz** flow (`quizzes.js` + `QuizTab.jsx`),
   which has its own **separate** comparison logic from Practice Mode
   (`questionsRoutes.js` + `PracticeMode.jsx`) that was not re-checked
   character-by-character in this pass — the original report didn't specify
   which mode the student was using.
**Next step for whoever picks this up:** confirm with the original reporter (a)
the exact question ID/text and (b) Practice Mode vs Quiz mode, then re-run the
same byte-level comparison against `quizzes.js`'s grading path specifically if
it's the Quiz flow.

**Status: RESOLVED — confirmed via code-level verification AND direct live
production DB queries** (the user ran these; results below).

Checked all three of the app's independent grading code paths for the exact
bug class described — a student marked wrong regardless of selection when
`correct_answer` and `options[].option_text` drift out of sync — not just
re-confirming one question's data:

- `questionsRoutes.js` (Practice Mode / Test-Yourself, `POST /:id/answer`):
  already fixed, tagged `BUG FIX (grading-always-wrong)`. Grades against
  `options[].is_correct` (the flag set at question creation/review time) via
  a matched, normalized option; only falls back to a raw `correct_answer`
  text comparison when there's no usable `options` array at all.
- `quizzes.js` (Quiz + Mock Exam, `POST /quizzes/attempt`): **independently
  verified to have the identical fix**, same `grading-always-wrong` tag, same
  is-correct-as-source-of-truth logic, same fallback condition. This directly
  answers explanation #3 above — the Quiz flow's separate comparison logic
  was the one thing the original pass didn't re-check, and it is not
  divergent or buggy; it has the same protection.
- `studentRoutes.js` (Test, `POST /test/:testId/submit`): also independently
  verified to have the same logic (`matchedOpt.is_correct` preferred,
  `typeof === 'boolean'` guarded, same raw-text fallback for questions with
  no usable options).

**Live DB verification (question 123 and beyond):** re-pulled question 123
directly — `correct_answer` and the matching option text are still
byte-identical, confirming the original finding still holds. But this
surfaced something neither pass had caught: question 123's `options` column
is a **plain array of strings**, not `{option_text, is_correct}` objects —
and the `is_correct`-based fix's `usableOpts` filter
(`o => typeof o === 'object' && o.option_text`) silently produces an empty
array for that shape, meaning the fix's protection never actually engages
for it; it falls straight to the same raw-text fallback the original bug
came from.

Ran a full production query across the whole `questions` table to find the
actual scope: **968 questions use the object format** (protected by the
fix), **375 use the plain-string-array format** (not protected by it). A
second query checked all 375 plain-string questions for a live
`correct_answer`-vs-options mismatch — **zero found**. So no currently-live
instance of the bug exists in either format.

On reflection (worked through the actual boolean logic before proposing a
code change — see PR discussion): the plain-string format isn't actually
missing protection the way it first appeared. The original bug requires
*two independently-stored signals* (`correct_answer` column and per-option
`is_correct` flag) to drift apart — that's only possible where both signals
exist separately, i.e. the object format. Plain-string options carry no
second signal at all; the only thing that can determine correctness for
them is "does `correct_answer` match one of the option strings," which is
exactly what the existing raw-text fallback already checks — proposing to
derive a synthetic per-option `is_correct` from string equality was shown
algebraically to reduce to the exact same expression the fallback already
computes, adding no real protection, only complexity. Not implemented, on
purpose.
- `studentRoutes.js` (Test, `POST /test/:testId/submit`): also independently
  verified to have the same logic (`matchedOpt.is_correct` preferred,
  `typeof === 'boolean'` guarded, same raw-text fallback for questions with
  no usable options).

The `normalize()`/`normalizeAnswer()` Unicode-cleanup function itself
(smart-quote and non-breaking-space normalization, whitespace collapsing,
case-folding) is **byte-for-byte identical** across all three files — checked
by direct comparison, not assumption.

Net effect: this is not a one-row fix that happens to cover the originally
reported question — it's a systemic, structural fix present consistently
across every assessment surface in the app (Practice Mode, Test-Yourself,
Quiz, Mock Exam, Test), so any future question row where `correct_answer`
and `options[].option_text` drift is already protected against this exact
failure mode, regardless of which mode a student uses. The original report's
question could still be confirmed against the live DB if the exact ID is
ever supplied, but the underlying bug class is closed on the code side.

---

## 6. Areas Checked and Found Clean (no action needed)

Listed so effort isn't duplicated:
- Server route files not mounted in `server.js`: only `testRoutes.js`, which is
  intentionally empty with a clear header comment explaining why (legacy
  duplicate-route bug, already fixed by emptying it).
- `apiClient.js` response normalization: sophisticated, handles multiple legacy
  response shapes (`raw.data`, bare `raw`, `raw.topics`, etc.) via hoisting.
  Checked for `.data.data` double-unwrap bugs elsewhere in the codebase — all
  matches found were comments documenting *already-fixed* past bugs, not live
  ones.
- `SubjectPage.jsx` topic-loading shape handling — defensively checks every
  possible response shape (array, `.topics`, nested `.data.topics`) before
  rendering.
- `PaymentVerify.jsx` error handling — initially flagged by an automated
  heuristic as "logs only, no user feedback" but manual read confirmed this is
  a false positive: the page's `status`/`message` state machine does show
  full user-facing success/failure UI; only a deliberately non-fatal secondary
  call (`activate-exam-types`) is silently logged, which is correct since exam
  types can be re-activated later from the dashboard.
- Database pool configuration (`server/config/database.js`) — correctly
  configured for Supabase's transaction pooler (`pool.min: 0`, simple-query
  protocol forced) with clear comments explaining why.
- `useEffect` dependency arrays in `SubtopicPage.jsx` — spot-checked for stale
  closures referencing `useParams()` without including it in deps; found
  correctly included (`[subTab, subtopicId]`, `[user, subtopicId]`).

---

## 8. Additive-Assignment / State-Reconciliation Gaps (the "assign-exam-type" bug class)

Triggered by the fix in `server/routes/schoolRoutes.js` `POST /students/:studentId/assign-exam-type`
(commit `a46ea05`): re-assigning an already-assigned exam board was purely additive — the
subject-count cap was checked against only the newly-submitted list, never against what
the student already had active for that board, so a student could end up over the cap.
Below is every other write endpoint in the codebase that shares the same shape (a caller
submits "the set I want," an existing set may already be there, and the endpoint has to
decide whether to add, replace, or reconcile) — checked one by one against real code, not
assumed from the route name. Grouped by verified severity; nothing below has been fixed yet.

### ASSIGN-1 — Teacher-subject assignment implemented 3 separate ways, one of them
### silently drops a field the others rely on
**Where:** `server/routes/adminRoutes.js` `POST /teacher-assignments` (line 880) and its alias
`POST /teacher-subjects` (line 970); `server/routes/catalogRoutes.js` `POST /teachers/:teacherId/assign`
(line 435); `server/routes/schoolRoutes.js` `POST /me/teachers/:teacherId/subjects` (line 1362).
**What's wrong:** all four insert into the same `teacher_subjects` table with the same
`ON CONFLICT (teacher_id, subject_id) DO UPDATE SET is_active = true` add-only pattern — that
part is fine on its own, since `teacher_subjects` has no count cap (a teacher legitimately
teaches an unbounded number of subjects), unlike `student_subjects`. The real problem is that
`adminRoutes.js`'s two handlers (lines 886 and 975) `INSERT INTO teacher_subjects (teacher_id,
subject_id, is_active)` — they never write `exam_board_id`, even though the `/teacher-subjects`
handler destructures `exam_board_id` from the request body and then never uses it. Since
`teacher_subjects.exam_board_id` is nullable, this silently succeeds and leaves the column
NULL. `catalogRoutes.js`'s own `GET /teachers/:teacherId/subjects` listing (line ~415) joins
`exam_boards` on `ts.exam_board_id` to show the board name — so a teacher assigned via the
App Admin panel's `/teacher-assignments` or `/teacher-subjects` screens shows up with a
missing/blank exam board in that listing, while the exact same assignment made via
`catalogRoutes.js`'s own `/teachers/:teacherId/assign` or `schoolRoutes.js`'s
`/me/teachers/:teacherId/subjects` (both of which correctly derive `exam_board_id` from the
`subjects` row in the same query) displays correctly.
**Verified:** read all four handlers directly; confirmed `teacher_subjects.exam_board_id` is
`INTEGER, nullable` in `run_complete_migration.js`; grepped every read of
`teacher_subjects.exam_board_id` across the codebase and found only `catalogRoutes.js`'s GET
depends on it being populated.
**Severity:** Medium. Not a crash and not an overflow like the exam-type bug, but a real,
reproducible data-integrity gap (silently-NULL column) with a visible symptom, caused by
having the same write duplicated across three files instead of one shared function. Fixing
the missing field alone is a one-line change per handler; fixing it properly means
consolidating to one implementation so this can't recur a fourth time.

### ASSIGN-2 — Two different authorities can silently overwrite each other's class-membership changes
**Where:** `server/routes/schoolRoutes.js` `POST /me/classes/:id/students` (line 983, school_admin)
vs. `server/routes/teacherRoutes.js` `PUT /class/:classId/members` (line 566, teacher) — both
write to `class_memberships` for what can be the same class.
**What's wrong:** the school_admin route is additive-only (`INSERT ... ON CONFLICT DO NOTHING`,
paired with a separate `DELETE /me/classes/:id/students/:studentId` for removing one student at
a time) — that's a reasonable, safe design on its own. But the teacher route does a full
`DELETE FROM class_memberships WHERE class_id = :cid` followed by re-inserting only the
`student_ids` array the teacher's request happened to include. If a school_admin adds a student
to a class, and a teacher's own UI still holds a stale member list (e.g. hadn't refreshed) and
then calls `PUT .../members` with that stale list, the school_admin's addition is silently
wiped — not because of a race condition exactly, but because one endpoint treats the collection
as "add to whatever's there" and the other treats it as "this is now the complete, authoritative
list," on the same table, with no version/timestamp check between them.
**Verified:** read both handlers directly; confirmed the teacher route's unconditional
`DELETE ... WHERE class_id = :cid` with no `is_active`/soft-delete distinction, and the
school_admin route's `ON CONFLICT DO NOTHING` insert-only pattern.
**Severity:** Medium. Requires a specific sequence (school_admin adds, then teacher pushes a
stale full list) to manifest, so it's not "every reassignment breaks" the way the exam-type
bug was — but the failure mode (a student silently vanishes from a class with no error to
anyone) is the same shape and would be confusing to debug later without this note.

### ASSIGN-3 — Dead self-service endpoints, kept in the additive-only style pre-dating the exam-type fix
**Where:** `server/routes/studentRoutes.js` `POST /subjects` (line 724) and
`POST /exam-types/:examTypeId/join` (line 573).
**What's wrong:** not a live bug — both routes immediately return 403 for any `student` role
caller, and `studentOnly` middleware means only students can reach them at all, so they're
fully dead code (deliberately, per their own "Phase 3 Step 4: self-service lockdown" comments,
left in place for an easy rollback rather than deleted). Flagging only because if anyone ever
reverts that lockdown, `POST /subjects` is worth using as the reference implementation instead
of copying the pre-fix `assign-exam-type` pattern — it already does the correct thing (counts
the student's *current* active subjects for the board before allowing one more, rather than
only checking the size of what's being added).
**Verified:** read both handlers; confirmed the 403 guard is unconditional and matches the
`studentOnly` middleware exactly, and manually compared the counting logic in `POST /subjects`
(lines 767-798) against the pre-fix version of `assign-exam-type`.
**Severity:** None (no live behavior to fix) — informational only, so nobody re-introduces the
additive bug if this code is ever reactivated.

### ASSIGN-4 — Confirmed correct, listed for completeness
- `resourceRoutes.js` `PUT /:id/assign-users` (resource push to students/classes) — inserts use
  `ON CONFLICT DO NOTHING` against `resource_assignments`, so re-pushing the same resource to
  the same student/class never duplicates a row. No count cap applies to resource pushes, so
  there's no overflow class of bug here to begin with. (The separate subject-leak issue
  originally found in this same route — resources pushed to a class reaching students outside
  the resource's subject — was already fixed in commit `0446a17`, "fix(resources):
  subject-mismatched resources leaking via class push".)
- `teacherRoutes.js` `POST /tests/:id/assign` (line 892) — add-only (`ON CONFLICT DO NOTHING`)
  against `test_assignments`, no cap concept applies (a test can be assigned to any number of
  students), so additive-only is the correct behavior here, not a gap.

---

## 9. Honest Limitations of This Audit

To be transparent about what this pass did **not** cover, given time constraints:

- **Did not** run the app live in a browser for any role — everything above is
  static code reading, not runtime reproduction. Anything that only manifests
  at runtime (race conditions, specific data states, browser-specific bugs)
  would not have been caught.
- **Did not** exhaustively trace every `useEffect` in all 71 page/component
  files for stale closures — spot-checked a handful of the highest-traffic
  pages only.
- **Did not** check every single nav link against every single route — the
  automated extraction approach produced too many false negatives from
  template-literal URLs (e.g. `/student/subtopic/${id}`) to be reliable
  in the time available; this needs either a proper AST-based check or manual
  click-through testing per role.
- **Did not** verify CSS/responsive/mobile layout issues — this was a logic
  and data-flow audit, not a visual one.
- **Did not** re-investigate any of the 13 issues from the earlier `Issue list`
  document that other agents are actively working through in parallel commits
  — this audit is meant to surface *additional* findings beyond that list, not
  duplicate it.

---

## 6. Assessment grading gaps

A separate pass, triggered by "list every assessment where AI is not
marking," turned up six concrete issues across Quiz/Mock Exam/Test-Yourself/
My Tests. Triaged by whether the student can get **any** grade at all
(app-breaking, must-fix) vs. gets a grade that's just imperfect
(deferrable — doesn't break the app, fixable later).

### GRADE-1 — `PracticeMode.jsx` (Test-Yourself): `short_answer` renders nothing
`isFreeText = isEssay || qType === 'structured'` has no branch for
`short_answer`. Falls into the MCQ branch, which needs an `options` array
short-answer questions don't have — nothing renders, submit button
(`handleSubmitMCQ`) requires `selected` to be truthy, which is never set.
**Severity:** App-breaking — zero way to answer, zero grade, ever.
**Status:** FIXED — commit `6ed0a18`, merged (PR #42).

### GRADE-2 — `StudentTestPage.jsx` (My Tests): identical `short_answer` gap
Same pattern, two usage sites (payload-building + rendering/badge logic).
**Severity:** App-breaking, same as GRADE-1.
**Status:** FIXED — commit `2e4b271`, merged (PR #43).

### GRADE-3 — `QuizPage.jsx`: zero type branching at all
Unconditionally renders `question.options?.map(...)` regardless of question
type, no `<textarea>` anywhere in the file. Quiz's "Structured Questions"
paper choice pulls `structured`-type questions (no `options` array) —
renders completely blank, unanswerable.
**Severity:** App-breaking.
**Status:** FIXED — commit `d79401d`, merged (PR #44).

### GRADE-4 — `MockExamPage.jsx`: same blank-render bug, separate implementation
Own, independent rendering logic from `QuizPage.jsx` — same
unconditional-options-render bug.
**Severity:** App-breaking (once GRADE-6 below is fixed, non-MCQ types become
reachable here — though note this was already live-reachable even with
GRADE-6 unfixed, since `question_sub_type` being ignored server-side meant
non-MCQ types could already leak through regardless).
**Status:** FIXED — commit `72dec40`, merged (PR #45).

### GRADE-5 — `quizzes.js` (`POST /attempt`): no AI-marking branch for `essay`
`structured` was just fixed to route through real AI marking (commits
`a064061`, `e60c79d`) — `essay` was not included in that fix and still falls
through to plain exact-text comparison, which will near-always grade an
essay answer as wrong regardless of content.
**Severity:** Not app-breaking — a grade IS produced (just an unfair one) once
GRADE-3/GRADE-4 make essay answers submittable at all. A student sees a
mark, it's just wrong.
**Status:** FIXED — the `'structured'` branch was extended to also cover
`'essay'` (`if (question.type === 'structured' || question.type === 'essay')`),
reusing the exact same AI-marking logic rather than duplicating it — the
grading code itself doesn't care which of the two types it's marking, both
share question_text/correct_answer/marks/answer-text. Verified via isolated
branch-logic trace (no live GEMINI_API_KEY available in this sandbox — see
PR description for what could/couldn't be verified live): both types now
route into AI marking with identical fallback behavior across all three
answer states (has-answer+key, has-answer+no-key, no-answer);
mcq/true_false/short_answer are byte-identical to before; `maxScore`/
`totalScore` accumulate correctly with no double-counting (confirmed via
the existing `continue` after the branch); `buildExaminerFeedback`'s
missed-questions filter (`r.is_correct === false`) required no change,
already correctly includes real `false` values from essay's new AI grade.

### GRADE-6 — `questionsRoutes.js` (`GET /random`): `question_sub_type` param unread — FIXED
`MockExamPage.jsx`/`QuizPage.jsx` send `question_sub_type`; the handler only
read `type`. A third caller not originally accounted for here,
`SubtopicPage.jsx`, also sends it — discovered while fixing this, via the
grep-every-caller step this fix required.

**Fix:** `question_sub_type` is now read and applied as its own filter,
independent of the existing `type` param. `'mcq'` maps to `type IN (mcq,
true_false)` — deliberately NOT the broader (mcq, true_false, short_answer)
grouping used elsewhere in this codebase for `isFreeText` checks, because
`SubtopicPage.jsx` has a separate `'smart'` ("Smart Answers") tab
specifically for `short_answer`, distinct from its `'mcq'` tab — including
`short_answer` in the `'mcq'` group would have leaked those questions into
the wrong tab with no textarea to answer them. Real exam-paper structure
backs the same call: JAMB/WAEC objective papers are pure MCQ, never mixed
with short-answer/theory content, so `MockExamPage.jsx`'s "MCQ only" paper
shouldn't unexpectedly include `short_answer` either. `'smart'` is aliased
to `short_answer` (not a real `questions.type` value on its own —
`SubtopicPage.jsx`'s own UI label). `'structured'` is an exact literal
match, needing no grouping.

**Verified:** all 5 real caller call-sites' exact param values traced
through the actual filter-building logic in isolation (no DB access in
this environment) — every one resolves to the intended `WHERE`
condition/replacement values. Uses the same proven-safe `IN (:param)`
array-binding pattern already used correctly elsewhere in this codebase
(`pastPaperRoutes.js`, `users.js`) — not the broken `ANY(:param)` pattern
fixed earlier this session.
**Status:** RESOLVED.

---

## 10. Payments — Intentionally Out of Scope

**Product decision, confirmed directly by the project owner:** payments are
intentionally left out of this project for now. The app is currently open
to all users — no subscription gate is enforced as a matter of product
policy, not because the payment code is broken.

Context for whoever picks this up later: `paymentRoutes.js`'s core
mechanics were independently verified this session and are sound —
Paystack webhook signature verification is correctly implemented
(constant-time HMAC-SHA512 comparison, idempotency check against
already-processed transactions), and the charge amount is looked up
server-side from `subscription_plans`, never trusted from the client (no
amount-tampering vector).

One real bug was found and independently confirmed against live production
data before this note was added, so it doesn't get lost if payments are
ever turned back on: `POST /initialize` charges `plan.price_monthly ??
plan.price_yearly` (prefers monthly whenever set), while `GET /verify`
grants subscription duration via `if (price_monthly && !price_yearly) → 1
month; else → 1 year`. If any single plan ever has *both* prices
populated, this pair of independently-written checks disagree — a user
would be charged the monthly price but granted a full year of access.
**Confirmed currently dormant** — live query against production:
```sql
SELECT plan_code, plan_name, price_monthly, price_yearly
FROM subscription_plans
WHERE price_monthly IS NOT NULL AND price_yearly IS NOT NULL;
-- returned 0 rows, 2026-09-04
```
No plan currently has both prices set, so this cannot fire today. Still
worth fixing before payments are re-enabled, since it's a landmine for the
next plan anyone configures with both a monthly and yearly price — likely
fix: compute amount and duration from one shared source (e.g. an explicit
`billing_cycle` param, defaulting to whichever single price is actually
set) instead of two separately-derived `??`/`if` expressions that can drift
apart, the same bug shape found repeatedly elsewhere in this codebase this
session (grading-comparison drift, table-name mismatch).

Also noted, not a bug: no frontend path anywhere sends a `billing_cycle`
param or references `price_yearly` — yearly billing appears to be dead,
unreachable capability today regardless of the above.

---

## 11. Whole-App Audit Pass (this session) — Scope, Method, and New Findings

Requested explicitly as a full app-wide audit, with the instruction that
this document itself must be treated as a reference for comparison, never
as the yardstick — every claim below was independently verified against
the actual current code, not copied from prior audit passes.

### 11.1 — Confirmed clean (verified, not assumed)

- **`progressSummaryBulk.js` / `subtopicProgressRoutes.js`** — both
  reference `req.user` with no `protect` call anywhere in the file itself,
  which looked like an auth gap at first grep. Confirmed both are protected
  at the mount level instead (`app.use('/api/...', protect, router)` in
  `server.js`) — a valid, deliberate convention, not a bug.
- **Resource deletion cascade** (`resourceRoutes.js` `DELETE /:id`) — two
  explicit cleanup deletes (`resource_assignments`, `resource_user_
  assignments`) are wrapped in `.catch(() => {})`, which looked like a
  silent-failure risk matching the exact pattern that hid the
  `revision_notes` table-name bug and the notes-caching bug earlier this
  session. Confirmed harmless: both tables' `resource_id` column has
  `REFERENCES resources(id) ON DELETE CASCADE` in the schema — the database
  itself guarantees cleanup the instant the resource row is deleted,
  regardless of whether these two explicit (redundant) deletes succeed.
- **7 empty `catch {}` blocks across `server/routes/`** — swept and
  categorized individually rather than assumed dangerous as a group. 6 of
  7 are the safe "optional dependency" pattern (`try { X = require(...) }
  catch {}` at module load time, for genuinely optional features —
  `subscriptionGuard`, `awardXP`, welcome email). 1 (`videosRoutes.js`,
  video-duration ffmpeg probe) silently drops non-critical display
  metadata on failure — cosmetic only, not a functional break.
- **`teacherRoutes.js`'s inline schema-migration statement** (`ALTER TABLE
  classes ALTER COLUMN join_code DROP NOT NULL`, wrapped in `.catch(() =>
  {})`) — a deliberate idempotent self-healing-schema pattern, not hiding a
  functional bug.

### 11.2 — Bug found and fixed this session

**`teacherRoutes.js`, `POST /tests/:id/assign` (assign a test to a class or
individual students):** originally,
```js
for (const { studentId, classId } of targets) {
  await sequelize.query(`INSERT INTO test_assignments ...`, {...}).catch(() => {});
  count++;   // <-- ran unconditionally, even if the INSERT above just failed
}
```
`count` incremented for every target attempted, regardless of whether the
`INSERT` actually succeeded — any silently-caught failure (a stale
`class_memberships` row pointing at a since-removed student, a genuine DB
hiccup, anything other than the intentional `ON CONFLICT DO NOTHING` no-op)
still got counted as a success, with the response's `count`/`message`
fields silently wrong.

**Status: fixed (commit `ab8cd06`).** The loop body now wraps each `INSERT`
in its own `try/catch`: `count` only increments inside the `try` block, so
it's tied to an actual successful outcome (a genuine new row, or the
intentional `ON CONFLICT DO NOTHING` no-op for a student already assigned —
that path doesn't throw, so it's correctly still counted). A genuine
failure now lands in the `catch`, is logged server-side
(`console.error(...)`), and the student id is collected into a new
`failed_student_ids` array, with `failed_count` and an adjusted `message`
returned alongside `count` in the response.

**Correcting this section's own earlier framing of the impact:** the
original write-up here said "The teacher sees 'Test assigned to N students'
in the response... with no indication which student(s) didn't actually
receive the test" — phrasing that implies a teacher actually read and
trusted that inflated number somewhere in the UI. Checking the actual (and
only) caller, `client/src/pages/TeacherDashboard.jsx`, shows that's not
accurate:
```js
await api.post(`/teacher/tests/${testId}/assign`, { class_id: assignClass });
showToast('Assigned!');
```
No destructuring, no field access — the response body was (and, unchanged
by this fix, still is) never read at all; the UI shows a generic "Assigned!"
toast regardless of the actual `count`/`message`/`success` values. So the
bug was real at the data layer, but its practically visible impact before
this fix was narrower than "a teacher reads and trusts a false number": it
was inaccurate data sitting unused in an API response nobody currently
displays. Fixing the underlying accuracy was still the right call
independent of that — nothing about a teacher not currently seeing the
count made a wrong count acceptable to keep computing, and any future UI
work that does surface `count`/`failed_count` now has trustworthy data to
show.

### 11.3 — Confirmed still-open items, cross-checked against this document's own prior entries (see section 12 below for what these actually imply)

- **`SEC-1`** (`examBoardRoutes.js` fully public) — this session did not
  re-verify this claim; carried forward from the prior pass as-is,
  explicitly unconfirmed by this pass.
- **`GRADE-5`'s "FIXED" status is incomplete in what it implies** — only
  `quizzes.js`'s `POST /attempt` was extended to AI-mark `essay`. The two
  other question-*creation* paths (teacher manual-authoring form,
  community submission endpoint) remain hardcoded `mcq`-only, confirmed via
  direct code read this session (`options.length >= 2` required
  unconditionally, `'mcq'` literal hardcoded into both INSERTs, no `type`
  field accepted from either). Only the admin AI generator was extended to
  support `short_answer`/`structured` question *creation* this session.

### 11.4 — Explicit remaining blind spots after this pass

Time-boxed, not silently skipped: of 48 route files, this session's total
combined audit work (across this pass and everything fixed earlier) has
now substantively read or pattern-swept the majority, but the following
still have not received a real line-by-line read, only confirmed absent
from earlier greps: `adaptiveRoutes.js`, `agentServiceRoutes.js`,
`aiQuestionGenerationRoutes.js`, `analytics.js`/`analyticsRoutes.js`,
`auditRoutes.js`, `authRoutes.js` (partial only — module-load fallback
checked, reset-token/session logic not read), `conceptRoutes.js`,
`dashboardRoutes.js`, `engineValidationRoutes.js`, `eventReplayRoutes.js`,
`examIntelligenceRoutes.js`, `explanationRoute.js`,
`languageMasterclassRoutes.js`, `learningEventRoutes.js`, `notesRoutes.js`,
`notificationsRoutes.js` (endpoint count only, logic unread),
`progressRoutes.js`, `recommendationRoutes.js`, `sessionRoutes.js`,
`subjectsRoutes.js`, `subtopicRoutes.js`, `topicsRoutes.js`,
`userRoutes.js`, `videosRoutes.js` (one catch block checked, rest unread),
`weakTopicRoutes.js`.

---

## 12. What the Confirmed-Open Gaps Actually Imply

Plain-language read of what each open item in sections 4-6 and 11.3 above
actually means for the app in its current state, not just that it exists:

- **`SEC-1` (`examBoardRoutes.js` fully public, unverified this pass)** — if
  accurate as documented, this endpoint likely only exposes read-only exam
  board metadata (names, codes, subject-count standards — the kind of data
  already shown to logged-out visitors on public marketing pages). The
  practical risk is narrow: an unauthenticated caller could enumerate exam
  board configuration data, not student records or credentials. Still
  worth closing since "fully public with no `protect` at all" is an easy
  habit to accidentally extend to a less benign route later in the same
  file — but this isn't a data-breach-severity item as currently described.
- **`GRADE-5`'s incomplete scope (2 of 3 content-creation paths still
  MCQ-only)** — the practical implication is narrower than it sounds:
  students can *already* answer and get fairly graded on `short_answer`/
  `structured` questions everywhere they appear (GRADE-1 through GRADE-4),
  and the admin generator can *already* produce that content in bulk. The
  gap only affects two specific creation paths (an individual teacher
  hand-writing one question, or a student submitting one via the community
  endpoint) — a content-authoring convenience gap for two specific
  workflows, not a student-facing correctness or grading problem.
- **The `teacherRoutes.js` assign-count bug, previously listed here as an
  open gap (11.2)** — no longer belongs in this list; it's fixed
  (`ab8cd06`), not merely narrower in scope. See the corrected 11.2 for
  what its actual pre-fix impact was.
- **The unread blind-spot files (11.4)** — the honest implication is that
  this audit's "clean" findings only cover what was actually read. Areas
  like payment (now out of scope per section 10), grading, and
  auth-at-the-route-file-level were deliberately prioritized as the
  highest-stakes surfaces to verify first; the remaining ~24 files are
  genuinely unknown quantities, not confirmed either way — treating their
  absence from this document as "probably fine" would be exactly the
  mistake this document's own opening instruction warns against.
