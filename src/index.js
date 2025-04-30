require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { connectDB } = require('./config/database');

// Import routes
const authRoutes = require('./routes/authRoutes');
const classRoutes = require('./routes/classRoutes');
const gradeRoutes = require('./routes/gradeRoutes');

const app = express();
const PORT = process.env.PORT || 3001;
const BASE_URL = `http://localhost:${PORT}`;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// Set up session BEFORE using it
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Logging middleware AFTER session setup
app.use((req, res, next) => {
    console.log(`Request URL: ${req.originalUrl}, Session:`, req.session.user);
    next();
});

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make BASE_URL available to all views
app.use((req, res, next) => {
    res.locals.BASE_URL = BASE_URL;
    next();
});

// Connect to database
connectDB();

// Routes
app.use('/auth', authRoutes);
app.use('/grades', gradeRoutes);
app.use('/class', classRoutes);

// Root route redirects to login
app.get('/', (req, res) => {
    res.redirect('/auth/login');
});

// Handle direct /login access
app.get('/login', (req, res) => {
    res.redirect('/auth/login');
});

// Error handling middleware
app.use((req, res, next) => {
    res.status(404).render('error', {
        message: 'Không tìm thấy trang',
        error: { status: 404 },
        BASE_URL: BASE_URL
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {
        message: 'Đã xảy ra lỗi server',
        error: { status: 500 },
        BASE_URL: BASE_URL
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on ${BASE_URL}`);
});
