# AISchoolOnair — Agent Fix Prompts

Each entry below is a self-contained prompt an agent can use to fix the corresponding issue from ISSUES.md.
Reference codes (A1, T1, S1, X1 …) match the ISSUES.md numbering.

---

## ADMIN

---

### A1 — User list pagination always shows 0 users

**File:** `client/src/pages/AdminDashboard.jsx`

Find the `fetchUsers` function. It contains a line:
```js
setTotal(r.total || 0);
```
Change it to:
```js
setTotal(r.meta?.total || 0);
```
The server's `paginated()` helper returns `{ success, data, meta: { total, page, limit } }`. The `apiClient` normalisation exposes this as `r.meta.total`, not `r.total`. Also check whether `totalPages` is calculated from `r.total` anywhere nearby and apply the same fix.

---

### A2 — Schools panel is a placeholder

**File:** `client/src/pages/AdminDashboard.jsx`

1. Find the sidebar nav items array and remove the object with `key: 'schools'`.
2. Find the panel render block `{activePanel === 'schools' && ...}` and remove it along with all JSX inside it.

No backend changes needed.

---

### A3 — Audit log has no admin UI

**Files:** `client/src/pages/AdminDashboard.jsx`

1. Add `'auditlog'` to the sidebar nav items array with a `Shield` icon and label `'Audit Log'`.
2. Create an `AuditLogPanel` component inside the file. On mount it calls `GET /api/audit/logs` (supports `?action=&severity=&page=`). Display results in a table: timestamp, actor email, actor role, action, target email, severity (colour-coded: info=grey, warning=amber, critical=red), IP address.
3. Add a second tab inside the panel labelled "Security Events" that calls `GET /api/audit/security?hours=24`. Same table layout.
4. Add `{activePanel === 'auditlog' && <Panel><AuditLogPanel /></Panel>}` to the panel render block.
5. Use `r.meta?.total` for pagination (same pattern as the A1 fix).

---

### A4 — No subscription/payment management panel

**Files:** `client/src/pages/AdminDashboard.jsx`

1. Add `'subscriptions'` to the sidebar nav items array with a `CreditCard` icon.
2. Create a `SubscriptionsPanel` component. On mount it calls `GET /api/users?role=student` and shows a table of students with columns: name, email, `subscription_status` (badge), `subscription_expires_at`.
3. Each row has an "Edit" button that opens a small inline form to set `subscription_status` (dropdown: `free_trial`, `active`, `expired`) and `subscription_expires_at` (date picker). On save, call `PUT /api/users/:id/subscription` — create this endpoint in `server/routes/users.js` as an admin-only route that updates those two columns.
4. Add `{activePanel === 'subscriptions' && <Panel><SubscriptionsPanel /></Panel>}` to the render block.

---

### A5 — `/admin` blank page and `/admin/home` orphaned

**File:** `client/src/App.jsx`

Inside `<Route path="/admin" element={<AdminLayout />}>`, add as the first child:
```jsx
<Route index element={<Navigate to="/admin/dashboard" replace />} />
```
Replace `/admin/dashboard` with the actual path where `AdminDashboard` is mounted (check the existing child routes). This ensures visiting `/admin` redirects immediately instead of rendering a blank outlet.

For `/admin/home`: either add a link to it from the admin sidebar nav in `AdminDashboard.jsx`, or remove the route and the `DashboardHome` import from `App.jsx` if the page is not needed.

---

### A6 — Notification sending has no email delivery confirmation

**Files:** `server/routes/adminRoutes.js`, `client/src/pages/AdminDashboard.jsx`

In `server/routes/adminRoutes.js`, in the `POST /send-notification` handler, after inserting notification rows, add:
```js
const emailEnabled = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER);
return res.json({ success: true, sent: users.length, email_enabled: emailEnabled });
```

In `client/src/pages/AdminDashboard.jsx`, in the send-notification success handler, read `r.email_enabled`. If `false`, show a warning toast: `"Notifications saved to inbox. Email delivery is not configured on this server."` If `true`, show: `"Notification sent to X users."`

---

### A7 — Teacher "Nudge" sends nothing

**File:** `server/routes/teacherRoutes.js`

