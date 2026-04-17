'use strict';

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const weakEngine = require('../services/weakTopicEngine');
const { success, error } = require('../utils/response');

router.get('/', protect, async (req, res) => {
  try {
    const data = await weakEngine.getWeakTopics(req.user.id);
    return success(res, data, { total: data.length });

  } catch (err) {
    return error(res, 'Failed to fetch weak topics');
  }
});

router.get('/top', protect, async (req, res) => {
  try {
    const data = await weakEngine.getTopWeakTopics(req.user.id);
    return success(res, data);

  } catch (err) {
    return error(res, 'Failed to fetch top weak topics');
  }
});

module.exports = router;
