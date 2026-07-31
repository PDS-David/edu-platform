import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Layout shells
import TeacherLayout from "./layouts/TeacherLayout";
import AdminLayout from "./layouts/AdminLayout";
import EMLayout from "./layouts/EMLayout";

// Auth guards
import PrivateRoute from "./components/PrivateRoute";
import EMPrivateRoute from "./components/EMPrivateRoute";

// Public / auth pages
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import OnboardingPage from "./pages/OnboardingPage";
import PricingPage from "./pages/PricingPage";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import PaymentVerify from "./pages/PaymentVerify";
import NotFound from "./pages/NotFound";

// English Masterclass standalone portal
import EMLoginPage from "./pages/em/EMLoginPage";
import EMSignupPage from "./pages/em/EMSignupPage";
import EMRegisterPage from "./pages/em/EMRegisterPage";
import EMDashboard from "./pages/em/EMDashboard";
import EMPractice  from "./pages/em/EMPractice";
import EMProgress  from "./pages/em/EMProgress";

// Semi-public
import PastPapersPage from "./pages/PastPapersPage";
import SubjectCatalog from "./pages/SubjectCatalog";

// Student
import StudentDashboard, { DashboardContent } from "./pages/StudentDashboard";
import AdminEnglishMasterclass from "./pages/AdminEnglishMasterclass";
import StudentSubjectsPage from "./pages/StudentSubjectsPage";
import StudentFilesPage from "./pages/StudentFilesPage";
import StudentExamTypesPage from "./pages/StudentExamTypesPage";
import StudentAnalyticsDashboard from "./pages/StudentAnalyticsDashboard";
import StudentTestPage from "./pages/StudentTestPage";
import SubjectPage from "./pages/SubjectPage";
import SubtopicPage from "./pages/SubtopicPage";
import QuizPage from "./pages/QuizPage";
import QuizResultsPage from "./pages/QuizResultsPage";
import QuizHistoryPage from "./pages/QuizHistoryPage";
import AllQuizHistoryPage from "./pages/AllQuizHistoryPage";
import PracticeMode from "./pages/PracticeMode";
import MockExamPage from "./pages/MockExamPage";
import MockExamHistoryPage from "./pages/MockExamHistoryPage";
import MyTestsPage from "./pages/MyTestsPage";
import ImageMarkingPage from "./pages/ImageMarkingPage";
import SettingsPage from "./pages/SettingsPage";

// Teacher
import TeacherDashboard from "./pages/TeacherDashboard";
import TeacherContentPage from "./pages/TeacherContentPage";
import TeacherPastPapersPage from "./pages/TeacherPastPapersPage";
import TeacherPendingQuestions from "./pages/TeacherPendingQuestions";
import TeacherResourcesPage from "./pages/TeacherResourcesPage";
import ContributeQuestion from "./pages/ContributeQuestion";
import QuestionReview from "./pages/QuestionReview";
import TeacherAddQuestionPage from "./pages/TeacherAddQuestionPage";

// Admin
import AdminDashboard from "./pages/AdminDashboard";
import AdminSchools from "./pages/AdminSchools";
import SchoolAdminDashboard from "./pages/SchoolAdminDashboard";
import SchoolAdminStudentReport from "./pages/SchoolAdminStudentReport";
import AdminStudents from "./pages/AdminStudents";
import JoinSchoolPage from "./pages/JoinSchoolPage";
import FrenchMasterclass from "./pages/FrenchMasterclass";
import GermanMasterclass from "./pages/GermanMasterclass";
import ChooseAppPage from "./pages/ChooseAppPage";

