const { sql, getConnection } = require('../config/database');
const { sha1Hash } = require('../utils/crypto');

const listClasses = async (req, res) => {
    try {
        const pool = await getConnection();
        const request = pool.request();
        
        // Lấy tham số phân trang
        const page = parseInt(req.query.page) || 1;
        const limit = 9; // Số lớp mỗi trang
        const offset = (page - 1) * limit;
        
        let classesResult;
        let totalClasses = 0;
        
        // Nếu là admin (NV01), lấy tất cả các lớp
        if (req.session.user.MANV === 'NV01') {
            // Lấy tổng số lớp
            const countResult = await request.query(`
                SELECT COUNT(*) as total
                FROM LOP
            `);
            totalClasses = countResult.recordset[0].total;
            
            // Lấy danh sách lớp có phân trang
            classesResult = await request.query(`
                SELECT l.*, nv.HOTEN as TENNGUOIQUANLY
                FROM LOP l
                LEFT JOIN NHANVIEN nv ON l.MANV = nv.MANV
                ORDER BY l.MALOP
                OFFSET ${offset} ROWS
                FETCH NEXT ${limit} ROWS ONLY
            `);
        } else {
            // Nếu là nhân viên thường, chỉ lấy các lớp họ quản lý
            request.input('MANV', sql.VarChar, req.session.user.MANV);
            
            // Lấy tổng số lớp của nhân viên
            const countResult = await request.query(`
                SELECT COUNT(*) as total
                FROM LOP
                WHERE MANV = @MANV
            `);
            totalClasses = countResult.recordset[0].total;
            
            // Lấy danh sách lớp có phân trang
            classesResult = await request.query(`
                SELECT l.*, nv.HOTEN as TENNGUOIQUANLY
                FROM LOP l
                LEFT JOIN NHANVIEN nv ON l.MANV = nv.MANV
                WHERE l.MANV = @MANV
                ORDER BY l.MALOP
                OFFSET ${offset} ROWS
                FETCH NEXT ${limit} ROWS ONLY
            `);
        }
        
        // Tính toán thông tin phân trang
        const totalPages = Math.ceil(totalClasses / limit);
        
        // Nếu là admin, lấy danh sách nhân viên cho dropdown
        let employees = [];
        if (req.session.user.MANV === 'NV01') {
            const employeesResult = await request.execute('SP_SEL_ALL_NHANVIEN');
            employees = employeesResult.recordset || [];
        }

        res.render('classes', {
            classes: classesResult.recordset || [],
            employees: employees,
            staffName: req.session.user.HOTEN,
            BASE_URL: res.locals.BASE_URL,
            isAdmin: req.session.user.MANV === 'NV01',
            error: null,
            currentPage: page,
            totalPages: totalPages,
            totalClasses: totalClasses
        });
    } catch (err) {
        console.error('Error listing classes:', err);
        res.render('classes', {
            classes: [],
            employees: [],
            staffName: req.session.user.HOTEN,
            BASE_URL: res.locals.BASE_URL,
            isAdmin: req.session.user.MANV === 'NV01',
            error: 'Không thể lấy danh sách lớp',
            currentPage: 1,
            totalPages: 1,
            totalClasses: 0
        });
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

        // Lấy danh sách môn học
        const subjectsRequest = connection.request();
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
    let connection;

    try {
        // Validate input
        if (!masv || !hoten || !ngaysinh || !tendn || !matkhau) {
            return res.status(400).json({ 
                success: false, 
                error: 'Vui lòng nhập đầy đủ thông tin bắt buộc' 
            });
        }

        // Validate date format
        const parsedDate = new Date(ngaysinh);
        if (isNaN(parsedDate)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Ngày sinh không hợp lệ' 
            });
        }

        connection = await getConnection();
        const request = connection.request();
        
        // Convert password to binary using SHA1 hash
        const hashedPassword = Buffer.from(sha1Hash(matkhau), 'binary');
        
        request.input('MASV', sql.VarChar(20), masv);
        request.input('HOTEN', sql.NVarChar(100), hoten);
        request.input('NGAYSINH', sql.Date, parsedDate);
        request.input('DIACHI', sql.NVarChar(200), diachi || '');
        request.input('MALOP', sql.VarChar(20), classId);
        request.input('TENDN', sql.NVarChar(100), tendn);
        request.input('MK', sql.VarBinary(sql.MAX), hashedPassword);
        request.input('MANV', sql.VarChar(20), req.session.user.MANV);

        await request.execute('SP_INS_SINHVIEN');

        // Lấy lại danh sách sinh viên sau khi thêm
        const updatedListRequest = connection.request();
        updatedListRequest.input('MALOP', sql.VarChar(20), classId);
        const updatedResult = await updatedListRequest.execute('SP_SEL_SINHVIEN_BY_LOP');

        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.json({
                success: true,
                message: 'Thêm sinh viên thành công',
                data: {
                    students: updatedResult.recordset || []
                }
            });
        }

        res.redirect(`/class/${classId}`);
    } catch (err) {
        console.error('Error adding student:', err);
        let errorMessage = 'Không thể thêm sinh viên';
        
        if (err.message.includes('quyền')) {
            errorMessage = 'Bạn không có quyền thêm sinh viên vào lớp này';
        } else if (err.message.includes('duplicate')) {
            errorMessage = 'Mã sinh viên hoặc tên đăng nhập đã tồn tại';
        }

        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(500).json({ 
                success: false, 
                error: errorMessage 
            });
        }

        res.status(500).render('class-details', {
            error: errorMessage,
            students: [],
            subjects: [],
            classId: classId,
            staffName: req.session.user?.HOTEN || 'Unknown',
            BASE_URL: res.locals.BASE_URL
        });
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

