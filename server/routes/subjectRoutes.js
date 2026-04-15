const express = require('express');
const router = express.Router();
const { getSubjects, getSubject, createSubject } = require('../controllers/subjects');
const { protect, authorize } = require('../middleware/auth');

router.get('/', getSubjects);
router.get('/:id', getSubject);
router.post('/', protect, authorize('admin', 'teacher'), createSubject);

module.exports = router;
