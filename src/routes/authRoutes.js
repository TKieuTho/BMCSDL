const express = require('express');
const router = express.Router();
const { showLoginPage, login, showForgotPasswordPage, forgotPassword, logout } = require('../controllers/authController');

// Auth routes
router.get('/login', showLoginPage);
router.post('/login', login);
router.get('/forgot-password', showForgotPasswordPage);
router.post('/forgot-password', forgotPassword);
router.get('/logout', logout);

// Root route of auth redirects to login
router.get('/', (req, res) => {
    res.redirect('/auth/login');
});

module.exports = router; 