const { sql, getConnection } = require('../config/database');
const transporter = require('../config/email');
const retry = require('async-retry');
const { sha1Hash } = require('../utils/crypto');

const showLoginPage = (req, res) => {
    res.render('login', { error: null, success: null });
};
const showForgotPasswordPage = (req, res) => {
    res.render('forgot-password', { error: null, success: null }); 
};

const login = async (req, res) => {
    const { manv, password } = req.body;
    console.log('Login attempt:', { manv });

    let connection;
    try {
        // Input validation
        if (!manv || !password) {
            return res.render('login', { error: 'Mã nhân viên và mật khẩu không được để trống' });
        }

        // Hash password with SHA1 (returns binary Buffer)
        const hashedPassword = sha1Hash(password);
        console.log('Hashed password (hex):', hashedPassword.toString('hex').toUpperCase());

        connection = await getConnection();
        const request = connection.request();
        request.input('MANV', sql.VarChar, manv);
        request.input('MATKHAU', sql.VarBinary, hashedPassword); // Use binary Buffer directly

        const result = await request.execute('SP_LOGIN_NHANVIEN');
        console.log('Login result:', result.recordset);

        if (result.recordset && result.recordset.length > 0) {
            const user = result.recordset[0];
            // Set user session with original role logic
            req.session.user = {
                MANV: user.MANV,
                HOTEN: user.HOTEN,
                VAITRO: user.MANV === 'NV01' ? 'ADMIN' : 'EMPLOYEE',
            };
            console.log('Session user set:', req.session.user);

            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.render('login', { error: 'Lỗi lưu phiên đăng nhập' });
                }
                // Redirect based on role
                if (req.session.user.VAITRO === 'ADMIN') {
                    res.redirect('/admin/employees');
                } else {
                    res.redirect('/class');
                }
            });
        } else {
            res.render('login', { error: 'Mã nhân viên hoặc mật khẩu không đúng' });
        }
    } catch (err) {
        console.error('Login error:', err);
        let errorMessage = 'Đăng nhập thất bại. Vui lòng thử lại sau.';
        if (err.message.includes('Nhân viên không tồn tại')) {
            errorMessage = 'Nhân viên không tồn tại';
        } else if (err.message.includes('Mật khẩu không đúng')) {
            errorMessage = 'Mật khẩu không đúng';
        } else if (err.code === 'ETIMEOUT') {
            errorMessage = 'Không thể kết nối đến cơ sở dữ liệu. Vui lòng thử lại sau.';
        } else if (err.code === 'EREQUEST') {
            errorMessage = 'Lỗi truy vấn cơ sở dữ liệu. Vui lòng liên hệ quản trị viên.';
        }
        res.render('login', { error: errorMessage });
    }
};


const forgotPassword = async (req, res) => {
    const { email, manv } = req.body;
    
    try {
        // Generate new password
        const newPassword = generatePassword();
        
        // Hash password using SHA1
        const hashedPassword = sha1Hash(newPassword);

        // Get database connection
        const pool = await getConnection();
        const request = pool.request();
        
        // Set parameters for stored procedure
        request.input('MANV', sql.VarChar, manv);
        request.input('EMAIL', sql.VarChar, email);
        request.input('NEW_MATKHAU', sql.VarBinary, hashedPassword);

        // Execute stored procedure
        await request.execute('SP_FORGOT_PASSWORD_NHANVIEN');

        // Send email with new password
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
            error: 'Có lỗi xảy ra khi xử lý yêu cầu: ' + err.message
        });
    }
};

const logout = (req, res) => {
    req.session.destroy();
    res.redirect('/');
};

// Helper function to generate random password
function generatePassword(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars[Math.floor(Math.random() * chars.length)];
    }
    return password;
}

module.exports = {
    showLoginPage,
    login,
    forgotPassword,
    showForgotPasswordPage, 
    logout
}; 