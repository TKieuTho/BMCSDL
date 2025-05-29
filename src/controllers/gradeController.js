const { sql, config } = require('../config/database');
const { getConnection } = require('../config/database');
const { rsaEncrypt, rsaDecrypt } = require('../utils/crypto');
const { sha1Hash } = require('../utils/crypto');

// Middleware để validate đầu vào
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
        
        // Kiểm tra tham số đầu vào
        if (!masv || !mahp || !diemthi || !manv) {
            return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
        }

        // Lấy khóa công khai của nhân viên
        const pool = await getConnection();
        const getKeyRequest = pool.request();
        getKeyRequest.input('MANV', sql.VarChar, manv);
        const keyResult = await getKeyRequest.query('SELECT PUBKEY FROM NHANVIEN WHERE MANV = @MANV');
        
        if (!keyResult.recordset[0] || !keyResult.recordset[0].PUBKEY) {
            throw new Error('Không tìm thấy public key của nhân viên');
        }

        let publicKey = keyResult.recordset[0].PUBKEY;
        
        // DEBUG: Kiểm tra raw data
        console.log('Raw public key type:', typeof publicKey);
        console.log('Raw public key length:', publicKey.length);
        console.log('First 200 chars:', publicKey.substring(0, 200));
        
        // Xử lý encoding và format
        publicKey = publicKey.toString().trim();
        
        // Loại bỏ các ký tự không mong muốn (nếu có)
        publicKey = publicKey.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // Kiểm tra xem key có đúng format không
        if (!publicKey.includes('-----BEGIN PUBLIC KEY-----') || !publicKey.includes('-----END PUBLIC KEY-----')) {
            console.error('Public key không có header/footer đúng format');
            throw new Error('Public key không đúng định dạng PEM');
        }
        
        // Validate public key bằng cách tạo crypto object
        try {
            const keyObject = crypto.createPublicKey({
                key: publicKey,
                format: 'pem',
                type: 'spki'
            });
            console.log('Public key validation successful');
        } catch (keyError) {
            console.error('Public key validation failed:', keyError.message);
            throw new Error('Public key không hợp lệ: ' + keyError.message);
        }

        console.log('Found and validated public key for employee');

        // Mã hóa điểm thi
        const dataToEncrypt = diemthi.toString();
        console.log('Data to encrypt:', dataToEncrypt);
        console.log('Data length:', Buffer.byteLength(dataToEncrypt, 'utf8'), 'bytes');
        
        const encryptedGrade = rsaEncrypt(dataToEncrypt, publicKey);
        console.log('Grade encrypted successfully');

        // Gọi stored procedure
        const result = await pool.request()
            .input('MASV', sql.VarChar(20), masv)
            .input('MAHP', sql.VarChar(20), mahp)
            .input('DIEMTHI', sql.VarBinary(sql.MAX), encryptedGrade)
            .input('MANV', sql.VarChar(20), manv)
            .execute('SP_INS_UPD_BANGDIEM');

        console.log('Stored procedure executed successfully');

        // Lấy lại danh sách điểm sau khi cập nhật
        const grades = await pool.request()
            .input('MASV', sql.VarChar(20), masv)
            .execute('SP_SEL_BANGDIEM');

        res.json({
            success: true,
            message: 'Cập nhật điểm thành công',
            grades: grades.recordset
        });

    } catch (error) {
        console.error('Lỗi khi cập nhật điểm:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi khi cập nhật điểm: ' + error.message
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
        
        // Lấy khóa công khai của nhân viên
        const getKeyRequest = pool.request();
        getKeyRequest.input('MANV', sql.VarChar, req.session.user.MANV);
        const keyResult = await getKeyRequest.query('SELECT PUBKEY FROM NHANVIEN WHERE MANV = @MANV');
        
        if (!keyResult.recordset[0]) {
            throw new Error('Không tìm thấy thông tin nhân viên');
        }

        const publicKey = keyResult.recordset[0].PUBKEY;

        // Lấy điểm đã mã hóa
        const request = pool.request();
        request.input('MASV', sql.VarChar, studentId);
        request.input('MAHP', sql.VarChar, subjectId);
        request.input('MANV', sql.VarChar, req.session.user.MANV);
        request.input('MK', sql.VarBinary, Buffer.from(sha1Hash(password), 'binary'));

        const result = await request.execute('SP_SEL_BANGDIEM');

        if (!result.recordset[0]) {
            return res.json({
                success: true,
                grade: null
            });
        }

        // Giải mã điểm bằng khóa riêng của nhân viên
        const encryptedGrade = result.recordset[0].DIEMTHI;
        const decryptedGrade = rsaDecrypt(encryptedGrade, privateKey);

        res.json({
            success: true,
            grade: {
                ...result.recordset[0],
                DIEMTHI: parseFloat(decryptedGrade)
            }
        });
    } catch (err) {
        console.error('Error fetching grade:', err);
        let errorMessage = 'Không thể lấy điểm sinh viên';
        if (err.message.includes('Mật khẩu không chính xác')) {
            errorMessage = 'Mật khẩu không đúng';
        }
        res.status(500).json({ success: false, error: errorMessage });
    }
};

