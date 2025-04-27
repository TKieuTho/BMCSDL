const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const { 
    listClasses, 
    getClassDetails, 
    addStudent, 
    updateStudent 
} = require('../controllers/classController');

// Class routes
router.get('/', requireLogin, listClasses);
router.get('/:id', requireLogin, getClassDetails);
router.post('/:id/add-student', requireLogin, addStudent);
router.post('/student/:id/update', requireLogin, updateStudent);

module.exports = router; 