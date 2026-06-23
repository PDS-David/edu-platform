# AISchoolOnair — Complete Gap List

Audit conducted June 2026. All gaps are noted as found — no fixes applied in this document.

---

## ADMIN

### A1 — User list pagination always shows 0 users
The admin Users panel reads `r.total` to display "X users" and calculate page count. The paginated API response puts the count inside `r.meta.total`, not at the top level. Result: always shows "0 users", pagination breaks, only the first page is ever accessible regardless of how many users exist.

### A2 — Schools panel is a placeholder
Clicking "Schools" in the admin sidebar shows "School management coming soon." No functionality exists behind it. The menu item is a dead end.

### A3 — Audit log has no admin UI
The audit log API (`GET /api/audit/logs`, `/audit/security`, `/audit/user/:id`) was built as part of security hardening but there is no panel in the admin dashboard to view it. Admins have no way to see who did what, when.

### A4 — No subscription/payment management panel
The analytics panel shows an "Active Subscriptions" count, but there is no panel to manage individual subscriptions — extend a trial, mark someone as paid, revoke access, or see payment history. Admin can only see a student's subscription status as a label in the user list.

### A5 — `/admin` renders a blank page; `/admin/home` is orphaned
Visiting `/admin` directly renders a blank white page — `AdminLayout` is a plain `<Outlet>` with no index route. `/admin/home` (DashboardHome) exists as a route with a full UI but is never linked from anywhere in the admin navigation.

### A6 — Notification sending has no email delivery confirmation
Admin "Send Notification" inserts rows into the notifications table and returns a sent count. If `EMAIL_HOST`/`EMAIL_USER` environment variables are not configured, emails silently do nothing. The admin UI gives no feedback about whether emails were actually delivered versus only stored in the database.

### A7 — Teacher "Nudge" button does nothing
In the teacher Analytics tab every student row has a "Nudge" button. The backend endpoint exists but only looks up the student's email and returns `"Nudge queued"` — it never sends an email or in-app notification. The button appears to succeed but no nudge is ever delivered.

---

## TEACHER

### T1 — No drill-down on individual student progress
The teacher Analytics tab shows per-student accuracy, attempts, and streak as a summary row. There is no way to click through to see which topics a student is struggling with or their quiz history. The backend endpoint (`GET /api/analytics/student/:studentId/topics`) already exists and is IDOR-protected — it is just never surfaced in the UI.

### T2 — Teachers cannot see approval status of submitted questions
`TeacherPendingQuestions` only shows questions with `status = 'pending'`. Teachers have no way to see whether their previously submitted questions were approved or rejected, or to read the rejection feedback note.

### T3 — No welcome email when admin creates a teacher account
When admin creates a teacher via "Create Teacher", no email is sent to the teacher. The account goes live immediately but the teacher has no way to know their credentials unless told manually by the admin.

### T4 — Teachers with subject assignments but no classes cannot see their students
The teacher student list is scoped entirely to class membership via `class_memberships`. A teacher assigned to a subject directly (via `teacher_subjects`) without a formal class structure has no way to see who is enrolled in that subject.

---

## STUDENT

### S1 — No way to add a new exam type after onboarding
The Exam Types page shows subjects within exam boards the student already belongs to, but there is no flow to enrol in a new exam board. A student registered for WAEC who later wants to add JAMB is blocked — they are locked to whatever was set during onboarding or payment.

### S2 — Notification preferences lost on new device
In Settings → Notifications, all toggle preferences are saved to `localStorage` keyed by user ID. Logging in on a different device or clearing the browser resets all preferences to defaults. No API call is made — nothing is persisted to the database.

### S3 — No profile photo upload
The app shows a letter avatar for all users. There is no way to upload a profile photo anywhere in the app for any role.

### S4 — Onboarding ignores exam-type subject limits
During onboarding a student can select up to 10 subjects regardless of their exam type. The per-exam-type limits (JAMB=4, WAEC=9, etc.) are only enforced after onboarding via `POST /api/students/subjects`. A JAMB student can select 10 subjects in step 1 and bypass the cap entirely.

### S5 — No topic/subject search within a subject page
When a student opens a subject page they see a flat list of topics with no search or filter. For subjects with many topics this becomes difficult to navigate.

### S6 — No mock exam history
After completing a mock exam the student sees a results screen, then it is gone. There is no "Mock Exam History" page — students cannot review past mock attempts, track score improvement over time, or revisit questions they got wrong.

### S7 — Tests assigned by teachers are invisible to students
`/student/test/:testId` exists and works, but there is no "My Tests" list anywhere in the student dashboard or navigation. A student can only reach an assigned test if the teacher tells them the direct URL manually.

### S8 — No centralised quiz history across all subjects
`QuizHistoryPage` exists but is only reachable from within a specific subtopic's quiz tab. Students cannot see their complete quiz history across all subjects in one place.