// Global floating widget
import WhatsAppButton from "./components/WhatsAppButton";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* PUBLIC */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/past-papers" element={<PastPapersPage />} />
        <Route path="/subjects" element={<SubjectCatalog />} />
        {/* English Masterclass public entry — goes to the dedicated EM login */}
        <Route path="/english-masterclass" element={<Navigate to="/em/login" replace />} />

        {/* ENGLISH MASTERCLASS — public login */}
        <Route path="/em/login" element={<EMLoginPage />} />
        <Route path="/em/signup" element={<EMSignupPage />} />

        {/* ENGLISH MASTERCLASS — protected portal (own layout, no AISchoolOnAir chrome) */}
        <Route element={<EMPrivateRoute />}>
          {/* One-time EM registration — deliberately outside EMLayout so a
              student who hasn't registered yet has no EM nav to escape into. */}
          <Route path="/em/register" element={<EMRegisterPage />} />
          <Route element={<EMLayout />}>
            <Route path="/em/dashboard" element={<EMDashboard />} />
            <Route path="/em/practice"  element={<EMPractice />} />
            <Route path="/em/progress"  element={<EMProgress />} />
            <Route path="/em"           element={<Navigate to="/em/dashboard" replace />} />
          </Route>
        </Route>

        {/* AUTH */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/payment/verify" element={<PaymentVerify />} />

        {/* ONBOARDING — authenticated, student-only, but exempt from the
            onboarding-redirect check (it IS the onboarding page). */}
        <Route element={<PrivateRoute allowedRoles={["student"]} skipOnboardingCheck />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Route>

        {/* STUDENT — shell routes (sidebar + TopNav) */}
        <Route element={<PrivateRoute allowedRoles={["student"]} />}>
          <Route path="/student" element={<StudentDashboard />}>
            {/* DEF-003: DashboardContent is the index child so /student and /student/dashboard
                both render it through the shell's <Outlet>.  The old pattern had StudentDashboard
                pointing at itself for /dashboard, creating an infinite self-referencing loop. */}
            <Route index element={<DashboardContent />} />
            <Route path="dashboard" element={<DashboardContent />} />
            <Route path="analytics" element={<StudentAnalyticsDashboard />} />
            <Route path="subject/:subjectId" element={<SubjectPage />} />
            <Route path="subtopic/:subtopicId" element={<SubtopicPage />} />
            <Route path="subtopic/:subtopicId/quiz-history" element={<QuizHistoryPage />} />
            <Route path="quiz/:subtopicId" element={<QuizPage />} />
            <Route path="quiz-results/:attemptId" element={<QuizResultsPage />} />
            <Route path="quiz-history" element={<AllQuizHistoryPage />} />
            <Route path="mock/:subjectId" element={<MockExamPage />} />
            <Route path="mock-history" element={<MockExamHistoryPage />} />
            <Route path="my-tests" element={<MyTestsPage />} />
            <Route path="practice" element={<PracticeMode />} />
            <Route path="mark-image" element={<ImageMarkingPage />} />
            <Route path="test/:testId" element={<StudentTestPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="subjects"   element={<StudentSubjectsPage />} />
            {/* DEF-018: canonical URL is /student/resources; /student/files redirects */}
            <Route path="files"      element={<Navigate to="/student/resources" replace />} />
            <Route path="resources"  element={<StudentFilesPage />} />
            <Route path="exam-types" element={<StudentExamTypesPage />} />
          </Route>

          {/* Legacy route — this used to render English Masterclass inside the
              AISchoolonair student shell (no EM branding, no EM-registration
              gate on the frontend). EM is now a fully separate product with
              its own portal; redirect any stale bookmarks/links there instead
              of leaving a confusing, backend-403'd dead end live. */}
          <Route path="/student/english-masterclass" element={<Navigate to="/em/dashboard" replace />} />
        </Route>

        {/* TEACHER */}
        <Route element={<PrivateRoute allowedRoles={["teacher", "admin"]} />}>
          <Route path="/teacher" element={<TeacherLayout />}>
            <Route index element={<Navigate to="/teacher/dashboard" replace />} />
            <Route path="dashboard" element={<TeacherDashboard />} />
            <Route path="assignments" element={<Navigate to="/teacher/dashboard?tab=testbuilder" replace />} />
            <Route path="content" element={<TeacherContentPage />} />
            <Route path="past-papers" element={<TeacherPastPapersPage />} />
            <Route path="pending-questions" element={<TeacherPendingQuestions />} />
            <Route path="resources" element={<TeacherResourcesPage />} />
            <Route path="review" element={<QuestionReview />} />
            <Route path="contribute" element={<ContributeQuestion />} />
            <Route path="questions/add" element={<TeacherAddQuestionPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>

        {/* ADMIN */}
        <Route element={<PrivateRoute allowedRoles={["admin"]} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="schools" element={<AdminSchools />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="students/:studentId" element={<SchoolAdminStudentReport />} />
            <Route path="questions/review" element={<QuestionReview />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="english-masterclass" element={<AdminEnglishMasterclass />} />
          </Route>
        </Route>

        {/* SCHOOL ADMIN — separate role from the platform-wide 'admin' above.
            Scoped entirely to their own school; see SchoolAdminDashboard.jsx
            and GET /api/schools/me* for how isolation is enforced. */}
        <Route element={<PrivateRoute allowedRoles={["school_admin"]} />}>
          <Route path="/school-admin/dashboard" element={<SchoolAdminDashboard />} />
          <Route path="/school-admin/settings" element={<SettingsPage />} />
          <Route path="/school-admin/students/:studentId" element={<SchoolAdminStudentReport />} />
        </Route>

        {/* CHOOSE APP — shown after login only when the account has access to
            BOTH AISchoolonair and English Masterclass (see
            getProductAccess() in utils/postAuthRedirect.js). skipOnboardingCheck
            for the same reason /onboarding has it: a dual-product student who
            hasn't finished onboarding must still see this choice first, not
            get bounced straight to /onboarding before ever being asked. If
            they pick AISchoolonair, /student/dashboard's own guard applies
            the onboarding check from there as normal. */}
        <Route element={<PrivateRoute allowedRoles={["student", "teacher"]} skipOnboardingCheck />}>
          <Route path="/choose-app" element={<ChooseAppPage />} />
        </Route>

        {/* JOIN A SCHOOL — role-agnostic, any teacher or student. Was missing
            entirely before: POST /api/schools/join existed but had no UI. */}
        <Route element={<PrivateRoute allowedRoles={["student", "teacher"]} />}>
          <Route path="/join-school" element={<JoinSchoolPage />} />
        </Route>

        {/* FRENCH / GERMAN MASTERCLASS — deliberately incomplete proof-of-concept,
            not wired into the ChooseAppPage/getPostAuthRedirect login unification
            on purpose (see LanguageMasterclass.jsx header comment). Own
            registration gate (POST /language-masterclass/:language/register),
            skipOnboardingCheck since this is independent of AISchoolonair's
            subject-selection onboarding. */}
        <Route element={<PrivateRoute allowedRoles={["student", "teacher"]} skipOnboardingCheck />}>
          <Route path="/french" element={<FrenchMasterclass />} />
          <Route path="/german" element={<GermanMasterclass />} />
        </Route>

        {/* FALLBACK */}
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />

      </Routes>

      {/* GLOBAL WIDGET */}
      <WhatsAppButton />
    </BrowserRouter>
  );
}
