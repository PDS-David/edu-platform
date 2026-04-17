'use strict';

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const recommendationService = require('../services/recommendationService');
const { success, error } = require('../utils/response');

router.get('/', protect, async (req, res) => {
  try {
    const data = await recommendationService.getRecommendations(req.user.id);
    return success(res, data);

  } catch (err) {
    return error(res, 'Failed to generate recommendations');
  }
});

module.exports = router;
