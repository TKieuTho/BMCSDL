const { sql } = require('../config/database');
const transporter = require('../config/email');

const showLoginPage = (req, res) => {
    res.render('login', { error: null, success: null });
};

const login = async (req, res) => {
    const { manv, password } = req.body;
    console.log('Login attempt:', { manv, password });

    try {
        const result = await sql.query`
            SELECT MANV, CONVERT(VARCHAR(MAX), MATKHAU) as MATKHAU_TEXT, HOTEN, EMAIL, PUBKEY
            FROM NHANVIEN 
            WHERE MANV = ${manv}
        `;

        console.log('User check result:', result.recordset);

        if (result.recordset.length === 0) {
            return res.render('login', {
                error: 'Mã nhân viên không tồn tại',
                success: null
            });
        }

        const user = result.recordset[0];
        const storedPassword = user.MATKHAU_TEXT;

        if (storedPassword === password) {
            req.session.user = {
                MANV: user.MANV,
                HOTEN: user.HOTEN,
                EMAIL: user.EMAIL,
                PUBKEY: user.PUBKEY
            };
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
    logout
}; 