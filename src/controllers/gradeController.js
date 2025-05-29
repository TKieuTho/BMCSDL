const { sql, getConnection } = require('../config/database');
const { rsaEncrypt, rsaDecrypt } = require('../utils/crypto');
const { sha1Hash } = require('../utils/crypto');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const KEYS_DIR = path.join(__dirname, '../keys');

const validateGradeInput = (req, res, next) => {
    const { mahp, diemthi, malop } = req.body;
    if (!mahp || !diemthi || !malop || isNaN(diemthi) || diemthi < 0 || diemthi > 10) {
        return res.status(400).json({ success: false, error: 'Dữ liệu không hợp lệ' });
    }
    next();
};

const addOrUpdateGrade = async (req, res) => {
    try {
        console.log('Received request body:', req.body);
        const { masv, mahp, diemthi, malop } = req.body;
        const manv = req.session.user.MANV;

        if (!masv || !mahp || !diemthi || !manv) {
            return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
        }

        // Lấy tên tệp public key
        const pool = await getConnection();
        const getKeyRequest = pool.request();
        getKeyRequest.input('MANV', sql.VarChar, manv);
        const keyResult = await getKeyRequest.query('SELECT PUBKEY FROM NHANVIEN WHERE MANV = @MANV');

        if (!keyResult.recordset[0] || !keyResult.recordset[0].PUBKEY) {
            throw new Error('Không tìm thấy public key của nhân viên');
        }

        const pubkeyName = keyResult.recordset[0].PUBKEY;
        const publicKeyPath = path.join(KEYS_DIR, pubkeyName);
        console.log(`Đang đọc public key từ: ${publicKeyPath}`);

        // Đọc nội dung public key
        const publicKey = await fs.readFile(publicKeyPath, 'utf8');
        console.log('Public key read successfully:', publicKey.substring(0, 50) + '...');

        // Validate public key
        try {
            crypto.createPublicKey({ key: publicKey, format: 'pem', type: 'spki' });
            console.log('Public key validation successful');
        } catch (keyError) {
            console.error('Public key validation failed:', keyError);
            throw new Error('Public key không hợp lệ: ' + keyError.message);
        }

        // Mã hóa điểm thi
        const dataToEncrypt = diemthi.toString();
        console.log('Data to encrypt:', dataToEncrypt);
        const encryptedGrade = rsaEncrypt(dataToEncrypt, publicKey);
        console.log('Grade encrypted successfully');

        // Gọi stored procedure
        await pool.request()
            .input('MASV', sql.VarChar(20), masv)
            .input('MAHP', sql.VarChar(20), mahp)
            .input('DIEMTHI', sql.VarBinary(sql.MAX), Buffer.from(encryptedGrade, 'base64'))
            .input('MANV', sql.VarChar(50), manv)
            .execute('SP_INS_UPD_BANGDIEM');

        console.log('Stored procedure executed successfully');

        // Lấy lại danh sách điểm
        const grades = await pool.request()
            .input('MASV', sql.VarChar(20), masv)
            .input('MAHP', sql.VarChar(20), mahp)
            .input('MANV', sql.VarChar(20), manv)
            .execute('SP_SEL_BANGDIEM');

        res.json({
            success: true,
            message: 'Cập nhật điểm thành công',
            grades: grades.recordset
        });
    } catch (error) {
        console.error('Lỗi khi cập nhật điểm:', error.message, error.stack);
        res.status(500).json({
            error: 'Lỗi khi cập nhật điểm: ' + error.message
        });
    }
};

