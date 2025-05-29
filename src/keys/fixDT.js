const sql = require('mssql');
const { rsaEncrypt } = require('../utils/crypto');
const fs = require('fs').promises;
const path = require('path');

const KEYS_DIR = __dirname;


const dbConfig = {
    user: 'sa',
    password: 'Thikieutho08',
    server: 'localhost',
    port: 1433,
    database: 'QLSVNhom',
    options: {
        encrypt: false,
        trustServerCertificate: true,
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
    },
};

async function getConnection() {
    const pool = await sql.connect(dbConfig);
    return pool;
}

async function fixAllGrades() {
    let pool;
    try {
        pool = await getConnection();
        console.log('Đang lấy danh sách điểm từ BANGDIEM...');
        const grades = await pool.request().query(`
            SELECT bd.MASV, bd.MAHP, bd.DIEMTHI, sv.MALOP
            FROM BANGDIEM bd
            JOIN SINHVIEN sv ON bd.MASV = sv.MASV
        `);

        if (!grades.recordset || grades.recordset.length === 0) {
            console.log('Không có điểm nào trong bảng BANGDIEM');
            return;
        }

        console.log(`Tìm thấy ${grades.recordset.length} bản ghi điểm`);
        for (const grade of grades.recordset) {
            const { MASV, MAHP, MALOP } = grade;

            // Lấy MANV từ LOP
            const lopRequest = pool.request();
            lopRequest.input('MALOP', sql.VarChar(20), MALOP);
            const lopResult = await lopRequest.query(`
                SELECT MANV FROM LOP WHERE MALOP = @MALOP
            `);
            if (!lopResult.recordset[0] || !lopResult.recordset[0].MANV) {
                console.warn(`Không tìm thấy MANV cho lớp ${MALOP}, bỏ qua ${MASV}, ${MAHP}`);
                continue;
            }
            const MANV = lopResult.recordset[0].MANV;

            // Lấy PUBKEY từ NHANVIEN
            const keyRequest = pool.request();
            keyRequest.input('MANV', sql.VarChar(20), MANV);
            const keyResult = await keyRequest.query(`
                SELECT PUBKEY FROM NHANVIEN WHERE MANV = @MANV
            `);
            if (!keyResult.recordset[0] || !keyResult.recordset[0].PUBKEY) {
                console.warn(`Không tìm thấy PUBKEY cho ${MANV}, bỏ qua ${MASV}, ${MAHP}`);
                continue;
            }

            const pubkeyName = keyResult.recordset[0].PUBKEY;
            const publicKeyPath = path.join(KEYS_DIR, pubkeyName);
            let publicKey;
            try {
                publicKey = await fs.readFile(publicKeyPath, 'utf8');
                console.log(`Đã đọc public key cho ${MANV}: ${publicKeyPath}`);
            } catch (error) {
                console.warn(`Không đọc được public key ${pubkeyName}: ${error.message}, bỏ qua ${MASV}, ${MAHP}`);
                continue;
            }

            // Giả định điểm gốc (thay bằng điểm thực tế)
            const originalGrade = '8.5'; // TODO: Lấy điểm thực tế từ hệ thống hoặc bảng khác
            console.log(`Đang mã hóa điểm ${originalGrade} cho ${MASV}, ${MAHP}`);
            const encryptedGrade = rsaEncrypt(originalGrade, publicKey);

            // Cập nhật DIEMTHI
            const updateRequest = pool.request();
            updateRequest.input('MASV', sql.NVarChar(20), MASV);
            updateRequest.input('MAHP', sql.VarChar(20), MAHP);
            updateRequest.input('DIEMTHI', sql.VarBinary(sql.MAX), Buffer.from(encryptedGrade, 'base64'));
            await updateRequest.query(`
                UPDATE BANGDIEM
                SET DIEMTHI = @DIEMTHI
                WHERE MASV = @MASV AND MAHP = @MAHP
            `);
            console.log(`Đã cập nhật DIEMTHI cho ${MASV}, ${MAHP}`);
        }
        console.log('Hoàn tất sửa điểm');
    } catch (error) {
        console.error('Lỗi khi sửa điểm:', error.message, error.stack);
    } finally {
        if (pool) {
            await pool.close().catch(err => console.error('Lỗi đóng kết nối:', err));
        }
    }
}

fixAllGrades().catch(error => {
    console.error('Lỗi thực thi:', error.message, error.stack);
    process.exit(1);
});