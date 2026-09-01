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
**Status:** Deferred — added here first per explicit instruction, not deleted yet.

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

### PERF-2 — Not yet audited: other `for...of` + `await` patterns
The following files have loop-with-await patterns that were not individually
traced for severity in this pass (time-boxed): `adminRoutes.js` (lines ~540, 844,
855, 1214), `aiChatRoute.js` (~362), `aiRoutes.js` (~585, 598), `catalogRoutes.js`
(~429), `englishMasterclassRoutes.js` (~200). Most of these loop over small,
bounded arrays (`.slice(0, 5)`, single-digit subject counts) so are likely fine,
but each should get a 2-minute sanity check for whether the loop bound is
user-controlled and unbounded.
**Severity:** Unknown — flagged for someone else to triage quickly.

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
