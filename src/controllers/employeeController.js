const { sql, getConnection } = require('../config/database');
const { sha1Hash, generateRSAKeyPair, rsaEncrypt } = require('../utils/crypto');
const fs = require('fs').promises;
const path = require('path');

const KEYS_DIR = path.join(__dirname, '../keys');
fs.mkdir(KEYS_DIR, { recursive: true }).catch(console.error);

// List all employees
const listEmployees = async (req, res) => {
    try {
        const pool = await getConnection();
        const request = pool.request();
        const result = await request.execute('SP_SEL_ALL_NHANVIEN');

        res.render('admin/employees', {
            employees: result.recordset || [],
            staffName: req.session.user.HOTEN,
            BASE_URL: res.locals.BASE_URL,
            error: null,
        });
    } catch (err) {
        console.error('Error details:', {
            message: err.message,
            code: err.code,
            state: err.state,
            class: err.class,
            lineNumber: err.lineNumber,
            serverName: err.serverName,
            procName: err.procName,
        });
        res.render('admin/employees', {
            employees: [],
            staffName: req.session.user.HOTEN,
            BASE_URL: res.locals.BASE_URL,
            error: 'Không thể lấy danh sách nhân viên',
        });
    }
};

// Add new employee
const addEmployee = async (req, res) => {
    const { manv, hoten, email, luongcb, tendn, matkhau } = req.body;
    try {
        // Input validation
        if (!manv || !hoten || !email || !luongcb || !tendn || !matkhau) {
            throw new Error('Thiếu thông tin bắt buộc');
        }
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(email)) {
            throw new Error('Email không hợp lệ');
        }
        if (isNaN(luongcb) || parseFloat(luongcb) <= 0) {
            throw new Error('Lương phải là số dương');
        }

        // Generate RSA key pair
        const { publicKey, privateKey } = await generateRSAKeyPair();
        const pubkeyName = `${manv}_public.pem`;
        const pubkeyPath = path.join(KEYS_DIR, pubkeyName);
        await fs.writeFile(pubkeyPath, publicKey);

        // Hash password and encrypt salary
        const hashedPassword = sha1Hash(matkhau); // Binary Buffer
        console.log('Stored password hash (hex):', hashedPassword.toString('hex').toUpperCase());
        const encryptedSalary = rsaEncrypt(luongcb.toString(), publicKey);

        // Insert into database
        const pool = await getConnection();
        const request = pool.request();
        request.input('MANV', sql.VarChar, manv);
        request.input('HOTEN', sql.NVarChar, hoten);
        request.input('EMAIL', sql.VarChar, email);
        request.input('LUONG', sql.VarBinary, Buffer.from(encryptedSalary, 'base64'));
        request.input('TENDN', sql.NVarChar, tendn);
        request.input('MK', sql.VarBinary, hashedPassword); // Binary Buffer
        request.input('PUB', sql.NVarChar, pubkeyName);

        await request.execute('SP_INS_PUBLIC_ENCRYPT_NHANVIEN');

        // Fetch updated employee list
        const listRequest = pool.request();
        const result = await listRequest.execute('SP_SEL_ALL_NHANVIEN');

        res.render('admin/employees', {
            employees: result.recordset || [],
            staffName: req.session.user.HOTEN,
            BASE_URL: res.locals.BASE_URL,
            error: null,
            success: 'Thêm nhân viên thành công',
        });
    } catch (err) {
        console.error('Error adding employee:', err);
        try {
            const pool = await getConnection();
            const request = pool.request();
            const result = await request.execute('SP_SEL_ALL_NHANVIEN');

            res.render('admin/employees', {
                employees: result.recordset || [],
                staffName: req.session.user.HOTEN,
                BASE_URL: res.locals.BASE_URL,
                error: err.message || 'Không thể thêm nhân viên',
            });
        } catch (listErr) {
            console.error('Error getting employee list:', listErr);
            res.render('admin/employees', {
                employees: [],
                staffName: req.session.user.HOTEN,
                BASE_URL: res.locals.BASE_URL,
                error: 'Không thể lấy danh sách nhân viên',
            });
        }
    }
};


// Update employee
const updateEmployee = async (req, res) => {
    const { manv, hoten, email, luongcb, tendn, matkhau } = req.body;
    try {
        // Input validation
        if (!manv || !hoten || !email || !luongcb || !tendn || !matkhau) {
            throw new Error('Vui lòng nhập đầy đủ thông tin');
        }
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(email)) {
            throw new Error('Email không hợp lệ');
        }
        if (isNaN(luongcb) || parseFloat(luongcb) <= 0) {
            throw new Error('Lương phải là số dương');
        }

        // Fetch public key filename
        const pool = await getConnection();
        const getKeyRequest = pool.request();
        getKeyRequest.input('MANV', sql.VarChar, manv);
        const keyResult = await getKeyRequest.query('SELECT PUBKEY FROM NHANVIEN WHERE MANV = @MANV');

        if (!keyResult.recordset[0]) {
            throw new Error('Không tìm thấy thông tin nhân viên');
        }

        const pubkeyName = keyResult.recordset[0].PUBKEY;
        const pubkeyPath = path.join(KEYS_DIR, pubkeyName);
        const publicKey = await fs.readFile(pubkeyPath, 'utf8');

        // Hash password and encrypt salary
        const hashedPassword = sha1Hash(matkhau);
        const encryptedSalary = rsaEncrypt(luongcb.toString(), publicKey);

        // Update employee
        const result = await pool.request()
            .input('MANV', sql.VarChar, manv)
            .input('HOTEN', sql.NVarChar, hoten)
            .input('EMAIL', sql.VarChar, email)
            .input('LUONG', sql.VarBinary, Buffer.from(encryptedSalary, 'base64'))
            .input('TENDN', sql.NVarChar, tendn)
            .input('MATKHAU', sql.VarBinary, Buffer.from(hashedPassword, 'base64'))
            .execute('SP_UPD_NHANVIEN');

        // Fetch updated employee list
        const employees = await pool.request().execute('SP_SEL_ALL_NHANVIEN');
        res.render('admin/employees', {
            employees: employees.recordset,
            staffName: req.session.user.HOTEN,
            BASE_URL: res.locals.BASE_URL,
            success: 'Cập nhật nhân viên thành công',
        });
    } catch (error) {
        console.error('Lỗi khi cập nhật nhân viên:', error);
        const pool = await getConnection();
        const employees = await pool.request().execute('SP_SEL_ALL_NHANVIEN');
        res.render('admin/employees', {
            employees: employees.recordset,
            staffName: req.session.user.HOTEN,
            BASE_URL: res.locals.BASE_URL,
            error: 'Lỗi khi cập nhật nhân viên: ' + error.message,
        });
    }
};

// Delete employee
const deleteEmployee = async (req, res) => {
    const { manv } = req.params;
    try {
        const pool = await getConnection();
        const request = pool.request();
        request.input('MANV', sql.VarChar, manv);
        await request.execute('SP_DEL_NHANVIEN');
        res.json({ success: true, message: 'Xóa nhân viên thành công' });
    } catch (err) {
        console.error('Error deleting employee:', err);
        res.json({ success: false, error: err.message || 'Không thể xóa nhân viên' });
    }
};

module.exports = { listEmployees, addEmployee, updateEmployee, deleteEmployee };