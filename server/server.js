'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { aiLimiter, globalLimiter } = require('./middleware/rateLimiter');
const logger = require('./config/logger');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');

if (process.env.NODE_ENV !== 'production') {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '.env') });
}

if (process.env.NODE_ENV === 'production') {
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
}

(function validateEnv() {
  const required = ['JWT_SECRET', 'PORT'];

  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !process.env.DATABASE_URL) {
    required.push('DB_PASSWORD', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER');
  }

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
})();

const app = express();
app.set('trust proxy', 1);

// ── STATIC FRONTEND ─────────────────────────────
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  console.log('Serving React frontend');
} else {
  console.log('No client build detected (Render Static Site expected)');
}

// ── CORE MIDDLEWARE ─────────────────────────────
app.use(requestId);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(globalLimiter);

// ── CORS ────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://aischoolonair.onrender.com',
  process.env.CLIENT_URL,
  process.env.PROD_CLIENT_URL,
  process.env.NGROK_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    logger.warn('CORS blocked', { origin });
    return cb(new Error('CORS blocked'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ── DATABASE ───────────────────────────────────
const db = require('./config/database');

const modelPaths = [
  './models/User',
  './models/ExamBoard',
  './models/Subject',
  './models/Topic',
  './models/Subtopic',
  './models/Resource',
  './models/Course',
  './models/Enrollment',
  './models/Quiz',
  './models/Question',
  './models/Note',
  './models/Video',
  './models/PastPaper',
  './models/Payment',
  './models/Notification',
  './models/Concept',
  './models/StudentExamType',
  './models/SubtopicProgress',
  './models/PracticeAttempt',
  './models/AiChatSession',
  './models/AiChatMessage',
  './models/TeacherSubject',
];

for (const m of modelPaths) {
  try {
    const mod = require(m);
    if (typeof mod === 'function') mod(db);
  } catch (e) {
    logger.warn(`Model skipped: ${m} — ${e.message}`);
  }
}

try {
  require('./models/associations');
} catch {}

// ── DB INIT (FIXED: SAFE & AWAITED) ────────────
async function initDB() {
  try {
    await db.authenticate();
    logger.info('DB connected');
  } catch (e) {
    logger.error('DB failed', { error: e.message });
    process.exit(1);
  }
}

// run init immediately (safe in Render)
initDB();

// ── AUTH ───────────────────────────────────────
const { protect } = require('./middleware/auth');

let subscriptionGuard = (_r, _s, n) => n();
try {
  subscriptionGuard = require('./middleware/subscriptionGuard');
} catch {}

// ── ROUTES ─────────────────────────────────────
const authRoutes = require('./routes/authRoutes');
const aiRoutes = require('./routes/aiRoutes');
const adminRoutes = require('./routes/adminRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const userRoutes = require('./routes/users');
const examBoardsRoutes = require('./routes/examBoardsRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const topicsRoutes = require('./routes/topicsRoutes');
const subtopicRoutes = require('./routes/subtopicRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const coursesRoutes = require('./routes/courses');
const enrollmentsRoutes = require('./routes/enrollments');
const quizzesRoutes = require('./routes/quizzes');
const questionsRoutes = require('./routes/questionsRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const notesRoutes = require('./routes/notesRoutes');
const videosRoutes = require('./routes/videosRoutes');
const pastPaperRoutes = require('./routes/pastPaperRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const catalogRoutes = require('./routes/catalogRoutes');
const notificationsRoutes = require('./routes/notificationsRoutes');
const studentRoutes = require('./routes/studentRoutes');
const conceptRoutes = require('./routes/conceptRoutes');
const curriculumRoutes = require('./routes/curriculumRoutes');

let aiChatRoute = null;
try {
  aiChatRoute = require('./routes/aiChatRoute');
} catch {}

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── PUBLIC ─────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/exam-boards', examBoardsRoutes);
app.use('/api/curriculum', curriculumRoutes);

// ── PROTECTED ──────────────────────────────────
app.use('/api/ai', protect, subscriptionGuard, aiLimiter, aiRoutes);
if (aiChatRoute) app.use('/api/ai', protect, subscriptionGuard, aiLimiter, aiChatRoute);

app.use('/api/admin', protect, adminRoutes);
app.use('/api/teacher', protect, teacherRoutes);
app.use('/api/users', protect, userRoutes);
app.use('/api/subjects', protect, subjectRoutes);
app.use('/api/topics', protect, topicsRoutes);
app.use('/api/subtopics', protect, subtopicRoutes);
app.use('/api/resources', protect, resourceRoutes);
app.use('/api/courses', protect, coursesRoutes);
app.use('/api/enrollments', protect, enrollmentsRoutes);
app.use('/api/quizzes', protect, quizzesRoutes);
app.use('/api/questions', protect, questionsRoutes);
app.use('/api/analytics', protect, analyticsRoutes);
app.use('/api/notes', protect, notesRoutes);
app.use('/api/videos', protect, videosRoutes);
app.use('/api/past-papers', protect, pastPaperRoutes);
app.use('/api/payments', protect, paymentRoutes);
app.use('/api/catalog', protect, catalogRoutes);
app.use('/api/notifications', protect, notificationsRoutes);
app.use('/api/students', protect, studentRoutes);
app.use('/api/concepts', protect, conceptRoutes);

// ── HEALTH ─────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ success: true });
});

// ── ERROR HANDLER ──────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

// ── START ──────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
