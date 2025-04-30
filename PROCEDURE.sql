
use QLSVNhom
go
SELECT * 
FROM sys.symmetric_keys 
WHERE symmetric_key_id = 101;

SELECT * 
FROM sys.certificates 
WHERE name = 'Cert_NhanVien'

-- Tạo MASTER KEY nếu chưa có
IF NOT EXISTS (SELECT * FROM sys.symmetric_keys WHERE symmetric_key_id = 101)
BEGIN
    CREATE MASTER KEY ENCRYPTION BY PASSWORD = '123456aA@'
END

-- Tạo CERTIFICATE nếu chưa có
IF NOT EXISTS (SELECT * FROM sys.certificates WHERE name = 'Cert_NhanVien')
BEGIN
    CREATE CERTIFICATE Cert_NhanVien
    WITH SUBJECT = 'Certificate for NHANVIEN Encryption'
END

-- Tạo procedure insert nhân viên
IF OBJECT_ID('SP_INS_PUBLIC_NHANVIEN', 'P') IS NOT NULL
    DROP PROCEDURE SP_INS_PUBLIC_NHANVIEN;
GO

CREATE OR ALTER PROCEDURE SP_INS_PUBLIC_NHANVIEN
    @MANV VARCHAR(20),
    @HOTEN NVARCHAR(100),
    @EMAIL VARCHAR(20),
    @LUONGCB INT,
    @TENDN NVARCHAR(100),
    @MK NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @EncryptedSalary VARBINARY(MAX);
    DECLARE @HashedPassword VARBINARY(MAX);
    DECLARE @SQLCreateKey NVARCHAR(MAX);

    -- Tạo ASYMMETRIC KEY nếu chưa có
    IF NOT EXISTS (SELECT * FROM sys.asymmetric_keys WHERE name = @MANV)
    BEGIN
        SET @SQLCreateKey = '
            CREATE ASYMMETRIC KEY [' + @MANV + ']
            WITH ALGORITHM = RSA_2048
            ENCRYPTION BY PASSWORD = ''' + @MK + '''';
        EXEC sp_executesql @SQLCreateKey;
    END

    -- Băm mật khẩu bằng SHA1
    SET @HashedPassword = HASHBYTES('SHA1', @MK);

    -- Mã hóa lương
    SET @EncryptedSalary = EncryptByAsymKey(AsymKey_ID(@MANV),
											CONVERT(VARCHAR, @LUONGCB));

    -- Chèn dữ liệu vào bảng NHANVIEN
    INSERT INTO NHANVIEN (MANV, HOTEN, EMAIL, LUONG, TENDN, MATKHAU, PUBKEY)
    VALUES (@MANV, @HOTEN, @EMAIL, @EncryptedSalary, @TENDN, @HashedPassword, @MANV);
END
GO

-- Tạo procedure truy vấn nhân viên
IF OBJECT_ID('SP_SEL_PUBLIC_NHANVIEN', 'P') IS NOT NULL
	DROP PROCEDURE SP_SEL_PUBLIC_NHANVIEN;
GO

CREATE OR ALTER PROCEDURE SP_SEL_PUBLIC_NHANVIEN
	@TENDN NVARCHAR(100),
	@MK NVARCHAR(100)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @MANV VARCHAR(20);
	DECLARE @EncryptedSalary VARBINARY(MAX);
	DECLARE @PlainSalary VARBINARY(MAX);

	SELECT @MANV = NV.MANV, @EncryptedSalary = NV.LUONG
	FROM NHANVIEN NV
	WHERE NV.TENDN = @TENDN

	IF @MANV IS NULL
	BEGIN
		PRINT N'Không tìm thấy nhân viên,';
		RETURN;
	END
	
	SET @PlainSalary = DecryptByAsymKey(AsymKey_ID(@MANV), @EncryptedSalary, @MK)

	SELECT NV.MANV, NV.HOTEN, NV.EMAIL, CONVERT(VARCHAR(100), @PlainSalary) AS LUONGCB
	FROM NHANVIEN NV
	WHERE NV.TENDN = @TENDN

END
GO

CREATE OR ALTER PROCEDURE SP_LOGIN_NHANVIEN
    @MANV VARCHAR(20),
    @MATKHAU NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @HashedPassword VARBINARY(MAX);
    DECLARE @StoredPassword VARBINARY(MAX);

    -- Mã hóa mật khẩu đầu vào
    SET @HashedPassword = HASHBYTES('SHA1', @MATKHAU);

    -- Lấy mật khẩu lưu trữ từ bảng NHANVIEN
    SELECT @StoredPassword = MATKHAU
    FROM NHANVIEN
    WHERE MANV = @MANV;

    -- Kiểm tra thông tin đăng nhập
    IF @StoredPassword IS NULL
    BEGIN
        PRINT N'Nhân viên không tồn tại';
        RETURN;
    END

    IF @StoredPassword != @HashedPassword
    BEGIN
        PRINT N'Mật khẩu không đúng';
        RETURN;
    END

    PRINT N'Đăng nhập thành công';
