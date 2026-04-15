const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const ExamIntelligenceEngine = require('../services/examIntelligenceEngine');

router.get('/analysis/:subjectId', protect, async (req, res) => {

  const result = await ExamIntelligenceEngine.analyzeStudentPerformance(
    req.user.id,
    req.params.subjectId
  );

  res.json({
    success: true,
    data: result
  });
});

module.exports = router;
