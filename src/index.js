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
// Import other routes here...

const app = express();
const PORT = process.env.PORT || 3001;
const BASE_URL = `http://localhost:${PORT}`;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Make BASE_URL available to all views
app.use((req, res, next) => {
    res.locals.BASE_URL = BASE_URL;
    next();
});

// Connect to database
connectDB();

// Routes
app.use('/', authRoutes);  // Add auth routes at root level
app.use('/classes', classRoutes);  // Add class routes
app.use('/student', gradeRoutes);
// Add other routes here...

// Error handling middleware
app.use((req, res, next) => {
    res.status(404).render('error', {
        message: 'Không tìm thấy trang',
        error: { status: 404 }
    });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {
        message: 'Lỗi máy chủ',
        error: { status: 500 }
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on ${BASE_URL}`);
}); 