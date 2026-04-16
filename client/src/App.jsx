import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Layouts
import AdminLayout from "./layouts/AdminLayout";
import StudentLayout from "./layouts/StudentLayout";
import TeacherLayout from "./layouts/TeacherLayout";

// Auth / Public pages
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
import NotFound from "./pages/NotFound";
import PaymentVerify from "./pages/PaymentVerify";

// Shared protected pages
import SettingsPage from "./pages/SettingsPage";
import Dashboard from "./pages/Dashboard";

// Student pages
import StudentDashboard from "./pages/StudentDashboard";
import StudentAnalyticsDashboard from "./pages/StudentAnalyticsDashboard";
import StudentTestPage from "./pages/StudentTestPage";
import QuizPage from "./pages/QuizPage";
import QuizResultsPage from "./pages/QuizResultsPage";
import QuizHistoryPage from "./pages/QuizHistoryPage";
import PracticeMode from "./pages/PracticeMode";
import MockExamPage from "./pages/MockExamPage";
import PastPapersPage from "./pages/PastPapersPage";
import SubjectPage from "./pages/SubjectPage";
import SubjectCatalog from "./pages/SubjectCatalog";
import SubtopicPage from "./pages/SubtopicPage";
import ImageMarkingPage from "./pages/ImageMarkingPage";

// Teacher pages
import TeacherDashboard from "./pages/TeacherDashboard";
import TeacherAssignmentPage from "./pages/TeacherAssignmentPage";
import TeacherContentPage from "./pages/TeacherContentPage";
import TeacherPendingQuestions from "./pages/TeacherPendingQuestions";
import TeacherResourcesPage from "./pages/TeacherResourcesPage";
import QuestionReview from "./pages/QuestionReview";
import ContributeQuestion from "./pages/ContributeQuestion";

// Admin pages
import AdminDashboard from "./pages/AdminDashboard";
import dashboard/DashboardHome from "./pages/dashboard/DashboardHome";

// Guards
import PrivateRoute from "./components/PrivateRoute";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ── PUBLIC ── */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />

        {/* ── AUTH ── */}
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/reset-password" element={<ResetPassword />} />
        <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
        <Route path="/auth/onboarding" element={<OnboardingPage />} />
        <Route path="/payment/verify" element={<PaymentVerify />} />

        {/* ── PROTECTED ── */}
        <Route element={<PrivateRoute />}>

          {/* STUDENT routes */}
          <Route element={<StudentLayout><Navigate /></StudentLayout>}>
            <Route path="/student" element={<StudentDashboard />} />
            <Route path="/student/analytics" element={<StudentAnalyticsDashboard />} />
            <Route path="/student/quiz" element={<QuizPage />} />
            <Route path="/student/quiz/results" element={<QuizResultsPage />} />
            <Route path="/student/quiz/history" element={<QuizHistoryPage />} />
            <Route path="/student/practice" element={<PracticeMode />} />
            <Route path="/student/mock-exam" element={<MockExamPage />} />
            <Route path="/student/past-papers" element={<PastPapersPage />} />
            <Route path="/student/subjects" element={<SubjectCatalog />} />
            <Route path="/student/subjects/:id" element={<SubjectPage />} />
            <Route path="/student/subtopic/:id" element={<SubtopicPage />} />
            <Route path="/student/test" element={<StudentTestPage />} />
            <Route path="/student/image-marking" element={<ImageMarkingPage />} />
            <Route path="/student/settings" element={<SettingsPage />} />
          </Route>

          {/* TEACHER routes */}
          <Route element={<TeacherLayout><Navigate /></TeacherLayout>}>
            <Route path="/teacher" element={<TeacherDashboard />} />
            <Route path="/teacher/assignments" element={<TeacherAssignmentPage />} />
            <Route path="/teacher/content" element={<TeacherContentPage />} />
            <Route path="/teacher/pending-questions" element={<TeacherPendingQuestions />} />
            <Route path="/teacher/resources" element={<TeacherResourcesPage />} />
            <Route path="/teacher/review" element={<QuestionReview />} />
            <Route path="/teacher/contribute" element={<ContributeQuestion />} />
            <Route path="/teacher/settings" element={<SettingsPage />} />
          </Route>

          {/* ADMIN routes */}
          <Route element={<AdminLayout><Navigate /></AdminLayout>}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/dashboard" element={<dashboard/DashboardHome />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
          </Route>

          {/* SHARED */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings" element={<SettingsPage />} />

        </Route>

        {/* ── FALLBACK ── */}
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;