const getClassGrades = async (req, res) => {
    try {
        // Kiểm tra session
        if (!req.session.user) {
            return res.redirect('/auth/login');
        }

        const malop = req.params.id;
        console.log('Getting grades for class:', malop);

        // Lấy thông tin nhân viên đang đăng nhập
        const pool = await getConnection();
        console.log('Database connection established');
        
        const getKeyRequest = pool.request();
        getKeyRequest.input('MANV', sql.VarChar, req.session.user.MANV);
        const keyResult = await getKeyRequest.query('SELECT PUBKEY FROM NHANVIEN WHERE MANV = @MANV');
        
        if (!keyResult.recordset[0]) {
            console.error('Không tìm thấy thông tin nhân viên');
            return res.render('grades', {
                error: 'Không tìm thấy thông tin nhân viên',
                staffName: req.session.user.HOTEN,
                BASE_URL: res.locals.BASE_URL
            });
        }

        const publicKey = keyResult.recordset[0].PUBKEY;
        console.log('Found public key for employee');

        // Lấy danh sách môn học
        const subjectsRequest = pool.request();
        const subjects = await subjectsRequest.execute('SP_SEL_HOCPHAN');
        console.log('Found subjects:', subjects?.recordset?.length || 0);

        // Lấy danh sách sinh viên của lớp
        console.log('Executing SP_SEL_SINHVIEN_BY_LOP with MALOP:', malop);
        const students = await pool.request()
            .input('MALOP', sql.VarChar(20), malop)
            .execute('SP_SEL_SINHVIEN_BY_LOP');
        console.log('Raw students result:', students);
        console.log('Found students:', students?.recordset?.length || 0);

        // Lấy điểm của lớp
        console.log('Executing SP_SEL_BANGDIEM_BY_LOP with MALOP:', malop);
        const grades = await pool.request()
            .input('MALOP', sql.VarChar(20), malop)
            .execute('SP_SEL_BANGDIEM_BY_LOP');
        console.log('Raw grades result:', grades);
        console.log('Found grades:', grades?.recordset?.length || 0);

        // Giải mã điểm
        const decryptedGrades = (grades?.recordset || []).map(grade => {
            try {
                const decryptedGrade = rsaDecrypt(grade.DIEMTHI, publicKey);
                return {
                    ...grade,
                    DIEMTHI: parseFloat(decryptedGrade)
                };
            } catch (error) {
                console.error('Error decrypting grade:', error);
                return {
                    ...grade,
                    DIEMTHI: 'N/A'
                };
            }
        });

        // Render trang với dữ liệu đã xử lý
        res.render('class-grades', {
            subjects: subjects?.recordset || [],
            students: JSON.stringify(students?.recordset || []),
            grades: JSON.stringify(decryptedGrades),
            classId: malop,
            staffName: req.session.user.HOTEN,
            BASE_URL: res.locals.BASE_URL
        });

    } catch (error) {
        console.error('Error in getClassGrades:', error);
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

// Export tất cả các hàm
module.exports = {
    addOrUpdateGrade,
    getStudentGrade,
    getClassGrades,
    getSubjects,
    validateGradeInput
};