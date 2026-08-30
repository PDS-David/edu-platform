'use strict';

// server/routes/quizGeneratorRoute.js

const express = require('express');
const router  = express.Router();

const { protect }                  = require('../middleware/auth');
const { aiLimiter }                = require('../middleware/rateLimiter');
const { generateQuiz, submitQuiz } = require('../controllers/quizController');

// Optional subscription guard -- silently skipped if not yet installed
let subscriptionGuard = (_req, _res, next) => next();
try { subscriptionGuard = require('../middleware/subscriptionGuard'); } catch {}

// ---------------------------------------------------------------------------
// GET /api/quiz/generate
// Requires: auth, optional subscription
// ---------------------------------------------------------------------------
router.get('/generate', protect, subscriptionGuard, aiLimiter, generateQuiz);

// ---------------------------------------------------------------------------
// POST /api/quiz/submit
// Requires: auth, optional subscription
//
// Body: {
//   quizId?:  string  (UUID of the quiz being submitted, optional)
//   answers:  Array<{ questionId: string, selectedOptionId: string | null }>
// }
// ---------------------------------------------------------------------------
router.post('/submit', protect, subscriptionGuard, submitQuiz);

module.exports = router;
