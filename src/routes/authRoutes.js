const express = require('express');
const router = express.Router();
const { showLoginPage, login, forgotPassword, logout } = require('../controllers/authController');

// Auth routes
router.get('/', showLoginPage);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.get('/logout', logout);

module.exports = router; 