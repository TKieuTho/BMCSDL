const { sql, getConnection } = require('../config/database');
const transporter = require('../config/email');
const retry = require('async-retry');

const showLoginPage = (req, res) => {
    res.render('login', { error: null, success: null });
};
const showForgotPasswordPage = (req, res) => {
    res.render('forgot-password', { error: null, success: null }); // Adjust template name as needed
};

const login = async (req, res) => {
    const { manv, password } = req.body;
    console.log('Login attempt:', { manv });

    let connection;
    try {
        connection = await getConnection();
        const request = connection.request();
        request.input('MANV', sql.VarChar, manv);
        request.input('MATKHAU', sql.NVarChar, password);

        const result = await request.execute('SP_LOGIN_NHANVIEN');

        console.log('Login result:', result.recordset); // Debug log

        if (result.recordset && result.recordset.length > 0) {
            const user = result.recordset[0];
            req.session.user = {
                MANV: user.MANV,
                HOTEN: user.HOTEN,
                password: password // Store password for later use
            };
            console.log('Session user set:', req.session.user);
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                }
                res.redirect('/class');
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
        const result = await sql.query`
            SELECT * FROM NHANVIEN 
            WHERE EMAIL = ${email} AND MANV = ${manv}
        `;

        if (result.recordset.length === 0) {
            return res.json({
                success: false,
                error: 'Mã nhân viên hoặc email không chính xác'
            });
        }

        // Generate new password
        const newPassword = generatePassword();
        
        await sql.query`
            UPDATE NHANVIEN 
            SET MATKHAU = CAST(${newPassword} AS VARBINARY(MAX))
            WHERE MANV = ${manv}
        `;

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