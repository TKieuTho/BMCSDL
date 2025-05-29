const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const classController = require('../controllers/classController');
const { requireLogin, requireAdmin } = require('../middleware/auth');

// Apply middleware to all admin routes
router.use(requireLogin);
router.use(requireAdmin);

// Admin dashboard
router.get('/', (req, res) => {
    res.redirect('/admin/employees');
});

// Employee management routes
router.get('/employees', employeeController.listEmployees);
router.post('/employees/add', employeeController.addEmployee);
router.post('/employees/update', employeeController.updateEmployee);
router.delete('/employees/:manv', employeeController.deleteEmployee);

// Class management routes
router.get('/classes', (req, res) => {
    res.redirect('/class');
});

module.exports = router;