'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const http = require('http');

const { aiLimiter, globalLimiter } = require('./middleware/rateLimiter');
const logger = require('./config/logger');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');

// ─────────────────────────────────────────────
// ENV LOADING (LOCAL ONLY)
// ─────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
}

// ─────────────────────────────────────────────
// LOG DIRECTORY (PROD SAFETY)
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
    console.error('Missing environment variables:', missing.join(', '));
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
  console.log('Serving frontend from client/dist');
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

const weakTopicRoutes = safeRequire('./routes/weakTopicRoutes');
const recommendationRoutes = safeRequire('./routes/recommendationRoutes');
const sessionRoutes = safeRequire('./routes/sessionRoutes');
const analyticsRoutes = safeRequire('./routes/analyticsRoutes');

const replayRoutes = safeRequire('./routes/eventReplayRoutes');

// ─────────────────────────────────────────────
// ENGINE WRAPPER
// ─────────────────────────────────────────────
function safeInit(name, fn) {
  try {
    fn();
    console.log(`✅ Engine loaded: ${name}`);
  } catch (err) {
    console.error(`❌ Engine failed: ${name}`, err.message);
  }
}

// ─────────────────────────────────────────────
// STARTUP SEQUENCE (CRITICAL)
// ─────────────────────────────────────────────
async function startServer() {
  try {
    // 1. DB CONNECT
    await db.authenticate();
    logger.info('DB connected');

    // 2. MODELS LOAD (AFTER DB)
    const modelPaths = [
      './models/User',
      './models/SubtopicProgress',
    ];

    for (const m of modelPaths) {
      try {
        const model = require(m);
        if (typeof model === 'function') model(db);
      } catch (e) {
        logger.warn(`Model skipped: ${m}`);
      }
    }

    try {
      require('./models/associations');
    } catch {}

    // 3. ENGINE BOOTSTRAP
    safeInit('eventBus', () => require('./services/eventBus'));
    safeInit('analyticsEngine', () => require('./services/analyticsEngine'));
    safeInit('eventEngine', () => require('./services/eventEngine'));
    safeInit('analyticsEventEngine', () => require('./services/analyticsEventEngine'));

    // 4. STATIC FILES
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

    // 5. ROUTES
    if (authRoutes) app.use('/api/auth', authRoutes);

    if (subjectRoutes) app.use('/api/subjects', protect, subjectRoutes);
    if (topicsRoutes) app.use('/api/topics', protect, topicsRoutes);
    if (subtopicRoutes) app.use('/api/subtopics', protect, subtopicRoutes);

    if (analyticsRoutes) app.use('/api/analytics', protect, analyticsRoutes);
    if (weakTopicRoutes) app.use('/api/weak-topics', protect, weakTopicRoutes);
    if (recommendationRoutes) app.use('/api/recommendations', protect, recommendationRoutes);
    if (sessionRoutes) app.use('/api/sessions', protect, sessionRoutes);

    if (replayRoutes) app.use('/api/replay', protect, replayRoutes);

    // 6. HEALTH CHECK
    app.get('/health', (_req, res) => {
      res.json({ success: true });
    });

    // 7. ERROR HANDLER
    app.use((err, _req, res, _next) => {
      logger.error('Unhandled error', { error: err.message });
      res.status(500).json({ success: false });
    });

    // 8. SERVER START
    const PORT = process.env.PORT || 5000;

    if (process.env.ENABLE_WS === 'true') {
      const server = http.createServer(app);

      safeInit('realtimeEngine', () => {
        const RealtimeEngine = require('./services/realtimeEngine');
        new RealtimeEngine(server);
      });

      server.listen(PORT, () => {
        console.log(`🚀 Server running with WS on port ${PORT}`);
      });

    } else {
      const http = require('http');
const realtimeEngine = require('./services/realtimeEngine');

const server = http.createServer(app);

// INIT REALTIME
realtimeEngine.init(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
    }

  } catch (err) {
    logger.error('FATAL SERVER BOOT ERROR', err.message);
    process.exit(1);
  }
}

startServer();