Find `POST /teacher/nudge/:userId`. Replace the stub body with:
1. Look up the student's name from the `users` table using `:userId`.
2. Insert a row into the `notifications` table: `{ user_id: userId, title: 'Study Reminder', body: 'Your teacher wants you to keep up your study streak!', type: 'nudge' }`.
3. Optionally call `emailService.sendEmail()` with the student's email and a short study reminder message if email is configured.
4. Return `{ success: true, delivered: true }`.

In `client/src/pages/TeacherDashboard.jsx`, in the nudge button click handler, show a success toast: `"Study reminder sent to [student name]."` on resolve.

---

## TEACHER

---

### T1 — No drill-down on individual student progress

**Files:** `client/src/pages/TeacherDashboard.jsx`

In the `AnalyticsTab` component, find where student rows are rendered. Add a "View" button to each row. On click, set a `selectedStudent` state variable to that student's `{ id, name }`. Render a slide-over or collapsible section below the row that calls `GET /api/analytics/student/:studentId/topics` (endpoint exists, IDOR-protected). Display the returned topic list showing each topic's accuracy percentage and attempt count. A close button clears `selectedStudent`.

---

### T2 — Teachers cannot see approval status of submitted questions

**File:** `client/src/pages/TeacherPendingQuestions.jsx`

1. Change the API call from `GET /api/teacher/questions?status=pending` to `GET /api/teacher/questions` (no status filter) so all statuses are returned.
2. Add a status badge to each question row: green for `approved`, red for `rejected`, amber for `pending`.
3. For questions with `status = 'rejected'`, display the `feedback` field below the question text: `"Rejection reason: [feedback]"`.
4. Add tab filters at the top (All / Pending / Approved / Rejected) that filter the already-loaded list client-side.

---

### T3 — No welcome email when admin creates a teacher account

**File:** `server/routes/adminRoutes.js`

In the `POST /create-teacher` handler, after the `INSERT INTO users` succeeds and `rows[0]` is available, add:
```js
try {
  await emailService.sendEmail({
    to: rows[0].email,
    subject: 'Your AISchoolOnair Teacher Account',
    text: `Hello ${rows[0].first_name},\n\nYour teacher account has been created.\n\nEmail: ${rows[0].email}\nPassword: ${req.body.password}\n\nPlease log in at https://www.aischoolonair.ng and change your password.\n\nThe AISchoolOnair Team`
  });
} catch (e) {
  console.warn('[create-teacher] welcome email failed:', e.message);
}
```
The try/catch ensures a failed email send does not roll back the account creation.

---

### T4 — Teachers with subject assignments but no classes cannot see their students

**File:** `server/routes/teacherRoutes.js`

In `GET /teacher/students`, after the existing query that fetches students via `class_memberships`, add a second query:
```sql
SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
FROM student_subjects ss
JOIN subjects s ON s.id = ss.subject_id
JOIN teacher_subjects ts ON ts.subject_id = s.id
JOIN users u ON u.id = ss.student_id
WHERE ts.teacher_id = :teacherId
  AND ss.is_active = true
  AND u.is_active = true
```
Merge the two result arrays, deduplicate by `id`, and return the combined list. Remove any fallback that calls the full users table.

---

## STUDENT

---

### S1 — No way to add a new exam type after onboarding

**Files:** `client/src/pages/StudentExamTypesPage.jsx`, `server/routes/studentRoutes.js`

**Backend:** In `server/routes/studentRoutes.js`, add:
```
POST /api/students/exam-types
Body: { exam_board_id: integer }
```
The handler inserts a row into `student_exam_types` with `is_active = true` and `status = 'approved'`. Check that the student's subscription is active before allowing it. Return 400 if already enrolled.

**Frontend:** In `StudentExamTypesPage.jsx`, add an "Add Exam Type" button at the top. On click, open a modal that calls `GET /api/catalog/types` and renders a list of all exam boards. Filter out boards the student is already enrolled in. When the student selects one and clicks "Add", call `POST /api/students/exam-types`. On success, reload the page data.

---

### S2 — Notification preferences lost on new device

**Files:** `client/src/pages/SettingsPage.jsx`, `server/routes/users.js` (or `server/routes/authRoutes.js`)

**Backend:** Add a `notification_preferences` JSONB column to the `users` table (via `run_complete_migration.js`: `ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}'`). In `server/routes/authRoutes.js`, in `PATCH /auth/profile`, accept and save a `notification_preferences` object alongside name/phone/country.

