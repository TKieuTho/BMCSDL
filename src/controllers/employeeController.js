const { sql, getConnection } = require('../config/database');
const { sha1Hash, generateRSAKeyPairFromMK, rsaEncrypt, rsaDecrypt } = require('../utils/crypto');
const fs = require('fs').promises;
const path = require('path');

const KEYS_DIR = path.join(__dirname, '../keys');
fs.mkdir(KEYS_DIR, { recursive: true }).catch(console.error);

// Thêm nhân viên mới
const addEmployee = async (req, res) => {
    const { manv, hoten, email, luongcb, tendn, matkhau } = req.body;
    console.log('Request body:', req.body);
    console.log('Parsed values:', {
        manv,
        hoten,
        email,
        luongcb,
        tendn,
        matkhau: matkhau ? '******' : undefined
    });
    try {
        if (!manv || !hoten || !email || !luongcb || !tendn || !matkhau) {
            console.log('Missing required fields:', {
                manv: !manv,
                hoten: !hoten,
                email: !email,
                luongcb: !luongcb,
                tendn: !tendn,
                matkhau: !matkhau
            });
            throw new Error('Thiếu thông tin bắt buộc');
        }
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(email)) {
            throw new Error('Email không hợp lệ');
        }
        if (isNaN(luongcb) || parseFloat(luongcb) <= 0) {
            throw new Error('Lương phải là số dương');
        }
        // Tạo cặp khóa RSA từ MK (matkhau)
        const { publicKey, privateKey } = await generateRSAKeyPairFromMK(matkhau);
        const pubkeyName = `${manv}_public.pem`;
        const privateKeyName = `${manv}_private.pem`;
        const pubkeyPath = path.join(KEYS_DIR, pubkeyName);
        const privateKeyPath = path.join(KEYS_DIR, privateKeyName);
        await fs.writeFile(pubkeyPath, publicKey);
        await fs.writeFile(privateKeyPath, privateKey);

        // Mã hóa mật khẩu và lương
        const hashedPassword = sha1Hash(matkhau);
        console.log('Mã hóa mật khẩu (hex):', hashedPassword.toString('hex').toUpperCase());
        const encryptedSalary = rsaEncrypt(luongcb.toString(), publicKey);

        // Thêm vào cơ sở dữ liệu
        const pool = await getConnection();
        const request = pool.request();
        request.input('MANV', sql.VarChar, manv);
        request.input('HOTEN', sql.NVarChar, hoten);
        request.input('EMAIL', sql.VarChar, email);
        request.input('LUONG', sql.VarBinary, Buffer.from(encryptedSalary, 'base64'));
        request.input('TENDN', sql.NVarChar, tendn);
        request.input('MK', sql.VarBinary, hashedPassword);
        request.input('PUB', sql.NVarChar, pubkeyName);

        await request.execute('SP_INS_PUBLIC_ENCRYPT_NHANVIEN');

        // Lấy danh sách nhân viên đã cập nhật
        const listRequest = pool.request();
        const result = await listRequest.execute('SP_SEL_ALL_NHANVIEN');

        // Giải mã lương cho danh sách
        const employees = await Promise.all(result.recordset.map(async (employee) => {
            let decryptedSalary = 'N/A';
            try {
                if (employee.LUONG && employee.PUBKEY) {
                    const privateKeyPath = path.join(KEYS_DIR, employee.MANV + '_private.pem');
                    const privateKey = await fs.readFile(privateKeyPath, 'utf8');
                    const encryptedSalary = Buffer.from(employee.LUONG).toString('base64');
                    decryptedSalary = rsaDecrypt(encryptedSalary, privateKey);
                }
            } catch (decryptError) {
                console.error(`Lỗi giải mã lương cho ${employee.MANV}:`, decryptError.message, decryptError.stack);
            }
            return { ...employee, LUONG: decryptedSalary };
        }));

        res.render('admin/employees', {
            employees: employees,
            staffName: req.session.user.HOTEN,
            BASE_URL: res.locals.BASE_URL,
            error: null,
            success: 'Thêm nhân viên thành công',
        });
    } catch (err) {
        console.error('Lỗi thêm nhân viên:', err);
        // ... (giữ nguyên xử lý lỗi như trước)
    }
};

