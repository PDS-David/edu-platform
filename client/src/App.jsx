import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';

import LandingPage               from './pages/LandingPage';
import LoginPage                 from './pages/LoginPage';
import RegisterPage              from './pages/RegisterPage';
import ForgotPassword            from './pages/ForgotPassword';
import ResetPassword             from './pages/ResetPassword';
import VerifyEmailPage           from './pages/VerifyEmailPage';
import PrivacyPolicy             from './pages/PrivacyPolicy';
import TermsOfService            from './pages/TermsOfService';
import SubjectCatalog            from './pages/SubjectCatalog';
import PricingPage               from './pages/PricingPage';
import PaymentVerify             from './pages/PaymentVerify';
import StudentDashboard          from './pages/StudentDashboard';
import StudentAnalyticsDashboard from './pages/StudentAnalyticsDashboard';
import TeacherDashboard          from './pages/TeacherDashboard';
import TeacherResourcesPage      from './pages/TeacherResourcesPage';
import AdminDashboard            from './pages/AdminDashboard';
import PracticeMode              from './pages/PracticeMode';
import ContributeQuestion        from './pages/ContributeQuestion';
import QuestionReview            from './pages/QuestionReview';
import NotFound                  from './pages/NotFound';
import SubjectPage               from './pages/SubjectPage';
import SubtopicPage              from './pages/SubtopicPage';
import QuizPage                  from './pages/QuizPage';
import QuizResultsPage           from './pages/QuizResultsPage';
import MockExamPage              from './pages/MockExamPage';
import PastPapersPage            from './pages/PastPapersPage';
import OnboardingPage            from './pages/OnboardingPage';
import StudentTestPage           from './pages/StudentTestPage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/"                element={<LandingPage />} />
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/register"        element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password"  element={<ResetPassword />} />
          <Route path="/verify-email"    element={<VerifyEmailPage />} />
          <Route path="/privacy"         element={<PrivacyPolicy />} />
          <Route path="/terms"           element={<TermsOfService />} />
          <Route path="/subjects"        element={<SubjectCatalog />} />
          <Route path="/pricing"         element={<PricingPage />} />
          <Route path="/payment/verify"  element={<PaymentVerify />} />

          <Route path="/student/dashboard" element={<PrivateRoute allowedRoles={['student']}><StudentDashboard /></PrivateRoute>} />
          <Route path="/student/analytics" element={<PrivateRoute allowedRoles={['student']}><StudentAnalyticsDashboard /></PrivateRoute>} />
          <Route path="/student/subject/:subjectId" element={<PrivateRoute allowedRoles={['student']}><SubjectPage /></PrivateRoute>} />
          <Route path="/student/subtopic/:subtopicId" element={<PrivateRoute allowedRoles={['student']}><SubtopicPage /></PrivateRoute>} />
          <Route path="/student/quiz/:subtopicId" element={<PrivateRoute allowedRoles={['student']}><QuizPage /></PrivateRoute>} />
          <Route path="/student/quiz-results/:attemptId" element={<PrivateRoute allowedRoles={['student']}><QuizResultsPage /></PrivateRoute>} />
          <Route path="/student/mock/:subjectId" element={<PrivateRoute allowedRoles={['student']}><MockExamPage /></PrivateRoute>} />
          <Route path="/student/test/:testId" element={<PrivateRoute allowedRoles={['student']}><StudentTestPage /></PrivateRoute>} />
          <Route path="/onboarding" element={<PrivateRoute allowedRoles={['student']}><OnboardingPage /></PrivateRoute>} />
          <Route path="/past-papers" element={<PastPapersPage />} />
          <Route path="/contribute" element={<PrivateRoute allowedRoles={['student', 'teacher']}><ContributeQuestion /></PrivateRoute>} />
          <Route path="/student/practice" element={<PrivateRoute allowedRoles={['student']}><PracticeMode /></PrivateRoute>} />

          <Route path="/teacher/dashboard" element={<PrivateRoute allowedRoles={['teacher']}><TeacherDashboard /></PrivateRoute>} />
          <Route path="/teacher/upload-video" element={<PrivateRoute allowedRoles={['teacher','admin']}><TeacherResourcesPage defaultTab="upload" /></PrivateRoute>} />
          <Route path="/teacher/add-questions" element={<PrivateRoute allowedRoles={['teacher','admin']}><TeacherResourcesPage defaultTab="questions" /></PrivateRoute>} />
          <Route path="/admin/dashboard"   element={<PrivateRoute allowedRoles={['admin']}><AdminDashboard /></PrivateRoute>} />
          <Route path="/admin/questions/review" element={<PrivateRoute allowedRoles={['admin']}><QuestionReview /></PrivateRoute>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