**Frontend:** In `SettingsPage.jsx`, replace all `localStorage.getItem`/`localStorage.setItem` calls for notification prefs with:
- On mount: read `user.notification_preferences` from the auth context (already fetched via `GET /me`).
- On toggle: call `PATCH /api/auth/profile` with `{ notification_preferences: { ...updatedPrefs } }` and update the auth context.

---

### S3 — No profile photo upload

**Files:** `client/src/pages/SettingsPage.jsx`, `server/routes/authRoutes.js`

**Backend:** In `server/routes/authRoutes.js`, add `POST /api/auth/avatar`. Use the existing multer/R2 upload middleware (same as resource upload). Store the returned file URL and update `users.avatar_url` for the authenticated user. Return `{ avatar_url: newUrl }`.

**Frontend:** In `SettingsPage.jsx`, in the profile section:
1. Replace the letter-avatar `<div>` with an `<img src={user.avatar_url || null}>` that falls back to the letter avatar when `avatar_url` is null.
2. Overlay a camera icon button. On click, trigger a hidden `<input type="file" accept="image/*">`.
3. On file select, POST to `/api/auth/avatar` using `FormData`. On success, update `user.avatar_url` in the auth context.

---

### S4 — Onboarding ignores exam-type subject limits

**File:** `client/src/pages/OnboardingPage.jsx`

1. After the exam board detection runs (when `detectedBoards` is populated), call `GET /api/catalog/types` and find the board matching the detected board code. Store its `max_subjects` value in state (default to 10 if null).
2. Replace:
   ```js
   if (subjects.length >= 10) return;
   ```
   with:
   ```js
   if (subjects.length >= (boardMaxSubjects || 10)) return;
   ```
3. Display the limit to the student below the subject grid: e.g. `"UTME students may select up to 4 subjects (${subjects.length}/4 selected)."` Update this counter live as subjects are toggled.

---

### S5 — No topic/subject search within a subject page

**File:** `client/src/pages/SubjectPage.jsx`

1. Add `const [topicSearch, setTopicSearch] = useState('')` to component state.
2. Add a search input above the topic list: `<input placeholder="Search topics…" value={topicSearch} onChange={e => setTopicSearch(e.target.value)} />`.
3. Filter the displayed topics:
   ```js
   const filteredTopics = topics.filter(t =>
     t.name.toLowerCase().includes(topicSearch.toLowerCase())
   );
   ```
4. When `topicSearch` is non-empty and a topic matches, auto-expand its subtopic list by including its `id` in the `expanded` set.
5. No API changes needed — topics are already in local state.

---

### S6 — No mock exam history

**Files:** `client/src/pages/MockExamHistoryPage.jsx` (new), `client/src/App.jsx`, `server/routes/quizzes.js`, `client/src/pages/StudentDashboard.jsx`

**Backend:** In `server/routes/quizzes.js`, in `GET /api/quizzes/history`, add support for `?is_mock=true` query param. When present, filter results to `practice_attempts` rows where `is_mock = true` (or the equivalent flag used during mock exam submission).

**Frontend:**
1. Create `client/src/pages/MockExamHistoryPage.jsx`. On mount it calls `GET /api/quizzes/history?is_mock=true`. Displays a list of past attempts: date, subject name, score (X/Y), accuracy %, time taken. Each row has a "Review" button that navigates to `/student/quiz-results` passing the `attemptId`.
2. In `App.jsx`, register `<Route path="mock-history" element={<MockExamHistoryPage />} />` inside the student routes block.
3. In `StudentDashboard.jsx`, add a "Mock History" link to the sidebar nav alongside the existing "Mock Exam" item.

---

### S7 — Tests assigned by teachers are invisible to students

**Files:** `server/routes/studentRoutes.js`, `client/src/pages/StudentDashboard.jsx`

**Backend:** In `server/routes/studentRoutes.js`, add:
```
GET /api/students/my-tests
```
Query the teacher-test assignment table (check `teacher_tests` or `student_tests` — whichever exists) for tests assigned to the authenticated student that have not yet been submitted. Return `[{ id, title, subject_name, assigned_by, due_date }]`.

**Frontend:** In `StudentDashboard.jsx`, add a "Pending Tests" widget that calls this endpoint on mount. If the array is non-empty, render a list of test titles with a "Take Test →" button linking to `/student/test/:testId`. If empty, render nothing (do not show an empty widget).

