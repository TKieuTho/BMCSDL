const { sql } = require('../config/database');

const listClasses = async (req, res) => {
    try {
        const result = await sql.query`
            SELECT * FROM LOP 
            WHERE MANV = ${req.session.user.MANV}
        `;
        res.render('classes', { 
            classes: result.recordset,
            staffName: req.session.user.HOTEN,
            error: null
        });
    } catch (err) {
        console.error('Error fetching classes:', err);
        res.render('classes', { 
            error: 'Không thể lấy danh sách lớp',
            classes: [],
            staffName: req.session.user.HOTEN
        });
    }
};

const getClassDetails = async (req, res) => {
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
            staffName: req.session.user.HOTEN,
            error: null
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
};

const addStudent = async (req, res) => {
    const classId = req.params.id;
    const { masv, hoten, ngaysinh, diachi, matkhau } = req.body;

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
            INSERT INTO SINHVIEN (MASV, HOTEN, NGAYSINH, DIACHI, MALOP, MATKHAU)
            VALUES (${masv}, ${hoten}, ${ngaysinh}, ${diachi}, ${classId}, CAST(${matkhau} AS VARBINARY(MAX)))
        `;

        res.redirect(`/class/${classId}`);
    } catch (err) {
        console.error('Error adding student:', err);
        res.status(500).json({ error: 'Không thể thêm sinh viên' });
    }
};

const updateStudent = async (req, res) => {
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
};

module.exports = {
    listClasses,
    getClassDetails,
    addStudent,
    updateStudent
}; 