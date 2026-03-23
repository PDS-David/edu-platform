const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
  res.json({ success: true, message: 'Placeholder endpoint' });
});

module.exports = router;