---

### S8 — No centralised quiz history across all subjects

**Files:** `client/src/pages/QuizHistoryPage.jsx`, `client/src/App.jsx`, `client/src/pages/StudentDashboard.jsx`

In `client/src/pages/QuizHistoryPage.jsx`, the page already accepts `subtopicId` from the URL params. When `subtopicId` is absent (i.e. the page is visited at `/student/quiz-history` with no subtopic), call `GET /api/quizzes/history` with no subtopic filter. Group results by subject name and display in reverse chronological order.

In `App.jsx`, add `<Route path="quiz-history" element={<QuizHistoryPage />} />` as a student route (without the `subtopicId` param).

In `StudentDashboard.jsx` or the student nav sidebar, add a "Quiz History" link pointing to `/student/quiz-history`.

---

### S9 — SubjectCatalog has no enrol button

**File:** `client/src/pages/SubjectCatalog.jsx`

1. Add `const [enrolling, setEnrolling] = useState(null)` to state.
2. In each subject card that the student is not already enrolled in, add an "Enrol" button.
3. On click, call `POST /api/students/subjects` with `{ subject_id: subject.id }`.
4. On success (`200`), add the subject ID to `enrolledSubjects` state so the button immediately changes to an "Enrolled ✓" indicator.
5. On error, check `err.code === 'SUBJECT_LIMIT_REACHED'` — if so, show a toast: `"[Board name] students can only enrol in [max] subjects."` For other errors show a generic failure toast.

---

### S10 — Quiz results page breaks when accessed directly via URL

**File:** `client/src/pages/QuizResultsPage.jsx`

In the `useEffect` that loads data, if both `inlineResult` and `attemptId` are absent (user navigated directly to the URL with no state), instead of falling through to a broken API call, immediately set a user-friendly error: `setError("Results are only available immediately after completing a quiz. Please take a quiz to see your results.")` and `setLoading(false)`. Also ensure the `GET /api/quizzes/attempt/:attemptId` call in `server/routes/quizzes.js` returns a 404 with a clear JSON body when the attempt does not belong to the requesting user, rather than returning an empty object that causes a blank render.

---

## CROSS-CUTTING

---

### X1 — Scheduled jobs never start

**File:** `server/server.js`

At the bottom of `server.js`, after all routes are mounted and before the `server.listen` call, add:
```js
try {
  const { startJobs } = require('./jobs/scheduledJobs');
  startJobs();
  logger.info('Scheduled jobs started');
} catch (e) {
  logger.warn('Scheduled jobs failed to start:', e.message);
}
```
No changes to `scheduledJobs.js` are needed — it already exports `startJobs()` correctly.

---

### X2 — Real-time client/server protocol mismatch

**Option A — Remove (recommended if real-time is not actively used):**
1. Delete `server/services/realtimeEngine.js`.
2. In `server/server.js`, remove the try/catch block that calls `new RealtimeEngine(server)`.
3. Delete `client/src/services/realtimeClient.js`.
4. Remove the `useRealtimeSync` import from `client/src/pages/Dashboard/DashboardHome.jsx`.

**Option B — Fix the protocol mismatch:**
1. In `client/package.json`, add `"socket.io-client": "^4.7.0"`.
2. In `client/src/services/realtimeClient.js`, replace the native `new WebSocket(url)` code with:
   ```js
   import { io } from 'socket.io-client';
   const socket = io(REALTIME_URL, { withCredentials: true });
   ```
   Adapt the `on`/`emit` calls to use socket.io syntax.

---

### X3 — `/teacher` renders a blank page

**File:** `client/src/App.jsx`

Inside `<Route path="/teacher" element={<TeacherLayout />}>`, add as the first child:
```jsx
<Route index element={<Navigate to="/teacher/dashboard" replace />} />
```
Replace `/teacher/dashboard` with the actual path where `TeacherDashboard` is mounted (check the existing sibling routes).

---

### X4 — Social media links are guessed placeholder URLs

**File:** `client/src/config/branding.js`

Replace each social URL with the verified real account URL, or set to `null` for platforms where no account exists:
```js
social: {
  twitter:   null,               // replace with real URL or leave null
  facebook:  null,
  linkedin:  null,
  instagram: null,
}
```
In `client/src/pages/LandingPage.jsx`, find where social icons are rendered and wrap each in a conditional:
```jsx
{branding.social.twitter && (
  <a href={branding.social.twitter} ...>...</a>
)}
```
Icons with `null` values are silently not rendered.

