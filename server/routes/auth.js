const express = require('express');
const router = express.Router();
const { register, login, getMe, updatePassword } = require('../controllers/auth');
const { protect } = require('../middleware/auth');

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.get('/me', protect, getMe);
router.put('/password', protect, updatePassword);

module.exports = router;
