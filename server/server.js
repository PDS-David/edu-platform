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

// ─────────────────────────────────────────────
// ENV
// ─────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
}

// ─────────────────────────────────────────────
// LOG DIRECTORY (PROD SAFE)
// ─────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// ─────────────────────────────────────────────
// ENV VALIDATION
// ─────────────────────────────────────────────
(function validateEnv() {
  const required = ['JWT_SECRET', 'PORT'];

  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    required.push('DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD');
  }

  const missing = required.filter(k => !process.env[k]);

  if (missing.length) {
    console.error('❌ Missing env vars:', missing.join(', '));
    process.exit(1);
  }
})();

// ─────────────────────────────────────────────
// APP INIT
// ─────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);

// ─────────────────────────────────────────────
// STATIC FRONTEND
// ─────────────────────────────────────────────
const clientDist = path.join(__dirname, '..', 'client', 'dist');

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  console.log('✔ Serving frontend from client/dist');
} else {
  console.log('ℹ No frontend build detected');
}

// ─────────────────────────────────────────────
// CORE MIDDLEWARE
// ─────────────────────────────────────────────
app.use(requestId);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(globalLimiter);

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://aischoolonair.onrender.com',
  process.env.CLIENT_URL,
  process.env.PROD_CLIENT_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);

    logger.warn('CORS blocked', { origin });
    return cb(null, true);
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ─────────────────────────────────────────────
// DATABASE
// ─────────────────────────────────────────────
const db = require('./config/database');

// ─────────────────────────────────────────────
// MODEL BOOTSTRAP (CRITICAL FIXED SET)
// ─────────────────────────────────────────────
const modelPaths = [
  './models/User',
  './models/Subject',
  './models/Topic',
  './models/Subtopic',
  './models/SubtopicProgress',
  './models/PracticeAttempt',
];

for (const m of modelPaths) {
  try {
    const model = require(m);
    if (typeof model === 'function') model(db);
  } catch (e) {
    logger.warn(`Model skipped: ${m} — ${e.message}`);
  }
}

try {
  require('./models/associations');
} catch (e) {
  logger.warn('Associations not loaded');
}

// ─────────────────────────────────────────────
// ENGINE BOOTSTRAP (CRITICAL ORDER FIX)
// ─────────────────────────────────────────────

// 1. EVENT BUS FIRST
const eventBus = require('./services/eventBus');

// 2. WRITE SIDE ENGINE (event listeners)
require('./services/analyticsEventEngine');

// 3. READ SIDE ENGINE (analytics queries)
require('./services/analyticsEngine');

// ─────────────────────────────────────────────
// DB CONNECTION
// ─────────────────────────────────────────────
(async () => {
  try {
    await db.authenticate();
    logger.info('✔ Database connected successfully');
  } catch (err) {
    logger.error('❌ DB connection failed', { error: err.message });
    process.exit(1);
  }
})();

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
const { protect } = require('./middleware/auth');

// ─────────────────────────────────────────────
// SAFE REQUIRE
// ─────────────────────────────────────────────
function safeRequire(p) {
  try {
    return require(p);
  } catch (e) {
    logger.warn(`Missing module: ${p}`);
    return null;
  }
}

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────
const authRoutes = safeRequire('./routes/authRoutes');
const subjectRoutes = safeRequire('./routes/subjectsRoutes');
const topicsRoutes = safeRequire('./routes/topicsRoutes');
const subtopicRoutes = safeRequire('./routes/subtopicRoutes');

const analyticsRoutes = safeRequire('./routes/analyticsRoutes');
const weakTopicRoutes = safeRequire('./routes/weakTopicRoutes');
const recommendationRoutes = safeRequire('./routes/recommendationRoutes');
const sessionRoutes = safeRequire('./routes/sessionRoutes');
const replayRoutes = safeRequire('./routes/eventReplayRoutes');

// ─────────────────────────────────────────────
// STATIC FILES
// ─────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─────────────────────────────────────────────
// ROUTE MOUNTING (CLEAN LAYERED SYSTEM)
// ─────────────────────────────────────────────
if (authRoutes) app.use('/api/auth', authRoutes);

if (subjectRoutes) app.use('/api/subjects', protect, subjectRoutes);
if (topicsRoutes) app.use('/api/topics', protect, topicsRoutes);
if (subtopicRoutes) app.use('/api/subtopics', protect, subtopicRoutes);

// ANALYTICS CORE
if (analyticsRoutes) app.use('/api/analytics', protect, analyticsRoutes);

// INTELLIGENCE LAYER
if (weakTopicRoutes) app.use('/api/weak-topics', protect, weakTopicRoutes);
if (recommendationRoutes) app.use('/api/recommendations', protect, recommendationRoutes);

// SESSION LAYER
if (sessionRoutes) app.use('/api/sessions', protect, sessionRoutes);

// EVENT DEBUG / REPLAY
if (replayRoutes) app.use('/api/replay', protect, replayRoutes);

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok' });
});

// ─────────────────────────────────────────────
// ERROR HANDLER
// ─────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error('Unhandled server error', { error: err.message });
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
  });
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const http = require('http');
const server = http.createServer(app);

// attach realtime engine
const RealtimeEngine = require('./services/realtimeEngine');
new RealtimeEngine(server);

// START
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
