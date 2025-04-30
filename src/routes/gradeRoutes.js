const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const {
    addOrUpdateGrade,
    getStudentGrade,
    getSubjects,
    validateGradeInput
} = require('../controllers/gradeController');

// Routes for grades
router.post('/:id/grade', requireLogin, validateGradeInput, addOrUpdateGrade);
router.get('/:id/grade', requireLogin, getStudentGrade);
router.get('/subjects', requireLogin, getSubjects);

module.exports = router;