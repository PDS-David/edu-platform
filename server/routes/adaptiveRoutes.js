// server/routes/adaptiveRoutes.js

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const AdaptiveEngine = require('../services/adaptiveEngine');

router.get('/learning-path/:subjectId', protect, async (req, res) => {

  const result = await AdaptiveEngine.generateLearningPath(
    req.user.id,
    req.params.subjectId
  );

  res.json({
    success: true,
    next: AdaptiveEngine.getNextBest(result),
    path: result
  });
});

module.exports = router;
