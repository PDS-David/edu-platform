import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Layout shells (role-grouped, Outlet-based)
import StudentLayout from "./layouts/StudentLayout";
import TeacherLayout from "./layouts/TeacherLayout";
import AdminLayout   from "./layouts/AdminLayout";

// Auth guard
import PrivateRoute from "./components/PrivateRoute";

// ── Public / auth pages ───────────────────────────────────────────────────────
import LandingPage    from "./pages/LandingPage";
import LoginPage      from "./pages/LoginPage";
import RegisterPage   from "./pages/RegisterPage";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword  from "./pages/ResetPassword";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import OnboardingPage from "./pages/OnboardingPage";
import PricingPage    from "./pages/PricingPage";
import PrivacyPolicy  from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import PaymentVerify  from "./pages/PaymentVerify";
import NotFound       from "./pages/NotFound";

// ── Semi-public pages (no login required) ────────────────────────────────────
import PastPapersPage from "./pages/PastPapersPage";
import SubjectCatalog from "./pages/SubjectCatalog";

// ── Student pages ─────────────────────────────────────────────────────────────
import StudentDashboard          from "./pages/StudentDashboard";
import StudentAnalyticsDashboard from "./pages/StudentAnalyticsDashboard";
import StudentTestPage           from "./pages/StudentTestPage";
import SubjectPage               from "./pages/SubjectPage";
import SubtopicPage              from "./pages/SubtopicPage";
import QuizPage                  from "./pages/QuizPage";
import QuizResultsPage           from "./pages/QuizResultsPage";
import QuizHistoryPage           from "./pages/QuizHistoryPage";
import PracticeMode              from "./pages/PracticeMode";
import MockExamPage              from "./pages/MockExamPage";
import ImageMarkingPage          from "./pages/ImageMarkingPage";
import SettingsPage              from "./pages/SettingsPage";
import Dashboard                 from "./pages/Dashboard";

// ── Teacher pages ─────────────────────────────────────────────────────────────
import TeacherDashboard        from "./pages/TeacherDashboard";
import TeacherAssignmentPage   from "./pages/TeacherAssignmentPage";
import TeacherContentPage      from "./pages/TeacherContentPage";
import TeacherPendingQuestions from "./pages/TeacherPendingQuestions";
import TeacherResourcesPage    from "./pages/TeacherResourcesPage";
import ContributeQuestion      from "./pages/ContributeQuestion";
import QuestionReview          from "./pages/QuestionReview";

// ── Admin pages ───────────────────────────────────────────────────────────────
import AdminDashboard from "./pages/AdminDashboard";
import DashboardHome  from "./pages/dashboard/DashboardHome";

// ── WhatsApp floating contact button ─────────────────────────────────────────
const WA_NUMBER  = "2348099123412";
const WA_MESSAGE = encodeURIComponent("Hi! I'd like to know more about AISchoolonair.");

