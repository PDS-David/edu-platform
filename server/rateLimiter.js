// server/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per window
  message: { 
    success: false, 
    error: 'Too many requests, please try again later.' 
  }
});

module.exports = { analyticsLimiter };