END
GO
CREATE OR ALTER PROCEDURE SP_SEL_LOP_BY_MANV
    @MANV VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    -- Kiểm tra nhân viên có tồn tại không
    IF NOT EXISTS (SELECT 1 FROM NHANVIEN WHERE MANV = @MANV)
    BEGIN
        PRINT N'Nhân viên không tồn tại';
        RETURN;
    END

    -- Lấy danh sách lớp do nhân viên quản lý
    SELECT MALOP, TENLOP, MANV
    FROM LOP
    WHERE MANV = @MANV;
END
GO
CREATE OR ALTER PROCEDURE SP_SEL_SINHVIEN_BY_LOP
    @MALOP VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    -- Kiểm tra lớp có tồn tại không
    IF NOT EXISTS (SELECT 1 FROM LOP WHERE MALOP = @MALOP)
    BEGIN
        PRINT N'Lớp không tồn tại';
        RETURN;
    END

    -- Lấy danh sách sinh viên theo lớp
    SELECT MASV, HOTEN, NGAYSINH, DIACHI, MALOP, TENDN
    FROM SINHVIEN
    WHERE MALOP = @MALOP;
END
GO
IF OBJECT_ID('SP_INS_UPD_BANGDIEM', 'P') IS NOT NULL
    DROP PROCEDURE SP_INS_UPD_BANGDIEM;
GO

CREATE OR ALTER PROCEDURE SP_INS_UPD_BANGDIEM
    @MASV VARCHAR(20),
    @MAHP VARCHAR(20),
    @DIEMTHI FLOAT,
    @MANV VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @PUBKEY VARCHAR(20);
    DECLARE @EncryptedScore VARBINARY(MAX);
    DECLARE @MALOP VARCHAR(20);

    -- Kiểm tra xem sinh viên có thuộc lớp của nhân viên không
    SELECT @MALOP = MALOP
    FROM SINHVIEN
    WHERE MASV = @MASV;

    IF NOT EXISTS (SELECT 1 FROM LOP WHERE MALOP = @MALOP AND MANV = @MANV)
    BEGIN
        PRINT N'Nhân viên không có quyền quản lý lớp này';
        RETURN;
    END

    -- Lấy Public Key của nhân viên
    SELECT @PUBKEY = PUBKEY FROM NHANVIEN WHERE MANV = @MANV;

    -- Mã hóa điểm thi
    SET @EncryptedScore = EncryptByAsymKey(AsymKey_ID(@PUBKEY), CONVERT(VARCHAR, @DIEMTHI));

    -- Thêm hoặc cập nhật điểm thi
    IF EXISTS (SELECT 1 FROM BANGDIEM WHERE MASV = @MASV AND MAHP = @MAHP)
    BEGIN
        UPDATE BANGDIEM
        SET DIEMTHI = @EncryptedScore
        WHERE MASV = @MASV AND MAHP = @MAHP;
    END
    ELSE
    BEGIN
        INSERT INTO BANGDIEM (MASV, MAHP, DIEMTHI)
        VALUES (@MASV, @MAHP, @EncryptedScore);
    END
END
GO


IF OBJECT_ID('SP_SEL_BANGDIEM', 'P') IS NOT NULL
    DROP PROCEDURE SP_SEL_BANGDIEM;
GO

CREATE OR ALTER PROCEDURE SP_SEL_BANGDIEM
    @MASV VARCHAR(20),
    @MAHP VARCHAR(20),
    @MANV VARCHAR(20),
    @MK NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @EncryptedScore VARBINARY(MAX);
    DECLARE @DecryptedScore FLOAT;
    DECLARE @HashedPassword VARBINARY(MAX);
    DECLARE @CorrectPassword VARBINARY(MAX);

    -- Kiểm tra mật khẩu của nhân viên
    SELECT @HashedPassword = MATKHAU FROM NHANVIEN WHERE MANV = @MANV;
    SET @CorrectPassword = HASHBYTES('SHA1', @MK);

    IF @HashedPassword != @CorrectPassword
    BEGIN
        PRINT N'Mật khẩu không chính xác';
        RETURN;
    END

    -- Lấy điểm thi đã mã hóa từ bảng BANGDIEM
    SELECT @EncryptedScore = DIEMTHI
    FROM BANGDIEM
    WHERE MASV = @MASV AND MAHP = @MAHP;

    -- Giải mã điểm thi
	SET @DecryptedScore = CAST(CAST(DecryptByAsymKey(AsymKey_ID(@MANV), @EncryptedScore, @MK) AS VARCHAR(100)) AS FLOAT);

    -- Trả về điểm thi đã giải mã
    SELECT @MASV AS MASV, @MAHP AS MAHP, @DecryptedScore AS DIEMTHI;
