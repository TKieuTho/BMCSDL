const { sql } = require('../config/database');

const listClasses = async (req, res) => {
    if (!req.session.user || !req.session.user.MANV) {
        console.log('Session user missing or MANV undefined:', req.session.user);
        return res.redirect('/auth/login');
    }

    try {
        const pool = await sql.connect();
        const request = pool.request();
        request.input('MANV', sql.VarChar, req.session.user.MANV);

        console.log('MANV from session:', req.session.user.MANV);

        const result = await request.execute('SP_SEL_LOP_BY_MANV');

        console.log('Query result:', result);
        console.log('Classes data:', result.recordset);

        res.render('classes', {
            classes: result.recordset || [],
            staffName: req.session.user.HOTEN,
            BASE_URL: process.env.BASE_URL || 'http://localhost:3001',
            error: null
        });
    } catch (err) {
        console.error('Error fetching classes:', err);
        res.render('classes', {
            classes: [],
            staffName: req.session.user.HOTEN || 'Unknown',
            BASE_URL: process.env.BASE_URL || 'http://localhost:3001',
            error: 'Không thể lấy danh sách lớp'
        });
    }
};
const getClassDetails = async (req, res) => {
    try {
        const classId = req.params.id;
        const pool = await sql.connect();
        
        // Get students in the class using stored procedure
        const request = pool.request();
        request.input('MALOP', sql.VarChar, classId);
        const result = await request.execute('SP_SEL_SINHVIEN_BY_LOP');

        // Get list of subjects for grade input
        const subjectsRequest = pool.request();
        const subjectsResult = await subjectsRequest.query`
            SELECT * FROM HOCPHAN
        `;
        
        res.render('class-details', {
            students: result.recordset,
            subjects: subjectsResult.recordset,
            classId: classId,
            staffName: req.session.user.HOTEN,
            error: null
        });
    } catch (err) {
        console.error('Error fetching class details:', err);
        res.render('class-details', {
            error: 'Không thể lấy thông tin lớp',
            students: [],
            subjects: [],
            classId: null,
            staffName: req.session.user.HOTEN
        });
    }
};

const addStudent = async (req, res) => {
    const classId = req.params.id;
    const { masv, hoten, ngaysinh, diachi, tendn, matkhau } = req.body;

    try {
        const pool = await sql.connect();
        const request = pool.request();
        request.input('MASV', sql.VarChar, masv);
        request.input('HOTEN', sql.NVarChar, hoten);
        request.input('NGAYSINH', sql.Date, ngaysinh);
        request.input('DIACHI', sql.NVarChar, diachi);
        request.input('MALOP', sql.VarChar, classId);
        request.input('TENDN', sql.NVarChar, tendn);
        request.input('MK', sql.NVarChar, matkhau);
        request.input('MANV', sql.VarChar, req.session.user.MANV);

        await request.execute('SP_INS_SINHVIEN');

        res.redirect(`/class/${classId}`);
    } catch (err) {
        console.error('Error adding student:', err);
        res.status(500).json({ error: 'Không thể thêm sinh viên' });
    }
};

const updateStudent = async (req, res) => {
    const studentId = req.params.id;
    const { hoten, ngaysinh, diachi, malop } = req.body;

    try {
        const pool = await sql.connect();
        const request = pool.request();
        request.input('MASV', sql.VarChar, studentId);
        request.input('HOTEN', sql.NVarChar, hoten);
        request.input('NGAYSINH', sql.Date, ngaysinh);
        request.input('DIACHI', sql.NVarChar, diachi);
        request.input('MANV', sql.VarChar, req.session.user.MANV);

        await request.execute('SP_UPD_SINHVIEN');

        res.redirect(`/class/${malop}`);
    } catch (err) {
        console.error('Error updating student:', err);
        res.status(500).json({ error: 'Không thể cập nhật thông tin sinh viên' });
    }
};

module.exports = {
    listClasses,
    getClassDetails,
    addStudent,
    updateStudent
}; 