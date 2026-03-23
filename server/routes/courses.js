const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

router.get('/', async (req, res) => {
  res.json({ success: true, message: 'Get all courses endpoint' });
});

router.post('/', protect, authorize('teacher', 'admin'), async (req, res) => {
  res.json({ success: true, message: 'Create course endpoint' });
});

module.exports = router;
