// server/routes/aiRoutes.js

'use strict';

const express  = require('express');
const router   = express.Router();
const { protect }             = require('../middleware/auth');
const { generateAIResponse }  = require('../services/aiService');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai/chat
// Auth: required (Bearer token)
// Body: { message: string, session_id?: string, context?: object }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/chat', protect, async (req, res) => {
  try {
    console.log('[AI CHAT] Request received');

    const { message, context = {} } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
      });
    }

    console.log('[AI CHAT] User message:', message);
    console.log('[AI CHAT] User:', req.user.email);

    const reply = await generateAIResponse({
      message: message.trim(),
      user:    req.user,
      context,
    });

    return res.status(200).json({
      success: true,
      reply,
    });

  } catch (err) {
    console.error('[AI CHAT ERROR]', err);

    return res.status(500).json({
      success: false,
      error: 'AI request failed',
    });
  }
});

module.exports = router;