function WhatsAppButton() {
  return (
    <a
      href={`https://wa.me/${WA_NUMBER}?text=${WA_MESSAGE}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contact us on WhatsApp"
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 9999,
        width: 56, height: 56, borderRadius: "50%",
        backgroundColor: "#25D366",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
        transition: "transform .2s ease, box-shadow .2s ease",
        textDecoration: "none",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "scale(1.1)";
        e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.3)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="30" height="30" fill="white">
        <path d="M16.003 2C8.28 2 2 8.28 2 16.003c0 2.478.65 4.812 1.783 6.838L2 30l7.363-1.76A13.94 13.94 0 0 0 16.003 30C23.72 30 30 23.72 30 16.003 30 8.28 23.72 2 16.003 2zm0 25.538a11.49 11.49 0 0 1-5.86-1.6l-.42-.25-4.37 1.045 1.075-4.258-.275-.437A11.47 11.47 0 0 1 4.538 16c0-6.32 5.147-11.465 11.465-11.465S27.465 9.68 27.465 16c0 6.32-5.147 11.538-11.462 11.538zm6.29-8.61c-.345-.173-2.04-1.006-2.357-1.12-.315-.115-.545-.173-.775.173-.23.345-.89 1.12-1.09 1.35-.2.23-.4.258-.745.086-.345-.173-1.456-.537-2.773-1.712-1.025-.915-1.717-2.044-1.918-2.39-.2-.344-.02-.53.15-.702.155-.155.345-.402.518-.603.172-.2.23-.345.345-.575.115-.23.058-.432-.03-.603-.086-.173-.775-1.87-1.062-2.56-.28-.672-.564-.58-.775-.59-.2-.01-.43-.012-.66-.012-.23 0-.603.086-.918.432-.315.345-1.205 1.178-1.205 2.873s1.233 3.335 1.405 3.564c.173.23 2.428 3.707 5.882 5.198.823.355 1.464.567 1.965.727.825.263 1.577.226 2.17.137.662-.1 2.04-.833 2.328-1.637.287-.805.287-1.494.2-1.637-.086-.144-.315-.23-.66-.402z"/>
      </svg>
    </a>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ── PUBLIC ────────────────────────────────────────────────────────── */}
        <Route path="/"               element={<LandingPage />} />
        <Route path="/pricing"        element={<PricingPage />} />
        <Route path="/privacy"        element={<PrivacyPolicy />} />
        <Route path="/terms"          element={<TermsOfService />} />
        <Route path="/past-papers"    element={<PastPapersPage />} />
        <Route path="/subjects"       element={<SubjectCatalog />} />

        {/* ── AUTH ──────────────────────────────────────────────────────────── */}
        <Route path="/login"           element={<LoginPage />} />
        <Route path="/register"        element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/verify-email"    element={<VerifyEmailPage />} />
        <Route path="/onboarding"      element={<OnboardingPage />} />
        <Route path="/payment/verify"  element={<PaymentVerify />} />

        {/* ── PROTECTED ─────────────────────────────────────────────────────── */}

        {/* STUDENT */}
        <Route element={<PrivateRoute allowedRoles={["student"]} />}>
          <Route element={<StudentLayout />}>
            <Route path="/student/dashboard"                          element={<StudentDashboard />} />
            <Route path="/student/analytics"                          element={<StudentAnalyticsDashboard />} />
            <Route path="/student/subject/:subjectId"                 element={<SubjectPage />} />
            <Route path="/student/subtopic/:subtopicId"               element={<SubtopicPage />} />
            <Route path="/student/subtopic/:subtopicId/quiz-history"  element={<QuizHistoryPage />} />
            <Route path="/student/quiz/:subtopicId"                   element={<QuizPage />} />
            <Route path="/student/quiz-results/:attemptId"            element={<QuizResultsPage />} />
            <Route path="/student/mock/:subjectId"                    element={<MockExamPage />} />
            <Route path="/student/practice"                           element={<PracticeMode />} />
            <Route path="/student/mark-image"                         element={<ImageMarkingPage />} />
            <Route path="/student/test/:testId"                       element={<StudentTestPage />} />
            <Route path="/student/settings"                           element={<SettingsPage />} />
          </Route>
        </Route>

        {/* TEACHER */}
        <Route element={<PrivateRoute allowedRoles={["teacher", "admin"]} />}>
          <Route element={<TeacherLayout />}>
            <Route path="/teacher/dashboard"        element={<TeacherDashboard />} />
            <Route path="/teacher/assignments"      element={<TeacherAssignmentPage />} />
            <Route path="/teacher/content"          element={<TeacherContentPage />} />
            <Route path="/teacher/pending-questions" element={<TeacherPendingQuestions />} />
            <Route path="/teacher/resources"        element={<TeacherResourcesPage />} />
            <Route path="/teacher/review"           element={<QuestionReview />} />
            <Route path="/teacher/contribute"       element={<ContributeQuestion />} />
            <Route path="/teacher/settings"         element={<SettingsPage />} />
          </Route>
        </Route>

        {/* ADMIN */}
        <Route element={<PrivateRoute allowedRoles={["admin"]} />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin/dashboard"        element={<AdminDashboard />} />
            <Route path="/admin/home"             element={<DashboardHome />} />
            <Route path="/admin/questions/review" element={<QuestionReview />} />
            <Route path="/admin/settings"         element={<SettingsPage />} />
          </Route>
        </Route>

        {/* SHARED (any authenticated role) */}
        <Route element={<PrivateRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings"  element={<SettingsPage />} />
        </Route>

        {/* ── FALLBACK ──────────────────────────────────────────────────────── */}
        <Route path="/404" element={<NotFound />} />
        <Route path="*"    element={<Navigate to="/404" replace />} />

      </Routes>

      {/* Floating WhatsApp button — visible on every page */}
      <WhatsAppButton />
    </BrowserRouter>
  );
}
