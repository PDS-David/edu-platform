'use strict';

const express = require('express');
const router = express.Router();

const controller = require('../controllers/subtopicProgressController');

// all protected in server.js

router.post('/resource', controller.completeResource);
router.post('/practice', controller.completePractice);
router.post('/quiz', controller.completeQuiz);

module.exports = router;
