const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const { 
    listClasses, 
    getClassDetails, 
    addStudent, 
    updateStudent
} = require('../controllers/classController');
const { getClassGrades } = require('../controllers/gradeController');

// Class routes
router.get('/', requireLogin, listClasses);
router.get('/:id', requireLogin, getClassDetails);
router.get('/:id/grades', requireLogin, getClassGrades);
router.post('/:id/grades', requireLogin, getClassGrades);
router.post('/:id/add-student', requireLogin, addStudent);
router.post('/student/:classId/update', requireLogin, updateStudent);

module.exports = router; 