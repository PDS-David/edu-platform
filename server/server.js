'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const http = require('http');

const { success, error } = require('./utils/response');

const { aiLimiter, globalLimiter } = require('./middleware/rateLimiter');
const logger = require('./config/logger');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');

// ENV
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
}

// APP
const app = express();
app.set('trust proxy', 1);

// STATIC CLIENT BUILD
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// MIDDLEWARE
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
  origin: (origin, cb) => cb(null, true),
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// DB INIT
require('./config/database');

// AUTH
const { protect } = require('./middleware/auth');

// ROUTES
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', protect, require('./routes/users'));
app.use('/api/admin', protect, require('./routes/adminRoutes'));

app.use('/api/subjects', protect, require('./routes/subjectsRoutes'));
app.use('/api/topics', protect, require('./routes/topicsRoutes'));
app.use('/api/subtopics', protect, require('./routes/subtopicRoutes'));

app.use('/api/weak-topics', protect, require('./routes/weakTopicRoutes'));
app.use('/api/recommendations', protect, require('./routes/recommendationRoutes'));
app.use('/api/sessions', protect, require('./routes/sessionRoutes'));

// HEALTH
app.get('/health', (_req, res) => {
  return success(res, { data: { status: 'ok' } });
});

// ERROR HANDLER
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message });
  return error(res, { message: err.message || 'Server error' });
});

// SERVER
const server = http.createServer(app);

// REALTIME (SAFE)
try {
  const RealtimeEngine = require('./services/realtimeEngine');
  new RealtimeEngine(server);
} catch {
  logger.warn('Realtime not initialized');
}

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
