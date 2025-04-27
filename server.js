require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sql = require('mssql');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3001;
const BASE_URL = `http://localhost:${PORT}`;

// Email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Database configuration
const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: 'QLSVNhom',
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
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
app.set('views', path.join(__dirname, 'views'));

// Make BASE_URL available to all views
app.use((req, res, next) => {
    res.locals.BASE_URL = BASE_URL;
    next();
});

// Database connection
async function connectDB() {
    try {
        await sql.connect(config);
        console.log('Connected to database');
    } catch (err) {
        console.error('Database connection failed:', err);
    }
}

connectDB();

// Middleware to check if user is logged in
const requireLogin = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect(BASE_URL);
    }
    next();
};

// Generate random password
function generatePassword(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars[Math.floor(Math.random() * chars.length)];
    }
    return password;
}

// Routes
app.get('/', (req, res) => {
    res.render('login', { error: null, success: null });
});

// Login route
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('Login attempt:', { username, password }); // Debug log

    try {
        // First, check if user exists
        const userCheck = await sql.query`
            SELECT TENDN, CONVERT(VARCHAR(MAX), MATKHAU) as MATKHAU_TEXT
            FROM NHANVIEN 
            WHERE TENDN = ${username}
        `;
        
        console.log('User check result:', userCheck.recordset); // Debug log

        if (userCheck.recordset.length === 0) {
            return res.render('login', { 
                error: 'Tên đăng nhập không tồn tại',
                success: null 
            });
        }

        const storedPassword = userCheck.recordset[0].MATKHAU_TEXT;
        console.log('Stored password:', storedPassword); // Debug log
        console.log('Input password:', password); // Debug log

        if (storedPassword === password) {
            // If password matches, get user details
            const result = await sql.query`
                SELECT MANV, HOTEN, EMAIL, PUBKEY 
                FROM NHANVIEN 
                WHERE TENDN = ${username}
            `;
            
            req.session.user = result.recordset[0];
            return res.redirect('/classes');
        } else {
            return res.render('login', { 
                error: 'Mật khẩu không chính xác',
                success: null 
            });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.render('login', { 
            error: 'Đăng nhập thất bại: ' + err.message,
            success: null 
        });
    }
});

// Forgot password route
app.post('/forgot-password', async (req, res) => {
    const { email, manv } = req.body;
    
    try {
        // Check if email and MANV match
        const result = await sql.query`
            SELECT * FROM NHANVIEN 
            WHERE EMAIL = ${email} AND MANV = ${manv}
        `;

        if (result.recordset.length === 0) {
            return res.json({
                success: false,
                error: 'Thông tin không chính xác'
            });
        }

        // Generate new password
        const newPassword = generatePassword();
        
        // Update password in database
        await sql.query`
            UPDATE NHANVIEN 
            SET MATKHAU = CAST(${newPassword} AS VARBINARY(MAX))
            WHERE MANV = ${manv}
        `;

        // Send email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Khôi phục mật khẩu - Hệ thống Quản lý Sinh viên',
            html: `
                <h2>Yêu cầu khôi phục mật khẩu</h2>
                <p>Mật khẩu mới của bạn là: <strong>${newPassword}</strong></p>
                <p>Vui lòng đăng nhập và đổi mật khẩu ngay sau khi nhận được email này.</p>
                <p>Trân trọng,<br>Hệ thống Quản lý Sinh viên</p>
            `
        };

        await transporter.sendMail(mailOptions);

        res.json({
            success: true,
            message: 'Mật khẩu mới đã được gửi đến email của bạn'
        });

    } catch (err) {
        console.error('Forgot password error:', err);
        res.json({
            success: false,
            error: 'Có lỗi xảy ra khi xử lý yêu cầu'
        });
    }
});

// Classes route
app.get('/classes', requireLogin, async (req, res) => {
    try {
        const result = await sql.query`
            SELECT * FROM LOP 
            WHERE MANV = ${req.session.user.MANV}
        `;
        res.render('classes', { 
            classes: result.recordset,
            staffName: req.session.user.HOTEN
        });
    } catch (err) {
        res.render('classes', { 
            error: 'Không thể lấy danh sách lớp',
            classes: [],
            staffName: req.session.user.HOTEN
        });
    }
});

