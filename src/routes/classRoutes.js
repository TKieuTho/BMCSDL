const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const { 
    listClasses, 
    getClassDetails, 
    addStudent, 
    updateStudent,
    assignClassesToEmployee,
    getEmployeeClasses,
    getUnassignedClasses
} = require('../controllers/classController');
const { getClassGrades } = require('../controllers/gradeController');

// Apply middleware to all routes
router.use(requireLogin);

// Routes
router.get('/', listClasses);
router.get('/unassigned', getUnassignedClasses);
router.get('/:id', getClassDetails);
router.get('/:id/grades', getClassGrades);
router.post('/:id/grades', getClassGrades);
router.post('/:id/add-student', addStudent);
router.post('/student/:classId/update', updateStudent);

// Employee class management routes
router.get('/employee/:manv', getEmployeeClasses);
router.post('/classes/assign', assignClassesToEmployee);

module.exports = router; 