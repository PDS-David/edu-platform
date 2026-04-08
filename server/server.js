'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { aiLimiter, globalLimiter } = require('./middleware/rateLimiter');
const logger = require('./config/logger');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');

dotenv.config({ path: path.join(__dirname, '.env') });

if (process.env.NODE_ENV === 'production') {
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
}

// ── ENV VALIDATION ────────────────────────────────────────────────────────────
(function validateEnv() {
  const required = [
    'JWT_SECRET',
    'DB_PASSWORD',
    'DATABASE_URL',
  ];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`❌ ${key} missing in .env`);
      process.exit(1);
    }
  }
})();

// ── EXPRESS APP ───────────────────────────────────────────────────────────────
const app = express();

// Trust the first proxy — required for Render, ngrok, and express-rate-limit
app.set('trust proxy', 1);

// ── SERVE REACT STATIC FILES (BEFORE CORS) ───────────────────────────────────
// Must be registered first so JS/CSS assets are never subject to CORS checks.
// On Render the frontend is a separate Static Site service, so clientDist
// won't exist there — this block only activates in local/ngrok mode.
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  console.log('✅ Serving React frontend from client/dist');
} else {
  console.log('ℹ️  client/dist not found — expecting separate frontend service (Render Static Site)');
}

// ── CORE MIDDLEWARE ───────────────────────────────────────────────────────────
app.use(requestId);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(globalLimiter);

// ── CORS ──────────────────────────────────────────────────────────────────────
// Allowed origins: localhost dev + Render frontend URL (set via env vars).
// Add NGROK_URL to server/.env when testing locally through ngrok.
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000',
  process.env.CLIENT_URL,
  process.env.PROD_CLIENT_URL,
  process.env.NGROK_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow server-to-server and same-origin requests (no Origin header)
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      logger.warn('CORS rejected origin', { origin });
      cb(new Error('CORS blocked'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ── DATABASE ──────────────────────────────────────────────────────────────────
const db = require('./config/database');
db.authenticate()
  .then(() => logger.info('DB connected'))
  .catch((err) => logger.error('DB error', { error: err.message }));

// ── AUTH & SUBSCRIPTION MIDDLEWARE ───────────────────────────────────────────
const { protect } = require('./middleware/auth');
let subscriptionGuard = (_req, _res, next) => next();
try {
  subscriptionGuard = require('./middleware/subscriptionGuard');
} catch {}

// ── ROUTES ───────────────────────────────────────────────────────────────────
const authRoutes = require('./routes/authRoutes');
const aiRoutes = require('./routes/aiRoutes');
let aiChatRoute = null;
try {
  aiChatRoute = require('./routes/aiChatRoute');
} catch {}

app.use('/api/auth', authRoutes);
app.use('/api/ai', protect, subscriptionGuard, aiLimiter, aiRoutes);
if (aiChatRoute) {
  app.use('/api/ai', protect, subscriptionGuard, aiLimiter, aiChatRoute);
}

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ success: true, message: 'Server running' });
});

// ── SPA CATCH-ALL (local/ngrok only) ─────────────────────────────────────────
// On Render, the frontend is served by the Static Site service directly.
// This catch-all only activates when client/dist exists (local dev / ngrok).
if (fs.existsSync(clientDist)) {
  app.get('*', (_req, res) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
  });
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

// ── START SERVER ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Local:  http://localhost:${PORT}`);
});
