const { sql, getConnection } = require('../config/database');

const listClasses = async (req, res) => {
    if (!req.session.user || !req.session.user.MANV) {
        console.log('Session user missing or MANV undefined:', req.session.user);
        return res.redirect('/auth/login');
    }

    let connection;
    try {
        connection = await getConnection();
        const request = connection.request();
        request.input('MANV', sql.VarChar, req.session.user.MANV);

        console.log('MANV from session:', req.session.user.MANV);

        const result = await request.execute('SP_SEL_LOP_BY_MANV');

        console.log('Query result:', result);
        console.log('Classes data:', result.recordset);

        res.render('classes', {
            classes: result.recordset || [],
            staffName: req.session.user.HOTEN,
            BASE_URL: res.locals.BASE_URL || 'http://localhost:3001',
            error: null
        });
    } catch (err) {
        console.error('Error fetching classes:', err);
        res.render('classes', {
            classes: [],
            staffName: req.session.user.HOTEN || 'Unknown',
            BASE_URL: res.locals.BASE_URL || 'http://localhost:3001',
            error: 'Không thể lấy danh sách lớp'
        });
    } finally {
        if (connection) {
            try {
                connection.release(); // Release the connection back to the pool
                console.log('Database connection released back to pool');
            } catch (releaseErr) {
                console.error('Error releasing connection:', releaseErr);
            }
        }
    }
};
const getClassDetails = async (req, res) => {
    let connection;
    try {
        const classId = req.params.id;
        
        // Get connection from pool
        connection = await getConnection();
        console.log('Database connection established for class details');
        
        // Get students in the class using stored procedure
        const request = connection.request();
        request.input('MALOP', sql.VarChar, classId);
        const result = await request.execute('SP_SEL_SINHVIEN_BY_LOP');
        console.log('Students fetched successfully');

        // Get list of subjects for grade input
        const subjectsRequest = connection.request();
        subjectsRequest.input('MANV', sql.VarChar, req.session.user.MANV);
        const subjectsResult = await subjectsRequest.execute('SP_SEL_HOCPHAN');
        console.log('Subjects fetched successfully');
        
        res.render('class-details', {
            students: result.recordset || [],
            subjects: subjectsResult.recordset || [],
            classId: classId,
            staffName: req.session.user.HOTEN,
            error: null,
            BASE_URL: res.locals.BASE_URL
        });
    } catch (err) {
        console.error('Error fetching class details:', err);
        let errorMessage = 'Không thể lấy thông tin lớp';
        
        if (err.message.includes('quyền quản lý')) {
            errorMessage = 'Bạn không có quyền xem thông tin lớp này';
        } else if (err.message.includes('Nhân viên không tồn tại')) {
            errorMessage = 'Nhân viên không tồn tại';
        }

        res.render('class-details', {
            error: errorMessage,
            students: [],
            subjects: [],
            classId: req.params.id,
            staffName: req.session.user.HOTEN,
            BASE_URL: res.locals.BASE_URL
        });
    } finally {
        if (connection) {
            try {
                connection.release(); // Release the connection back to the pool
                console.log('Database connection released back to pool');
            } catch (releaseErr) {
                console.error('Error releasing connection:', releaseErr);
            }
        }
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
    const classId = req.params.classId; // MALOP từ URL
    const { masv, hoten, ngaysinh, diachi, malop } = req.body; // MASV từ body

    // Kiểm tra MASV
    if (!masv) {
        const errorMessage = 'Thiếu mã sinh viên (MASV)';
        console.error(errorMessage, { params: req.params, body: req.body });
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(400).json({ success: false, error: errorMessage });
        }
        return res.status(400).render('class-details', {
            error: errorMessage,
            students: [],
            subjects: [],
            classId: classId || malop || 'unknown',
            staffName: req.session.user?.HOTEN || 'Unknown',
            BASE_URL: res.locals.BASE_URL
        });
    }

    // Kiểm tra dữ liệu đầu vào
    if (!hoten || !ngaysinh || !diachi || !malop) {
        const errorMessage = 'Vui lòng cung cấp đầy đủ thông tin: họ tên, ngày sinh, địa chỉ, mã lớp';
        console.error(errorMessage, { body: req.body });
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(400).json({ success: false, error: errorMessage });
        }
        return res.status(400).render('class-details', {
            error: errorMessage,
            students: [],
            subjects: [],
            classId: classId || malop || 'unknown',
            staffName: req.session.user?.HOTEN || 'Unknown',
            BASE_URL: res.locals.BASE_URL
        });
    }

    // Kiểm tra định dạng ngày sinh
    const parsedDate = new Date(ngaysinh);
    if (isNaN(parsedDate)) {
        const errorMessage = 'Ngày sinh không hợp lệ. Vui lòng sử dụng định dạng YYYY-MM-DD';
        console.error(errorMessage, { ngaysinh });
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(400).json({ success: false, error: errorMessage });
        }
        return res.status(400).render('class-details', {
            error: errorMessage,
            students: [],
            subjects: [],
            classId: classId || malop,
            staffName: req.session.user?.HOTEN || 'Unknown',
            BASE_URL: res.locals.BASE_URL
        });
    }

    let connection;
    try {
        console.log('Update request:', {
            masv,
            hoten,
            ngaysinh,
            diachi,
            malop,
            classId,
            manv: req.session.user?.MANV
        });

        // Get connection from pool
        connection = await getConnection();

        const request = connection.request();
        request.input('MASV', sql.NVarChar, masv);
        request.input('HOTEN', sql.NVarChar, hoten);
        request.input('NGAYSINH', sql.Date, parsedDate);
        request.input('DIACHI', sql.NVarChar, diachi);
        request.input('MANV', sql.VarChar, req.session.user?.MANV);

        const result = await request.execute('SP_UPD_SINHVIEN');

        console.log('Update result:', {
            rowsAffected: result.rowsAffected,
            returnValue: result.returnValue,
            recordset: result.recordset
        });

        // Kiểm tra xem có bản ghi nào được cập nhật không
        if (result.rowsAffected && result.rowsAffected[0] === 0) {
            throw new Error('Không có bản ghi nào được cập nhật.');
        }

        // Lấy danh sách sinh viên cập nhật
        const updatedListRequest = connection.request();
        updatedListRequest.input('MALOP', sql.VarChar, malop);
        const updatedResult = await updatedListRequest.execute('SP_SEL_SINHVIEN_BY_LOP');

        console.log('Updated student list:', {
            rowCount: updatedResult.recordset?.length,
            firstRow: updatedResult.recordset?.[0]
        });

        // Xử lý phản hồi
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.json({
                success: true,
                message: 'Cập nhật thành công',
                data: {
                    students: updatedResult.recordset || []
                }
            });
        }

        return res.redirect(`/class/${malop}`);

    } catch (err) {
        console.error('Error updating student:', err);
        let errorMessage = err.message.includes('quyền')
            ? 'Bạn không có quyền chỉnh sửa thông tin sinh viên này'
            : err.message.includes('Không tồn tại sinh viên')
            ? 'Sinh viên không tồn tại trong hệ thống'
            : err.message.includes('Không có bản ghi nào được cập nhật')
            ? 'Không thể cập nhật thông tin sinh viên'
            : 'Lỗi không xác định khi cập nhật thông tin sinh viên';

        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(500).json({ success: false, error: errorMessage });
        }

        return res.status(500).render('class-details', {
            error: errorMessage,
            students: [],
            subjects: [],
            classId: classId || malop || 'unknown',
            staffName: req.session.user?.HOTEN || 'Unknown',
            BASE_URL: res.locals.BASE_URL
        });
    }
};


module.exports = {
    listClasses,
    getClassDetails,
    addStudent,
    updateStudent
}; 