END
GO

IF OBJECT_ID('SP_FORGOT_PASSWORD_NHANVIEN', 'P') IS NOT NULL
    DROP PROCEDURE SP_FORGOT_PASSWORD_NHANVIEN;
GO

CREATE OR ALTER PROCEDURE SP_FORGOT_PASSWORD_NHANVIEN
    @MANV VARCHAR(20),
    @EMAIL VARCHAR(20),
    @NEW_MATKHAU NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @CurrentEmail VARCHAR(20);
    DECLARE @HashedNewPassword VARBINARY(MAX);

    -- Kiểm tra xem nhân viên có tồn tại với MANV và EMAIL không
    SELECT @CurrentEmail = EMAIL FROM NHANVIEN WHERE MANV = @MANV;

    IF @CurrentEmail != @EMAIL
    BEGIN
        PRINT N'Thông tin không hợp lệ';
        RETURN;
    END

    -- Mã hóa mật khẩu mới
    SET @HashedNewPassword = HASHBYTES('SHA1', @NEW_MATKHAU);

    -- Cập nhật mật khẩu mới
    UPDATE NHANVIEN
    SET MATKHAU = @HashedNewPassword
    WHERE MANV = @MANV;
    
    PRINT N'Mật khẩu đã được cập nhật';
END
GO

CREATE OR ALTER PROCEDURE SP_INS_LOP
	@MALOP VARCHAR(20),
	@TENLOP NVARCHAR(100),
	@MANV VARCHAR(20)
AS
BEGIN
	INSERT INTO LOP (MALOP, TENLOP, MANV)
	VALUES (@MALOP, @TENLOP, @MANV)
END

EXEC SP_INS_LOP 'L01', N'Lớp 1', 'NV01'

-- Thêm mới thông tin sinh viên với mật khẩu được mã hóa dùng SHA1
IF OBJECT_ID('SP_INS_SINHVIEN', 'P') IS NOT NULL
	DROP PROCEDURE SP_INS_SINHVIEN
GO

CREATE OR ALTER PROCEDURE SP_INS_SINHVIEN
	@MASV NVARCHAR(20),
	@HOTEN NVARCHAR(100),
	@NGAYSINH DATETIME,
	@DIACHI NVARCHAR(200),
	@MALOP NVARCHAR(200),
	@TENDN NVARCHAR(100),
	@MK NVARCHAR(100),
	@MANV VARCHAR(20)
AS
BEGIN
	IF (@MANV != (SELECT LOP.MANV FROM LOP WHERE LOP.MALOP = @MALOP))
	BEGIN
		PRINT N'Nhân viên không có quyền thêm sinh viên vào lớp không thuộc sự quản lý của mình.'
		RETURN
	END
	
	DECLARE @HashPassword VARBINARY(MAX);
	SET @HashPassword = HASHBYTES('SHA1', @MK);

	INSERT INTO SINHVIEN (MASV, HOTEN, NGAYSINH, DIACHI, MALOP, TENDN, MATKHAU)
	VALUES (@MASV, @HOTEN, @NGAYSINH, @DIACHI, @MALOP, @TENDN, @HashPassword)
END
GO


CREATE OR ALTER PROCEDURE SP_UPD_SINHVIEN
	@MASV NVARCHAR(20),
	@HOTEN NVARCHAR(100),
	@NGAYSINH DATETIME,
	@DIACHI NVARCHAR(200),
	@MANV VARCHAR(20)
AS
BEGIN
	IF (@MASV NOT IN (SELECT SINHVIEN.MASV FROM SINHVIEN))
	BEGIN
		PRINT N'Không tồn tại sinh viên trong hệ thống.'
		RETURN
	END

	IF (@MANV != (	SELECT LOP.MANV 
					FROM LOP 
					JOIN SINHVIEN SV ON SV.MALOP = LOP.MALOP
					WHERE SV.MASV = @MASV))
	BEGIN
		PRINT N'Nhân viên không có quyền chỉnh sửa thông tin sinh viên không thuộc lớp quản lý của mình.'
		RETURN
	END

	UPDATE SINHVIEN
	SET HOTEN = @HOTEN, NGAYSINH = @NGAYSINH, DIACHI = @DIACHI
	WHERE MASV = @MASV

END
GO
