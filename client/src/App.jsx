import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Layout shells
import TeacherLayout from "./layouts/TeacherLayout";
import AdminLayout from "./layouts/AdminLayout";

// Auth guard
import PrivateRoute from "./components/PrivateRoute";

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

// Semi-public
import PastPapersPage from "./pages/PastPapersPage";
import SubjectCatalog from "./pages/SubjectCatalog";

// Student
import StudentDashboard, { DashboardContent } from "./pages/StudentDashboard";
import EnglishMasterclass from "./pages/EnglishMasterclass";
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
import TeacherAssignmentPage from "./pages/TeacherAssignmentPage";
import TeacherContentPage from "./pages/TeacherContentPage";
import TeacherPendingQuestions from "./pages/TeacherPendingQuestions";
import TeacherResourcesPage from "./pages/TeacherResourcesPage";
import ContributeQuestion from "./pages/ContributeQuestion";
import QuestionReview from "./pages/QuestionReview";
import TeacherAddQuestionPage from "./pages/TeacherAddQuestionPage";

// Admin
import AdminDashboard from "./pages/AdminDashboard";
import DashboardHome from "./pages/Dashboard/DashboardHome";

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

        {/* STUDENT */}
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
            <Route path="english-masterclass" element={<EnglishMasterclass />} />
          </Route>
        </Route>

        {/* TEACHER */}
        <Route element={<PrivateRoute allowedRoles={["teacher", "admin"]} />}>
          <Route path="/teacher" element={<TeacherLayout />}>
            <Route path="dashboard" element={<TeacherDashboard />} />
            <Route path="assignments" element={<TeacherAssignmentPage />} />
            <Route path="content" element={<TeacherContentPage />} />
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
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="home" element={<DashboardHome />} />
            <Route path="questions/review" element={<QuestionReview />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="english-masterclass" element={<AdminEnglishMasterclass />} />
          </Route>
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