### S9 — SubjectCatalog has no enrol button
The public subject catalog page shows all subjects and indicates which ones a logged-in student is enrolled in, but there is no "Enrol" button. Students can browse but cannot act from the catalog — they must go elsewhere to add a subject.

### S10 — Quiz results page breaks when accessed directly via URL
`/student/quiz-results/:attemptId` can show "No results found" if opened directly by URL or refreshed. The page depends on either `location.state.inlineResult` (passed by the quiz flow) or a valid API lookup. Sharing a results URL or refreshing can silently fail.

---

## CROSS-CUTTING

### X1 — Scheduled jobs never start
`scheduledJobs.js` exports `startJobs()` but `server.js` has no reference to it anywhere. Weekly digest emails, streak nudge emails, and all cron-based work have never executed in production since launch. They are fully written but completely dead.

### X2 — Real-time client/server protocol mismatch
`client/src/services/realtimeClient.js` connects using the native browser `WebSocket` API. `server/services/realtimeEngine.js` uses `socket.io`, which requires its own client library and uses a custom handshake protocol. The two are incompatible — the WebSocket connection silently fails on every page load. Currently only used in the orphaned `/admin/home` page, so no visible breakage, but the infrastructure is broken for any future real-time feature.

### X3 — `/teacher` renders a blank page
`TeacherLayout` is a plain `<Outlet>` with no index route. Visiting `/teacher` directly renders a blank white page, identical to the `/admin` issue.

### X4 — Social media links are guessed placeholder URLs
`client/src/config/branding.js` contains `https://twitter.com/aischoolonair`, `https://facebook.com/aischoolonair`, etc. These are assumed URLs, not verified accounts. If the pages do not exist, clicking them 404s on the social platform.

### X5 — Branding stats are hardcoded and never update
The landing page shows "50,000+ Students", "2,000+ Teachers", "500+ Courses", "100+ Schools". These are static strings in `branding.js`, not pulled from the database. They will never reflect real platform growth.

### X6 — PricingPage renders null
`/pricing` is a registered route but `PricingPage` returns `null`. Any link to `/pricing` shows a completely blank white page with no explanation, no content, and no call to action.

### X7 — TeacherAssignmentPage exposes an admin action to teachers
`/teacher/assignments` (TeacherAssignmentPage) lets any teacher assign any teacher to any subject via `POST /admin/teacher-subjects`. This is an admin function. The page is accessible to all teacher-role users, meaning a teacher can self-assign or reassign colleagues without admin involvement.

### X8 — Email delivery not verified as configured in production
The email service silently disables itself if `EMAIL_HOST`/`EMAIL_USER`/`EMAIL_PASS` are not set. Password resets, email verification, weekly digests, and nudges all depend on these being configured. There is no startup warning visible to operators and no test has been run end-to-end to confirm delivery works on the live server.

### X9 — ContributeQuestion accepts blank question text
`/teacher/contribute` has no minimum length or non-empty validation on the question text field. A teacher can submit a question with only the options filled in and the question body left blank.

### X10 — Teacher can delete uploaded resources but not edit them
In TeacherResourcesPage, teachers can delete a resource but there is no rename or re-assign flow. A file uploaded with the wrong title or linked to the wrong subject requires a full delete-and-reupload.

### X11 — Teacher may fall back to all-students list (IDOR risk)
In TeacherResourcesPage, if the `/teacher/students` call fails or returns empty (teacher has no classes), a commented fallback path calls `/users?role=student&limit=200`, returning the full platform student roster. This re-opens the IDOR vulnerability that was previously fixed at the API level.

### X12 — Badges are awarded but never displayed to students
`xpMiddleware.js` inserts rows into `user_badges` when milestones are reached. There is no page, widget, or notification in the student UI that shows earned badges. Students earn badges silently and have no way to see them.

### X13 — Daily goal tracks total attempts without activity breakdown
The student dashboard progress bar counts all question attempts (practice + quiz combined). There is no breakdown by activity type. The goal has no way to distinguish a focused study session from random clicking.

### X14 — Past paper downloads are unauthenticated
`/past-papers` is a public page and all download links are direct file URLs with no auth token. Anyone can download all past papers without an account. Whether this is intentional policy or a gap requires a product decision.

### X15 — Admin bulk upload has no overall batch progress indicator
The bulk upload panel shows individual file XHR progress but no overall batch completion percentage when uploading many files simultaneously.

### X16 — AI Generate panel cannot generate questions for topics without subtopics
In the admin AI Generate panel, if a topic has no subtopics the questions can be generated but have nowhere to attach — they will not appear in student quizzes. The UI does not warn the admin or prompt them to create a subtopic first.

### X17 — No global search for students
There is no search bar anywhere in the student-facing app that lets a student find a topic, subtopic, or subject by name across the whole platform. Discovery is entirely hierarchical (exam type → subject → topic → subtopic).
