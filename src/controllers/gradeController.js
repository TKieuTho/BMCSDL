const { sql } = require('../config/database');

const addOrUpdateGrade = async (req, res) => {
    const studentId = req.params.id;
    const { mahp, diemthi } = req.body;

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
            return res.status(403).json({ error: 'Không có quyền nhập điểm cho sinh viên này' });
        }

        // Encrypt grade using staff's public key
        const encryptedGrade = Buffer.from(diemthi.toString()).toString('base64');

        // Check if grade exists
        const gradeCheck = await sql.query`
            SELECT * FROM BANGDIEM
            WHERE MASV = ${studentId} AND MAHP = ${mahp}
        `;

        if (gradeCheck.recordset.length > 0) {
            // Update existing grade
            await sql.query`
                UPDATE BANGDIEM
                SET DIEMTHI = ${Buffer.from(encryptedGrade)}
                WHERE MASV = ${studentId} AND MAHP = ${mahp}
            `;
        } else {
            // Insert new grade
            await sql.query`
                INSERT INTO BANGDIEM (MASV, MAHP, DIEMTHI)
                VALUES (${studentId}, ${mahp}, ${Buffer.from(encryptedGrade)})
            `;
        }

        res.json({ 
            success: true, 
            message: 'Cập nhật điểm thành công',
            redirectUrl: `/class/${studentCheck.recordset[0].MALOP}`
        });
    } catch (err) {
        console.error('Error updating grade:', err);
        res.status(500).json({ 
            success: false,
            error: 'Không thể cập nhật điểm' 
        });
    }
};

const getStudentGrades = async (req, res) => {
    const studentId = req.params.id;

    try {
        const grades = await sql.query`
            SELECT b.*, h.TENHP
            FROM BANGDIEM b
            JOIN HOCPHAN h ON b.MAHP = h.MAHP
            WHERE b.MASV = ${studentId}
        `;

        res.json({
            success: true,
            grades: grades.recordset
        });
    } catch (err) {
        console.error('Error fetching grades:', err);
        res.status(500).json({
            success: false,
            error: 'Không thể lấy điểm sinh viên'
        });
    }
};

module.exports = {
    addOrUpdateGrade,
    getStudentGrades
}; 