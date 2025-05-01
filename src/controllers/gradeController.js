const { sql } = require('../config/database');

// Middleware để validate đầu vào
const validateGradeInput = (req, res, next) => {
    const { mahp, diemthi, malop } = req.body;
    if (!mahp || !diemthi || !malop || isNaN(diemthi) || diemthi < 0 || diemthi > 10) {
        return res.status(400).json({ success: false, error: 'Dữ liệu không hợp lệ' });
    }
    next();
};

const addOrUpdateGrade = async (req, res) => {
    const studentId = req.params.id;
    const { mahp, diemthi, malop } = req.body;
    console.log(req.body);

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
        request.input('MASV', sql.VarChar, studentId);
        request.input('MAHP', sql.VarChar, mahp);
        request.input('DIEMTHI', sql.Float, diemthi);
        request.input('MANV', sql.VarChar, req.session.user.MANV);
        console.log(request);
        await request.execute('SP_INS_UPD_BANGDIEM');

        res.json({
            success: true,
            message: 'Cập nhật điểm thành công',
            redirectUrl: `/class/${malop}`
        });
    } catch (err) {
        console.error('Error updating grade:', err);
        let errorMessage = 'Không thể cập nhật điểm';
        if (err.message.includes('quyền quản lý')) {
            errorMessage = 'Bạn không có quyền cập nhật điểm cho lớp này';
        } else if (err.message.includes('Nhân viên không tồn tại')) {
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

const getStudentGrade = async (req, res) => {
    const studentId = req.params.id;
    const { subjectId, password } = req.body; // Assume password is sent via POST

    let connection;
    try {
        if (!subjectId || !password) {
            return res.status(400).json({ success: false, error: 'Thiếu mã học phần hoặc mật khẩu' });
        }

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
        request.input('MASV', sql.VarChar, studentId);
        request.input('MAHP', sql.VarChar, subjectId);
        request.input('MANV', sql.VarChar, req.session.user.MANV);
        request.input('MK', sql.NVarChar, password);

        const result = await request.execute('SP_SEL_BANGDIEM');

        res.json({
            success: true,
            grade: result.recordset[0] || {}
        });
    } catch (err) {
        console.error('Error fetching grade:', err);
        let errorMessage = 'Không thể lấy điểm sinh viên';
        if (err.message.includes('Mật khẩu không chính xác')) {
            errorMessage = 'Mật khẩu không đúng';
        }
        res.status(500).json({ success: false, error: errorMessage });
    } finally {
        if (connection) {
            await connection.close();
            console.log('Database connection closed');
        }
    }
};

const getClassGrades = async (req, res) => {
    const { id: classId } = req.params;

    // Kiểm tra phiên đăng nhập
    if (!req.session.user || !req.session.user.MANV) {
        console.log('Session user missing or MANV undefined:', req.session.user);
        return res.render('class-grades', {
            students: [],
            subjects: [],
            classId,
            staffName: 'Unknown',
            error: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
            BASE_URL: res.locals.BASE_URL
        });
    }

    let connection;
    try {
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

        // Lấy học phần từ SP_SEL_HOCPHAN
        const subjectRequest = connection.request();
        subjectRequest.input('MANV', sql.VarChar, req.session.user.MANV);
        const subjectResult = await subjectRequest.execute('SP_SEL_HOCPHAN');
        const subjects = subjectResult.recordset;

        // Lấy danh sách sinh viên từ SINHVIEN
        const studentRequest = connection.request();
        studentRequest.input('MALOP', sql.VarChar, classId);
        const studentResult = await studentRequest.query(`
            SELECT MASV, HOTEN
            FROM SINHVIEN
            WHERE MALOP = @MALOP
            ORDER BY MASV
        `);
        let studentsArray = studentResult.recordset.map(student => ({
            MASV: student.MASV,
            HOTEN: student.HOTEN,
            grades: {}
        }));

        try {
            // Lấy điểm của lớp
            const gradeRequest = connection.request();
            gradeRequest.input('MALOP', sql.VarChar, classId);
            gradeRequest.input('MANV', sql.VarChar, req.session.user.MANV);
            const gradeResult = await gradeRequest.execute('SP_SEL_DIEMLOP');

            if (gradeResult.recordset && gradeResult.recordset.length > 0) {
                console.log('Grades route - Session user:', req.session.user);
                console.log('Raw grades data:', gradeResult.recordset);

                // Xử lý dữ liệu điểm
                const students = {};
                studentsArray.forEach(student => {
                    students[student.MASV] = {
                        MASV: student.MASV,
                        HOTEN: student.HOTEN,
                        grades: {}
                    };
                });

                gradeResult.recordset.forEach(grade => {
                    if (students[grade.MASV] && grade.MAHP && grade.DIEMTHI !== null) {
                        students[grade.MASV].grades[grade.MAHP] = grade.DIEMTHI;
                    }
                });

                studentsArray = Object.values(students);
            }
        } catch (gradeErr) {
            console.log('No grades found for class:', classId);
            // Continue with empty grades
        }

        res.render('class-grades', {
            students: studentsArray,
            subjects,
            classId,
            staffName: req.session.user.HOTEN || 'Unknown',
            error: null,
            BASE_URL: res.locals.BASE_URL
        });
    } catch (err) {
        console.error('Error fetching class grades:', err);
        let errorMessage = 'Không thể lấy bảng điểm';
        if (err.message.includes('Nhân viên không có quyền quản lý lớp này')) {
            errorMessage = 'Bạn không có quyền xem điểm lớp này';
        } else if (err.message.includes('Nhân viên không tồn tại')) {
            errorMessage = 'Nhân viên không tồn tại';
        }

        // Vẫn cố gắng lấy danh sách sinh viên nếu có lỗi
        try {
            const studentRequest = connection.request();
            studentRequest.input('MALOP', sql.VarChar, classId);
            const studentResult = await studentRequest.query(`
                SELECT MASV, HOTEN
                FROM SINHVIEN
                WHERE MALOP = @MALOP
                ORDER BY MASV
            `);
            const studentsArray = studentResult.recordset.map(student => ({
                MASV: student.MASV,
                HOTEN: student.HOTEN,
                grades: {}
            }));

            res.render('class-grades', {
                students: studentsArray,
                subjects: [],
                classId,
                staffName: req.session.user.HOTEN || 'Unknown',
                error: errorMessage,
                BASE_URL: res.locals.BASE_URL
            });
        } catch (fallbackErr) {
            console.error('Error fetching students fallback:', fallbackErr);
            res.render('class-grades', {
                students: [],
                subjects: [],
                classId,
                staffName: req.session.user.HOTEN || 'Unknown',
                error: 'Không thể lấy danh sách sinh viên: ' + errorMessage,
                BASE_URL: res.locals.BASE_URL
            });
        }
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