---

### X5 — Branding stats are hardcoded and never update

**Files:** `client/src/pages/LandingPage.jsx`, `client/src/config/branding.js`

In `LandingPage.jsx`, add a `useEffect` that calls `GET /api/admin/platform-stats` (endpoint already exists — no auth required if you add a public variant, or keep behind auth and show static values for logged-out visitors). Map the response:
- `stats.users.students` → "Students"
- `stats.users.teachers` → "Teachers"

Store in local state. Format with `toLocaleString()` and append `"+"`. Fall back to the static strings from `branding.js` if the API call fails or the user is not logged in.

---

### X6 — PricingPage renders null

**File:** `client/src/pages/PricingPage.jsx`

Replace `return null` with a real page. Minimum viable content:
```jsx
export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <h1 className="text-3xl font-bold mb-4">Pricing</h1>
      <p className="text-gray-600 mb-6 max-w-md">
        Affordable plans for every Nigerian student. Contact us to get started.
      </p>
      <a href="https://wa.me/[WHATSAPP_NUMBER]"
         className="bg-green-600 text-white px-6 py-3 rounded-xl font-semibold">
        Chat with us on WhatsApp
      </a>
    </div>
  );
}
```
Replace `[WHATSAPP_NUMBER]` with the real number from `branding.js`.

---

### X7 — TeacherAssignmentPage exposes admin action to teachers

**Files:** `client/src/App.jsx`, `server/routes/adminRoutes.js`

**Frontend:** In `App.jsx`, move the `<Route path="assignments" element={<TeacherAssignmentPage />} />` line from the `allowedRoles={["teacher","admin"]}` block into the `allowedRoles={["admin"]}` block. Teachers should not have a UI path to this page.

**Backend:** In `server/routes/adminRoutes.js`, confirm that `POST /admin/teacher-subjects` has `adminOnly` middleware. If it does not, add it before the async handler.

---

### X8 — Email delivery not verified in production

This is an operational task, not a code change.

