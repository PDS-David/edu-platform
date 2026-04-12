import axios from 'axios';

// ── Axios instance ────────────────────────────────────────────────────────────
// VITE_API_URL may be set as 'https://host.onrender.com' or 'https://host.onrender.com/api'
// Normalise so baseURL always ends with /api
const rawBase = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const BASE_URL = rawBase.endsWith('/api') ? rawBase : `${rawBase}/api`;

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000, // 30s — AI endpoints can take longer
});

// ── Request interceptor — attach JWT ─────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response interceptor ──────────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response) {
      const { status, data } = error.response;

      if (status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        const authPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
        const onAuthPage = authPaths.some(p => window.location.pathname.startsWith(p));
        if (!onAuthPage) window.location.href = '/login';
      }

      return Promise.reject(data || { error: `Request failed with status ${status}` });
    }

    if (error.request) {
      return Promise.reject({ error: 'Unable to reach the server. Please check your connection.' });
    }

    return Promise.reject({ error: error.message || 'An unexpected error occurred.' });
  },
);

// ── Auth API ──────────────────────────────────────────────────────────────────
export const authAPI = {
  register:       (data) => api.post('/auth/register', data),
  login:          (data) => api.post('/auth/login', data),
  getMe:          ()     => api.get('/auth/me'),
  updatePassword: (data) => api.put('/auth/password', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword:  (data) => api.post('/auth/reset-password', data),
};

// ── Users API ─────────────────────────────────────────────────────────────────
export const usersAPI = {
  getAll:  ()         => api.get('/users'),
  getById: (id)       => api.get(`/users/${id}`),
  update:  (id, data) => api.put(`/users/${id}`, data),
  delete:  (id)       => api.delete(`/users/${id}`),
};

// ── Exam Boards API ───────────────────────────────────────────────────────────
export const examBoardsAPI = {
  getAll:      ()     => api.get('/exam-boards'),
  getSubjects: (code) => api.get(`/exam-boards/${code}/subjects`),
};

// ── Subjects API ──────────────────────────────────────────────────────────────
export const subjectsAPI = {
  getAll:     (params) => api.get('/subjects', { params }),
  getById:    (id)     => api.get(`/subjects/${id}`),
  create:     (data)   => api.post('/subjects', data),
  getByBoard: (boardId) => api.get('/subjects', { params: { exam_board_id: boardId } }),
};

// ── Topics API ────────────────────────────────────────────────────────────────
export const topicsAPI = {
  getBySubject: (subjectId) => api.get('/topics', { params: { subject_id: subjectId } }),
  getById:      (id)        => api.get(`/topics/${id}`),
};

// ── Subtopics API ─────────────────────────────────────────────────────────────
export const subtopicsAPI = {
  getAll:           (params)               => api.get('/subtopics', { params }),
  getById:          (id)                   => api.get(`/subtopics/${id}`),
  getAdjacent:      (id)                   => api.get(`/subtopics/${id}/adjacent`),
  getProgress:      (id, studentId)        => api.get(`/subtopics/${id}/progress/${studentId}`),
  markProgress:     (id, task)             => api.post(`/subtopics/${id}/progress`, { task }),
  getNext:          (studentId, boardId)   => api.get('/subtopics/next', { params: { student_id: studentId, board: boardId } }),
  getProgressSummary: (studentId, subjectId) => api.get('/subtopics/progress-summary', { params: { student_id: studentId, subject_id: subjectId } }),
};

// ── Resources API ─────────────────────────────────────────────────────────────
export const resourcesAPI = {
  getAll:   (params)   => api.get('/resources', { params }),
  getById:  (id)       => api.get(`/resources/${id}`),
  upload:   (formData) => api.post('/resources/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete:   (id)       => api.delete(`/resources/${id}`),
};

// ── Questions API ─────────────────────────────────────────────────────────────
export const questionsAPI = {
  getRandom:     (params)      => api.get('/questions/random', { params }),
  getById:       (id)          => api.get(`/questions/${id}`),
  submitAnswer:  (id, data)    => api.post(`/questions/${id}/answer`, data),
  getHint:       (data)        => api.post('/ai/hint', data),
  getExplanation:(data)        => api.post('/ai/explain', data),
};

// ── Quiz API ──────────────────────────────────────────────────────────────────
export const quizAPI = {
  getAttemptCount:  (subtopicId)           => api.get('/quizzes/attempt-count', { params: { subtopic_id: subtopicId } }),
  submitAttempt:    (data)                 => api.post('/quizzes/attempt', data),
  getAttemptResult: (attemptId)            => api.get(`/quizzes/attempt/${attemptId}`),
  getHistory:       (studentId, subtopicId) => api.get(`/quizzes/history/${studentId}/${subtopicId}`),
};

// ── Analytics API ─────────────────────────────────────────────────────────────
// All endpoints query the live practice_attempts table.
export const analyticsAPI = {
  /** Overall summary stats for the logged-in student (questions, accuracy, streak, etc.) */
  getSummary:          ()                     => api.get('/analytics/summary'),

  /** Top N weakest topics for the logged-in student. Default limit = 5. */
  getWeakTopics:       (limit = 5)            => api.get('/analytics/weak-topics', { params: { limit } }),

  /** Score trend over the last N days for the logged-in student. Default days = 30. */
  getScoreTrend:       (days = 30)            => api.get('/analytics/score-trend', { params: { days } }),

  /** Accuracy and attempt breakdown grouped by subject for the logged-in student. */
  getSubjectBreakdown: ()                     => api.get('/analytics/subject-breakdown'),

  /** Time-on-task metrics (avg session length, total study time, etc.) */
  getTimeMetrics:      ()                     => api.get('/analytics/time-metrics'),

  /** Leaderboard for a specific subject. Pass subject_id to filter. */
  getLeaderboard:      (subjectId = '')       => api.get('/analytics/leaderboard', { params: { subject_id: subjectId } }),

  /** Badges/achievements earned by the logged-in student. */
  getBadges:           ()                     => api.get('/analytics/badges'),

  /** Per-topic performance for a specific student, optionally filtered by subject. */
  getTopicPerformance: (studentId, subjectId) => api.get(`/analytics/student/${studentId}/topics`, { params: { subject_id: subjectId } }),

  /** Full summary stats for a specific student (admin/teacher view). */
  getStudentSummary:   (studentId)            => api.get(`/analytics/student/${studentId}/summary`),

  /** Cohort-wide topic breakdown for a given subject (teacher/admin view). */
  getCohortTopics:     (subjectId)            => api.get(`/analytics/cohort/${subjectId}/topics`),
};

// ── AI API ────────────────────────────────────────────────────────────────────
export const aiAPI = {
  getHint:               (data)                       => api.post('/ai/hint', data),
  getExplanation:        (data)                       => api.post('/ai/explain', data),
  predictGrade:          (studentId, subjectId)       => api.get(`/ai/predict-grade/${studentId}/${subjectId}`),
  generateNotes:         (data)                       => api.post('/ai/notes/generate', data),
  getCohortGaps:         (subjectId)                  => api.get(`/ai/cohort-gaps/${subjectId}`),
};

// ── Payments API ──────────────────────────────────────────────────────────────
export const paymentsAPI = {
  getPlans:          ()     => api.get('/payments/plans'),
  initialize:        (data) => api.post('/payments/initialize', data),
  verify:            (ref)  => api.get(`/payments/verify/${ref}`),
  getSubscription:   ()     => api.get('/payments/subscription'),
  activateExamTypes: (data) => api.post('/payments/activate-exam-types', data),
};

// ── Courses + Enrollments API ─────────────────────────────────────────────────
export const coursesAPI = {
  getAll:  (params)   => api.get('/courses', { params }),
  getById: (id)       => api.get(`/courses/${id}`),
  create:  (data)     => api.post('/courses', data),
  update:  (id, data) => api.put(`/courses/${id}`, data),
  delete:  (id)       => api.delete(`/courses/${id}`),
};

export const enrollmentsAPI = {
  getAll:  ()     => api.get('/enrollments'),
  enroll:  (data) => api.post('/enrollments', data),
  unenroll:(id)   => api.delete(`/enrollments/${id}`),
};

// ── Catalog API ───────────────────────────────────────────────────────────────
export const catalogAPI = {
  getTeacherSubjects: (teacherId) => api.get(`/catalog/teachers/${teacherId}/subjects`),
  getStats:           ()          => api.get('/catalog/stats'),
};

export default api;
