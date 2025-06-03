const sql = require('mssql');

const { sha1Hash, generateRSAKeyPairFromMK, rsaEncrypt } = require('../utils/crypto');
const fs = require('fs').promises;
const path = require('path');
const KEYS_DIR = __dirname; // vì script đang nằm trong thư mục keys

// Đảm bảo thư mục tồn tại
fs.mkdir(KEYS_DIR, { recursive: true }).catch(console.error);
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


// Hàm tạo lương ngẫu nhiên
function generateRandomSalary() {
    return 5000000 + Math.floor(Math.random() * 1000000); // từ 5 triệu đến 6 triệu
}

// Hàm xử lý từng nhân viên


async function fixEmployeeKeysAndSalary(manv, matkhau, newSalary) {
    try {
        // 👉 Hash mật khẩu
        const hashedMK = sha1Hash(matkhau);

        // 👉 Tạo khóa từ mật khẩu gốc
        const { publicKey, privateKey } = await generateRSAKeyPairFromMK(matkhau);
        const pubkeyName = `${manv}_public.pem`;
        const privateKeyName = `${manv}_private.pem`;

        // Ghi file khóa
        await fs.writeFile(path.join(KEYS_DIR, pubkeyName), publicKey);
        await fs.writeFile(path.join(KEYS_DIR, privateKeyName), privateKey);
        console.log(`🔐 Đã tạo khóa mới cho ${manv}`);

        // Mã hóa lương
        const encryptedSalary = rsaEncrypt(newSalary.toString(), publicKey);

        // Cập nhật CSDL
        const pool = await getConnection();
        const request = pool.request();
        request.input('MANV', sql.VarChar, manv);
        request.input('LUONG', sql.VarBinary, Buffer.from(encryptedSalary, 'base64'));
        request.input('PUBKEY', sql.NVarChar, pubkeyName);
        request.input('MATKHAU', sql.VarBinary, hashedMK);
        await request.query(`
            UPDATE NHANVIEN
            SET LUONG = @LUONG, 
                PUBKEY = @PUBKEY,
                MATKHAU = @MATKHAU
            WHERE MANV = @MANV
        `);

        console.log(`✅ Đã cập nhật LUONG, PUB và MK cho ${manv}`);
    } catch (error) {
        console.error(`❌ Lỗi sửa ${manv}:`, error.message);
    }
}


// Hàm xử lý toàn bộ nhân viên
async function fixAllEmployees() {
    let pool;
    try {
        pool = await getConnection();
        const result = await pool.request().execute('SP_SEL_ALL_NHANVIEN');

        if (!result.recordset || result.recordset.length === 0) {
            console.log('⚠️ Không có nhân viên nào trong CSDL');
            return;
        }

        console.log(`📋 Tìm thấy ${result.recordset.length} nhân viên`);

        for (const employee of result.recordset) {
            const manv = employee.MANV;
            if (!manv) {
                console.warn('⚠️ Nhân viên thiếu MANV, bỏ qua:', employee);
                continue;
            }

            // Sử dụng '123456' làm mật khẩu mặc định cho tất cả nhân viên
            const matkhau = '123456';
            const newSalary = generateRandomSalary();
            await fixEmployeeKeysAndSalary(manv, matkhau, newSalary);
        }

        console.log('🎉 Hoàn tất cập nhật toàn bộ nhân viên');
    } catch (error) {
        console.error('❌ Lỗi khi xử lý nhân viên:', error.message);
    } finally {
        if (pool) {
            await pool.close().catch(err => console.error('Lỗi đóng kết nối:', err.message));
        }
    }
}

// Gọi hàm chính
fixAllEmployees().catch(error => {
    console.error('❌ Lỗi thực thi:', error.message);
    process.exit(1);
});
