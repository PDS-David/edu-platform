import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmailPage from "./pages/VerifyEmailPage";

import StudentDashboard from "./pages/StudentDashboard";
import StudentAnalyticsDashboard from "./pages/StudentAnalyticsDashboard";

import TeacherDashboard from "./pages/TeacherDashboard";

import AdminDashboard from "./pages/AdminDashboard";

import NotFound from "./pages/NotFound";

import PrivateRoute from "./components/PrivateRoute";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ================= PUBLIC ================= */}
        <Route path="/" element={<LandingPage />} />

        {/* ================= AUTH ================= */}
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/reset-password" element={<ResetPassword />} />
        <Route path="/auth/verify-email" element={<VerifyEmailPage />} />

        {/* ================= STUDENT (NESTED) ================= */}
        <Route
          path="/student/*"
          element={
            <PrivateRoute>
              <StudentDashboard />
            </PrivateRoute>
          }
        >
          {/* default = /student */}
          <Route index element={null} />

          {/* nested routes */}
          <Route path="analytics" element={<StudentAnalyticsDashboard />} />
        </Route>

        {/* ================= TEACHER (NESTED) ================= */}
        <Route
          path="/teacher/*"
          element={
            <PrivateRoute>
              <TeacherDashboard />
            </PrivateRoute>
          }
        >
          <Route index element={null} />
        </Route>

        {/* ================= ADMIN (NESTED) ================= */}
        <Route
          path="/admin/*"
          element={
            <PrivateRoute>
              <AdminDashboard />
            </PrivateRoute>
          }
        >
          <Route index element={null} />
        </Route>

        {/* ================= FALLBACK ================= */}
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;