1. SSH into the production server: `ssh root@<server-ip>`
2. Check env vars: `grep EMAIL /opt/aischoolonair/api.env`
3. Confirm `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, and `EMAIL_FROM` are all set to real values (not `REPLACE_ME`).
4. If any are missing, add them to `/opt/aischoolonair/api.env` and run `docker compose up -d --no-build` to pick up the new vars.
5. End-to-end test: use the "Forgot Password" flow from the login page and confirm the reset email arrives in the inbox within 2 minutes.

---

### X9 — ContributeQuestion accepts blank question text

**File:** `client/src/pages/ContributeQuestion.jsx`

In the form submit handler, before the API call add:
```js
if (!questionText.trim()) {
  setError('Question text cannot be blank.');
  return;
}
if (questionText.trim().length < 10) {
  setError('Question text must be at least 10 characters.');
  return;
}
```
Also add server-side validation in `server/routes/questionsRoutes.js` (or whichever endpoint receives the contribution): if `question_text` is absent or shorter than 10 characters, return `400 { error: 'Question text is required (min 10 characters)' }`.

---

### X10 — Teacher can delete uploaded resources but not edit them

**Files:** `client/src/pages/TeacherResourcesPage.jsx`, `server/routes/resourceRoutes.js`

**Backend:** In `server/routes/resourceRoutes.js`, add:
```
PATCH /api/resources/:id
Body: { title, subject_id, description }
```
The handler updates those three fields for the resource. Verify that the requesting user owns the resource (`uploaded_by = req.user.id`) or is admin before allowing the update.

**Frontend:** In `TeacherResourcesPage.jsx`, add an edit (pencil) icon button alongside the existing delete button on each resource row. On click, open a modal pre-filled with the resource's current `title`, `subject_id`, and `description`. On save, call `PATCH /api/resources/:id`. On success, update the resource in local state.

---

### X11 — Teacher fallback re-opens IDOR on student list

**File:** `server/routes/teacherRoutes.js`

Find every `GET /teacher/students` handler in the file (there may be duplicate definitions — this was a known issue). Ensure all of them are replaced by the single secure implementation that only queries via `class_memberships` and `teacher_subjects`. Remove every fallback that calls `SELECT * FROM users WHERE role = 'student'` or equivalent. If a teacher has no classes and no subject assignments, the endpoint must return an empty array — not fall back to the full roster.

---

### X12 — Badges are awarded but never displayed

**Files:** `client/src/pages/StudentDashboard.jsx` (or a new `BadgesPage.jsx`), `server/routes/analyticsRoutes.js`

**Backend:** In `server/routes/analyticsRoutes.js`, add:
```
GET /api/analytics/badges
```
Query `user_badges` for the authenticated student: `SELECT badge_code, earned_at FROM user_badges WHERE user_id = :studentId ORDER BY earned_at DESC`. Return the list.

**Frontend:** Add a "Badges" section to the student dashboard or analytics page. On mount call `GET /api/analytics/badges`. Render each badge as an icon + label (define a static map of `badge_code` → display name and icon). If the student has no badges yet, show "Complete quizzes and hit milestones to earn badges."

---

### X13 — Daily goal has no activity type breakdown

**File:** `client/src/pages/StudentDashboard.jsx`

This is a UI-only enhancement. The `analyticsData` from `GET /api/analytics/summary` likely includes separate counts for practice attempts vs quiz attempts. If it does, display two sub-bars or a split counter inside the daily goal widget: "Practice: X | Quiz: Y | Total: Z / goal". If the summary endpoint does not return split counts, add `practice_today` and `quiz_today` fields to `GET /api/analytics/summary` in `server/routes/analyticsRoutes.js` by adding two filtered counts to the existing summary query.

---

### X14 — Past paper downloads are unauthenticated (policy decision)

**This requires a product decision before implementation.**

If open access is intentional (SEO, marketing): no change needed. Document it as a deliberate choice.

If auth is required: in `client/src/pages/PastPapersPage.jsx`, replace the direct `<a href={url} download>` links with a button that calls `GET /api/past-papers/:id/download` (authenticated endpoint). The server returns a short-lived signed URL (same R2 signed URL pattern already used for resources). The frontend then opens the signed URL programmatically. This requires a logged-in session to download.

---

### X15 — Bulk upload has no overall batch progress indicator

**File:** `client/src/components/AdminBulkUploadPanel.jsx`

1. Add `const [batchProgress, setBatchProgress] = useState({ completed: 0, total: 0 })` to state.
2. Before the upload loop begins, set `setBatchProgress({ completed: 0, total: filesToUpload.length })`.
3. After each individual file upload completes (success or failure), increment: `setBatchProgress(p => ({ ...p, completed: p.completed + 1 }))`.
4. Render a progress bar above the file list: `Uploading {completed} of {total} files…` with a `<progress value={completed} max={total}>` element. Hide it when `total === 0`.

---

### X16 — AI Generate gives no warning when topic has no subtopics

**File:** `client/src/pages/AdminDashboard.jsx` — `AIGeneratePanel` component

After the topic is selected from the dropdown, check the loaded subtopics list. If `subtopics.length === 0` for the selected topic, display a yellow warning banner below the topic selector:
```
⚠ This topic has no subtopics. Generated questions will not appear in student quizzes until you create at least one subtopic under this topic in the Catalog panel.
```
Allow generation to proceed — do not block it. The warning is informational only.

---

### X17 — No global search for students

**Files:** `client/src/pages/StudentDashboard.jsx` or a new `SearchPage.jsx`, `server/routes/subjectsRoutes.js` or a new `server/routes/searchRoutes.js`

**Backend:** Add `GET /api/search?q=` endpoint. It queries:
- `subjects` table: `WHERE name ILIKE '%q%' AND is_active = true`
- `topics` table: `WHERE name ILIKE '%q%' AND is_active = true` (join to get subject name)
- `subtopics` table: `WHERE name ILIKE '%q%' AND is_active = true` (join to get topic + subject)

Return `{ subjects: [...], topics: [...], subtopics: [...] }`. Limit each to 5 results. Only return content the student is enrolled in (join through `student_subjects`).

**Frontend:** Add a search icon button to the student navigation bar. Clicking opens a full-screen overlay with a text input. On each keystroke (debounced 300ms), call `GET /api/search?q=`. Group results by type. Each result is a link: subjects link to `/student/subject/:id`, topics expand their subject page, subtopics link to `/student/subtopic/:id`.
