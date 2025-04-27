const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const { addOrUpdateGrade, getStudentGrades } = require('../controllers/gradeController');

// Routes for grades
router.post('/:id/grade', requireLogin, addOrUpdateGrade);
router.get('/:id/grades', requireLogin, getStudentGrades);

module.exports = router; 