// Class details route
app.get('/class/:id', requireLogin, async (req, res) => {
    try {
        const classId = req.params.id;
        
        // Check if the staff manages this class
        const classCheck = await sql.query`
            SELECT * FROM LOP 
            WHERE MALOP = ${classId} 
            AND MANV = ${req.session.user.MANV}
        `;
        
        if (classCheck.recordset.length === 0) {
            return res.redirect('/classes');
        }

        const studentsResult = await sql.query`
            SELECT s.*, l.TENLOP
            FROM SINHVIEN s
            JOIN LOP l ON s.MALOP = l.MALOP
            WHERE s.MALOP = ${classId}
        `;

        const classInfo = classCheck.recordset[0];
        
        res.render('class-details', {
            students: studentsResult.recordset,
            classInfo: classInfo,
            staffName: req.session.user.HOTEN
        });
    } catch (err) {
        console.error('Error fetching class details:', err);
        res.render('class-details', {
            error: 'Không thể lấy thông tin lớp',
            students: [],
            classInfo: null,
            staffName: req.session.user.HOTEN
        });
    }
});

// Add new student route
app.post('/class/:id/add-student', requireLogin, async (req, res) => {
    const classId = req.params.id;
    const { masv, hoten, ngaysinh, diachi, tendn, matkhau } = req.body;

    try {
        // Check if staff manages this class
        const classCheck = await sql.query`
            SELECT * FROM LOP 
            WHERE MALOP = ${classId} 
            AND MANV = ${req.session.user.MANV}
        `;

        if (classCheck.recordset.length === 0) {
            return res.status(403).json({ error: 'Không có quyền thêm sinh viên vào lớp này' });
        }

        await sql.query`
            INSERT INTO SINHVIEN (MASV, HOTEN, NGAYSINH, DIACHI, MALOP, TENDN, MATKHAU)
            VALUES (${masv}, ${hoten}, ${ngaysinh}, ${diachi}, ${classId}, ${tendn}, CAST(${matkhau} AS VARBINARY(MAX)))
        `;

        res.redirect(`/class/${classId}`);
    } catch (err) {
        console.error('Error adding student:', err);
        res.status(500).json({ error: 'Không thể thêm sinh viên' });
    }
});

// Update student route
app.post('/student/:id/update', requireLogin, async (req, res) => {
    const studentId = req.params.id;
    const { hoten, ngaysinh, diachi } = req.body;

    try {
        // Check if staff manages this student's class
        const studentCheck = await sql.query`
            SELECT s.*, l.MANV 
            FROM SINHVIEN s
            JOIN LOP l ON s.MALOP = l.MALOP
            WHERE s.MASV = ${studentId}
        `;

        if (studentCheck.recordset.length === 0 || 
            studentCheck.recordset[0].MANV !== req.session.user.MANV) {
            return res.status(403).json({ error: 'Không có quyền cập nhật sinh viên này' });
        }

        await sql.query`
            UPDATE SINHVIEN 
            SET HOTEN = ${hoten},
                NGAYSINH = ${ngaysinh},
                DIACHI = ${diachi}
            WHERE MASV = ${studentId}
        `;

        res.redirect(`/class/${studentCheck.recordset[0].MALOP}`);
    } catch (err) {
        console.error('Error updating student:', err);
        res.status(500).json({ error: 'Không thể cập nhật thông tin sinh viên' });
    }
});

// Add/Update grade route
app.post('/student/:id/grade', requireLogin, async (req, res) => {
    const studentId = req.params.id;
    const { mahp, diemthi } = req.body;

    try {
        // Check if staff manages this student's class
        const studentCheck = await sql.query`
            SELECT s.*, l.MANV 
            FROM SINHVIEN s
            JOIN LOP l ON s.MALOP = l.MALOP
            WHERE s.MASV = ${studentId}
        `;

        if (studentCheck.recordset.length === 0 || 
            studentCheck.recordset[0].MANV !== req.session.user.MANV) {
            return res.status(403).json({ error: 'Không có quyền nhập điểm cho sinh viên này' });
        }

        // Encrypt grade using staff's public key
        const encryptedGrade = Buffer.from(diemthi.toString()).toString('base64');

        // Check if grade exists
        const gradeCheck = await sql.query`
            SELECT * FROM BANGDIEM
            WHERE MASV = ${studentId} AND MAHP = ${mahp}
        `;

        if (gradeCheck.recordset.length > 0) {
            // Update existing grade
            await sql.query`
                UPDATE BANGDIEM
                SET DIEMTHI = ${Buffer.from(encryptedGrade)}
                WHERE MASV = ${studentId} AND MAHP = ${mahp}
            `;
        } else {
            // Insert new grade
            await sql.query`
                INSERT INTO BANGDIEM (MASV, MAHP, DIEMTHI)
                VALUES (${studentId}, ${mahp}, ${Buffer.from(encryptedGrade)})
            `;
        }

        res.redirect(`/class/${studentCheck.recordset[0].MALOP}`);
    } catch (err) {
        console.error('Error updating grade:', err);
        res.status(500).json({ error: 'Không thể cập nhật điểm' });
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect(BASE_URL);
});

app.listen(PORT, () => {
    console.log(`Server is running on ${BASE_URL}`);
}); 