const getClassGrades = async (req, res) => {
    try {
        if (!req.session.user) return res.redirect('/auth/login');

        const malop = req.params.id;
        const manv = req.session.user.MANV;

        const pool = await getConnection();
        
        // Lấy public key của nhân viên
        const keyRequest = pool.request();
        keyRequest.input('MANV', sql.VarChar, manv);
        const keyResult = await keyRequest.query('SELECT PUBKEY FROM NHANVIEN WHERE MANV = @MANV');

        if (!keyResult.recordset[0] || !keyResult.recordset[0].PUBKEY) {
            throw new Error('Không tìm thấy public key của nhân viên');
        }

        const pubkeyName = keyResult.recordset[0].PUBKEY;
        const privateKeyPath = path.join(KEYS_DIR, `${manv}_private.pem`);
        console.log(`Đang đọc private key từ: ${privateKeyPath}`);
        const privateKey = await fs.readFile(privateKeyPath, 'utf8');

        // Lấy danh sách học phần, sinh viên và điểm
        const subjects = await pool.request().execute('SP_SEL_HOCPHAN');
        const students = await pool.request()
            .input('MALOP', sql.VarChar(20), malop)
            .execute('SP_SEL_SINHVIEN_BY_LOP');
        const grades = await pool.request()
            .input('MALOP', sql.VarChar(20), malop)
            .execute('SP_SEL_BANGDIEM_BY_LOP');

        const decryptedGrades = (grades?.recordset || []).map(grade => {
            try {
                const encryptedGrade = Buffer.from(grade.DIEMTHI).toString('base64');
                const decryptedGrade = rsaDecrypt(encryptedGrade, privateKey);
                return { ...grade, DIEMTHI: parseFloat(decryptedGrade) };
            } catch (error) {
                console.error(`Lỗi giải mã điểm cho ${grade.MASV}, ${grade.MAHP}:`, error.message);
                return { ...grade, DIEMTHI: 'N/A' };
            }
        });

        res.render('class-grades', {
            subjects: subjects?.recordset || [],
            students: JSON.stringify(students?.recordset || []),
            grades: JSON.stringify(decryptedGrades),
            classId: malop,
            staffName: req.session.user.HOTEN,
            BASE_URL: res.locals.BASE_URL
        });
    } catch (error) {
        console.error('Lỗi trong getClassGrades:', error.message, error.stack);
        res.render('class-grades', {
            error: 'Không thể lấy bảng điểm: ' + error.message,
            staffName: req.session.user.HOTEN,
            BASE_URL: res.locals.BASE_URL,
            classId: req.params.id,
            subjects: [],
            students: JSON.stringify([]),
            grades: JSON.stringify([])
        });
    }
};
const getStudentGrade = async (req, res) => {
    const studentId = req.params.id;
    const { subjectId, password } = req.body;

    try {
        if (!subjectId || !password) {
            return res.status(400).json({ success: false, error: 'Thiếu mã học phần hoặc mật khẩu' });
        }

        const pool = await getConnection();
        const manv = req.session.user.MANV;

        // Lấy private key
        const privateKeyPath = path.join(KEYS_DIR, `${manv}_private.pem`);
        const privateKey = await fs.readFile(privateKeyPath, 'utf8');

        // Xác thực mật khẩu
        const hashedPassword = sha1Hash(password);
        const authRequest = pool.request();
        authRequest.input('MANV', sql.VarChar, manv);
        authRequest.input('MK', sql.VarBinary, hashedPassword);
        const authResult = await authRequest.query('SELECT 1 FROM NHANVIEN WHERE MANV = @MANV AND MK = @MK');
        if (!authResult.recordset[0]) {
            throw new Error('Mật khẩu không chính xác');
        }

        // Lấy điểm
        const request = pool.request();
        request.input('MASV', sql.VarChar, studentId);
        request.input('MAHP', sql.VarChar, subjectId);
        request.input('MANV', sql.VarChar, manv);
        const result = await request.execute('SP_SEL_BANGDIEM');

        if (!result.recordset[0]) {
            return res.json({ success: true, grade: null });
        }

        // Giải mã điểm
        const encryptedGrade = Buffer.from(result.recordset[0].DIEMTHI).toString('base64');
        const decryptedGrade = rsaDecrypt(encryptedGrade, privateKey);

        res.json({
            success: true,
            grade: { ...result.recordset[0], DIEMTHI: parseFloat(decryptedGrade) }
        });
    } catch (err) {
        console.error('Lỗi lấy điểm:', err.message, err.stack);
        let errorMessage = 'Không thể lấy điểm sinh viên';
        if (err.message.includes('Mật khẩu không chính xác')) {
            errorMessage = 'Mật khẩu không đúng';
        }
        res.status(500).json({ success: false, error: errorMessage });
    }
};
const getSubjects = async (req, res) => {
    let connection;
    try {
        // Tạo kết nối mới
        connection = await sql.connect({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: 'QLSVNhom',
            port: 1433,
            options: {
                encrypt: true,
                trustServerCertificate: true,
                enableArithAbort: true
            }
        });

        const request = connection.request();
        request.input('MANV', sql.VarChar, req.session.user.MANV);

        const result = await request.execute('SP_SEL_HOCPHAN');

        res.json({
            success: true,
            subjects: result.recordset
        });
    } catch (err) {
        console.error('Error fetching subjects:', err);
        let errorMessage = 'Không thể lấy danh sách học phần';
        if (err.message.includes('Nhân viên không tồn tại')) {
            errorMessage = 'Nhân viên không tồn tại';
        }
        res.status(500).json({ success: false, error: errorMessage });
    } finally {
        if (connection) {
            await connection.close();
            console.log('Database connection closed');
        }
    }
};
module.exports = {
    addOrUpdateGrade,
    getStudentGrade,
    getClassGrades,
    validateGradeInput,
    getSubjects
}; 