// Danh sách nhân viên
const listEmployees = async (req, res) => {
    try {
        if (req.session.user.VAITRO !== 'ADMIN') {
            return res.status(403).render('admin/employees', {
                employees: [],
                staffName: req.session.user.HOTEN,
                BASE_URL: res.locals.BASE_URL,
                error: 'Yêu cầu quyền admin để xem danh sách nhân viên',
            });
        }

        const pool = await getConnection();
        const request = pool.request();
        console.log('Đang thực thi SP_SEL_ALL_NHANVIEN...');
        const result = await request.execute('SP_SEL_ALL_NHANVIEN');
        console.log('Kết quả SP_SEL_ALL_NHANVIEN:', result.recordset.length, 'nhân viên');

        const employees = await Promise.all(result.recordset.map(async (employee) => {
            let decryptedSalary = 'N/A';
            try {
                console.log(`Xử lý nhân viên ${employee.MANV}:`, {
                    hasLUONG: !!employee.LUONG,
                    hasPUBKEY: !!employee.PUBKEY,
                    LUONGType: employee.LUONG ? typeof employee.LUONG : 'undefined',
                    PUBKEY: employee.PUBKEY,
                });

                if (!employee.LUONG || !employee.PUBKEY) {
                    console.warn(`Thiếu LUONG hoặc PUBKEY cho ${employee.MANV}`);
                    return { ...employee, LUONG: decryptedSalary };
                }

                const privateKeyPath = path.join(KEYS_DIR, `${employee.MANV}_private.pem`);
                console.log(`Đang đọc khóa riêng: ${privateKeyPath}`);
                const privateKey = await fs.readFile(privateKeyPath, 'utf8');
                if (!(employee.LUONG instanceof Buffer)) {
                    console.error(`LUONG không phải Buffer cho ${employee.MANV}:`, typeof employee.LUONG);
                    return { ...employee, LUONG: decryptedSalary };
                }

                const encryptedSalary = Buffer.from(employee.LUONG).toString('base64');
                console.log(`Đang giải mã lương cho ${employee.MANV}`);
                decryptedSalary = rsaDecrypt(encryptedSalary, privateKey);
                console.log(`Giải mã thành công cho ${employee.MANV}: ${decryptedSalary}`);
            } catch (decryptError) {
                console.error(`Lỗi giải mã lương cho ${employee.MANV}:`, decryptError.message, decryptError.stack);
            }
            return { ...employee, LUONG: decryptedSalary };
        }));

        console.log('Danh sách nhân viên đã xử lý:', employees);
        res.render('admin/employees', {
            employees: employees,
            staffName: req.session.user.HOTEN,
            BASE_URL: res.locals.BASE_URL,
            error: null,
        });
    } catch (err) {
        console.error('Lỗi chi tiết:', {
            message: err.message,
            code: err.code,
            stack: err.stack,
        });
        res.render('admin/employees', {
            employees: [],
            staffName: req.session.user.HOTEN,
            BASE_URL: res.locals.BASE_URL,
            error: 'Không thể lấy danh sách nhân viên',
        });
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

        // Update employee using SP_UPD_PUBLIC_ENCRYPT_NHANVIEN
        const result = await pool.request()
            .input('MANV', sql.VarChar, manv)
            .input('HOTEN', sql.NVarChar, hoten)
            .input('EMAIL', sql.VarChar, email)
            .input('LUONG', sql.VarBinary, Buffer.from(encryptedSalary, 'base64'))
            .input('TENDN', sql.NVarChar, tendn)
            .input('MATKHAU', sql.VarBinary, hashedPassword)
            .input('PUBKEY', sql.VarChar, pubkeyName)
            .execute('SP_UPD_NHANVIEN');

        // Fetch updated employee list and decrypt salaries
        const listResult = await pool.request().execute('SP_SEL_ALL_NHANVIEN');
        
        // Decrypt salaries for the employee list
        const employees = await Promise.all(listResult.recordset.map(async (employee) => {
            let decryptedSalary = 'N/A';
            try {
                if (employee.LUONG && employee.PUBKEY) {
                    const privateKeyPath = path.join(KEYS_DIR, employee.MANV + '_private.pem');
                    const privateKey = await fs.readFile(privateKeyPath, 'utf8');
                    const encryptedSalary = Buffer.from(employee.LUONG).toString('base64');
                    decryptedSalary = rsaDecrypt(encryptedSalary, privateKey);
                }
            } catch (decryptError) {
                console.error(`Lỗi giải mã lương cho ${employee.MANV}:`, decryptError.message);
            }
            return { ...employee, LUONG: decryptedSalary };
        }));

        res.render('admin/employees', {
            employees: employees,
            staffName: req.session.user.HOTEN,
            BASE_URL: res.locals.BASE_URL,
            error: null,
            success: 'Cập nhật nhân viên thành công',
        });
    } catch (error) {
        console.error('Lỗi khi cập nhật nhân viên:', error);
        try {
            const pool = await getConnection();
            const listResult = await pool.request().execute('SP_SEL_ALL_NHANVIEN');
            
            // Decrypt salaries even in error case
            const employees = await Promise.all(listResult.recordset.map(async (employee) => {
                let decryptedSalary = 'N/A';
                try {
                    if (employee.LUONG && employee.PUBKEY) {
                        const privateKeyPath = path.join(KEYS_DIR, employee.MANV + '_private.pem');
                        const privateKey = await fs.readFile(privateKeyPath, 'utf8');
                        const encryptedSalary = Buffer.from(employee.LUONG).toString('base64');
                        decryptedSalary = rsaDecrypt(encryptedSalary, privateKey);
                    }
                } catch (decryptError) {
                    console.error(`Lỗi giải mã lương cho ${employee.MANV}:`, decryptError.message);
                }
                return { ...employee, LUONG: decryptedSalary };
            }));

            res.render('admin/employees', {
                employees: employees,
                staffName: req.session.user.HOTEN,
                BASE_URL: res.locals.BASE_URL,
                error: 'Lỗi khi cập nhật nhân viên: ' + error.message,
                success: null
            });
        } catch (listError) {
            console.error('Lỗi khi lấy danh sách nhân viên:', listError);
            res.status(500).render('error', {
                message: 'Đã xảy ra lỗi server',
                error: { status: 500 },
                BASE_URL: res.locals.BASE_URL
            });
        }
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