/// Tích hợp assignClassToEmployee với assignMultipleClasses
const assignClassesToEmployee = async (req, res) => {
    const { manv, malop, classes } = req.body;
    
    try {
        const pool = await getConnection();
        
        // Xác định danh sách lớp cần phân công
        let classesToAssign = [];
        
        if (classes && Array.isArray(classes)) {
            // Trường hợp phân công nhiều lớp
            classesToAssign = classes;
        } else if (malop) {
            // Trường hợp phân công một lớp
            classesToAssign = [malop];
        } else {
            return res.status(400).json({
                success: false,
                error: 'Vui lòng chọn ít nhất một lớp để phân công'
            });
        }

        const results = [];
        let successCount = 0;
        
        // Phân công từng lớp
        for (const classId of classesToAssign) {
            try {
                const request = pool.request();
                request.input('MALOP', sql.VarChar, classId);
                request.input('MANV', sql.VarChar, manv);
                
                await request.execute('SP_PhanLopChoNhanVien');
                results.push({ 
                    malop: classId, 
                    success: true,
                    message: 'Phân công thành công'
                });
                successCount++;
            } catch (err) {
                console.error(`Error assigning class ${classId}:`, err);
                results.push({ 
                    malop: classId, 
                    success: false, 
                    error: err.message || 'Lỗi không xác định'
                });
            }
        }
        
        // Lấy danh sách lớp cập nhật
        const updatedClasses = await pool.request().execute('SP_LayDanhSachLop');
        
        const message = successCount === classesToAssign.length 
            ? `Phân công thành công ${successCount} lớp`
            : `Phân công thành công ${successCount}/${classesToAssign.length} lớp`;
        
        res.json({
            success: successCount > 0,
            message: message,
            results: results,
            classes: updatedClasses.recordset || []
        });
        
    } catch (err) {
        console.error('Error in assignClassesToEmployee:', err);
        res.status(500).json({
            success: false,
            error: err.message || 'Không thể phân công lớp'
        });
    }
};

// Lấy danh sách lớp của nhân viên cụ thể
const getEmployeeClasses = async (req, res) => {
    try {
        const manv = req.params.manv;
        const pool = await getConnection();
        const request = pool.request();
        
        // Sử dụng stored procedure SP_SEL_LOP_BY_MANV
        request.input('MANV', sql.VarChar, manv);
        const result = await request.execute('SP_SEL_LOP_BY_MANV');
        
        res.json({
            success: true,
            classes: result.recordset || []
        });
    } catch (err) {
        console.error('Error fetching employee classes:', err);
        res.status(500).json({
            success: false,
            error: 'Không thể lấy danh sách lớp của nhân viên'
        });
    }
};

// Lấy danh sách lớp chưa được phân công
const getUnassignedClasses = async (req, res) => {
    try {
        const pool = await getConnection();
        const request = pool.request();
        
        // Lấy danh sách lớp chưa được phân công (MANV là null)
        const result = await request.query(`
            SELECT MALOP, TENLOP
            FROM LOP
            WHERE MANV IS NULL
        `);
        
        res.json({
            success: true,
            classes: result.recordset || []
        });
    } catch (err) {
        console.error('Error fetching unassigned classes:', err);
        res.status(500).json({
            success: false,
            error: 'Không thể lấy danh sách lớp chưa được phân công'
        });
    }
};

module.exports = {
    listClasses,
    getClassDetails,
    addStudent,
    updateStudent,
    assignClassesToEmployee,
    getEmployeeClasses,
    getUnassignedClasses
}; 