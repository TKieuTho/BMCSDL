-- Xóa tất cả stored procedures cũ
IF OBJECT_ID('SP_INS_PUBLIC_NHANVIEN', 'P') IS NOT NULL
    DROP PROCEDURE SP_INS_PUBLIC_NHANVIEN;
GO

IF OBJECT_ID('SP_SEL_PUBLIC_NHANVIEN', 'P') IS NOT NULL
    DROP PROCEDURE SP_SEL_PUBLIC_NHANVIEN;
GO

IF OBJECT_ID('SP_LOGIN_NHANVIEN', 'P') IS NOT NULL
    DROP PROCEDURE SP_LOGIN_NHANVIEN;
GO

IF OBJECT_ID('SP_SEL_LOP_BY_MANV', 'P') IS NOT NULL
    DROP PROCEDURE SP_SEL_LOP_BY_MANV;
GO

IF OBJECT_ID('SP_SEL_SINHVIEN_BY_LOP', 'P') IS NOT NULL
    DROP PROCEDURE SP_SEL_SINHVIEN_BY_LOP;
GO

IF OBJECT_ID('SP_INS_UPD_BANGDIEM', 'P') IS NOT NULL
    DROP PROCEDURE SP_INS_UPD_BANGDIEM;
GO

IF OBJECT_ID('SP_SEL_BANGDIEM', 'P') IS NOT NULL
    DROP PROCEDURE SP_SEL_BANGDIEM;
GO

IF OBJECT_ID('SP_FORGOT_PASSWORD_NHANVIEN', 'P') IS NOT NULL
    DROP PROCEDURE SP_FORGOT_PASSWORD_NHANVIEN;
GO

IF OBJECT_ID('SP_INS_LOP', 'P') IS NOT NULL
    DROP PROCEDURE SP_INS_LOP;
GO

IF OBJECT_ID('SP_INS_SINHVIEN', 'P') IS NOT NULL
    DROP PROCEDURE SP_INS_SINHVIEN;
GO

IF OBJECT_ID('SP_UPD_SINHVIEN', 'P') IS NOT NULL
    DROP PROCEDURE SP_UPD_SINHVIEN;
GO

IF OBJECT_ID('SP_SEL_HOCPHAN', 'P') IS NOT NULL
    DROP PROCEDURE SP_SEL_HOCPHAN;
GO

IF OBJECT_ID('SP_SEL_DIEMLOP', 'P') IS NOT NULL
    DROP PROCEDURE SP_SEL_DIEMLOP;
GO

-- Xóa procedures chính cần sửa
IF OBJECT_ID('SP_INS_PUBLIC_ENCRYPT_NHANVIEN', 'P') IS NOT NULL 
    DROP PROCEDURE SP_INS_PUBLIC_ENCRYPT_NHANVIEN;
GO

IF OBJECT_ID('SP_SEL_PUBLIC_ENCRYPT_NHANVIEN', 'P') IS NOT NULL 
    DROP PROCEDURE SP_SEL_PUBLIC_ENCRYPT_NHANVIEN;
GO

PRINT N'Tất cả stored procedure đã được xóa.'
GO

-- =============================================
-- Stored Procedure: SP_INS_PUBLIC_ENCRYPT_NHANVIEN
-- Mô tả: Thêm mới nhân viên với mã hóa SHA1 cho mật khẩu và RSA cho lương
-- Tham số:
--   @MANV: Mã nhân viên
--   @HOTEN: Họ tên nhân viên  
--   @EMAIL: Email nhân viên
--   @LUONG: Lương đã được mã hóa RSA từ client (VARBINARY)
--   @TENDN: Tên đăng nhập
--   @MK: Mật khẩu đã được hash SHA1 từ client (VARBINARY)
--   @PUB: Khóa công khai RSA được tạo từ client
-- =============================================
CREATE OR ALTER PROCEDURE SP_INS_PUBLIC_ENCRYPT_NHANVIEN 
    @MANV VARCHAR(20),
    @HOTEN NVARCHAR(100),
    @EMAIL VARCHAR(50),
    @LUONG VARBINARY(MAX),  -- Lương đã mã hóa RSA từ client
    @TENDN NVARCHAR(100),
    @MK VARBINARY(MAX),     -- Mật khẩu đã hash SHA1 từ client  
    @PUB NVARCHAR(MAX)      -- Khóa công khai từ client
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRY
        -- Kiểm tra tham số đầu vào không được NULL
        IF @MANV IS NULL OR @HOTEN IS NULL OR @EMAIL IS NULL OR 
           @LUONG IS NULL OR @TENDN IS NULL OR @MK IS NULL OR @PUB IS NULL
        BEGIN
            RAISERROR(N'Tất cả tham số đều bắt buộc và không được để trống', 16, 1);
            RETURN;
        END
        
        -- Kiểm tra độ dài tham số
        IF LEN(@MANV) = 0 OR LEN(@HOTEN) = 0 OR LEN(@EMAIL) = 0 OR 
           LEN(@TENDN) = 0 OR LEN(@PUB) = 0 OR DATALENGTH(@LUONG) = 0 OR DATALENGTH(@MK) = 0
        BEGIN
            RAISERROR(N'Tất cả tham số đều phải có giá trị hợp lệ', 16, 1);
            RETURN;
        END
        
        -- Kiểm tra mã nhân viên đã tồn tại chưa
        IF EXISTS (SELECT 1 FROM NHANVIEN WHERE MANV = @MANV)
        BEGIN
            RAISERROR(N'Mã nhân viên "%s" đã tồn tại trong hệ thống', 16, 1, @MANV);
            RETURN;
        END
        
        -- Kiểm tra tên đăng nhập đã tồn tại chưa
        IF EXISTS (SELECT 1 FROM NHANVIEN WHERE TENDN = @TENDN)
        BEGIN
            RAISERROR(N'Tên đăng nhập "%s" đã được sử dụng', 16, 1, @TENDN);
            RETURN;
        END
        
        -- Kiểm tra email đã tồn tại chưa
        IF EXISTS (SELECT 1 FROM NHANVIEN WHERE EMAIL = @EMAIL)
        BEGIN
            RAISERROR(N'Email "%s" đã được sử dụng', 16, 1, @EMAIL);
            RETURN;
        END
        
        -- Chèn dữ liệu vào bảng NHANVIEN
        -- Lương và mật khẩu đã được mã hóa từ client
        INSERT INTO NHANVIEN (MANV, HOTEN, EMAIL, LUONG, TENDN, MATKHAU, PUBKEY) 
        VALUES (@MANV, @HOTEN, @EMAIL, @LUONG, @TENDN, @MK, @PUB);
        
        PRINT N'Thêm nhân viên thành công: ' + @MANV + N' - ' + @HOTEN;
        
    END TRY
    BEGIN CATCH
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();
        
        RAISERROR(N'Lỗi khi thêm nhân viên: %s', @ErrorSeverity, @ErrorState, @ErrorMessage);
    END CATCH
END
GO

-- =============================================
-- Stored Procedure: SP_SEL_PUBLIC_ENCRYPT_NHANVIEN
-- Mô tả: Truy vấn thông tin nhân viên (lương trả về dạng mã hóa)
-- Tham số:
--   @TENDN: Tên đăng nhập
--   @MK: Mật khẩu đã được hash SHA1 từ client (VARBINARY)
-- Kết quả: MANV, HOTEN, EMAIL, LUONG (dạng mã hóa)
-- =============================================
CREATE OR ALTER PROCEDURE SP_SEL_PUBLIC_ENCRYPT_NHANVIEN 
    @TENDN NVARCHAR(100),
    @MK VARBINARY(MAX)  -- Mật khẩu đã hash SHA1 từ client
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRY
        -- Kiểm tra tham số đầu vào
        IF @TENDN IS NULL OR @MK IS NULL
        BEGIN
            RAISERROR(N'Tên đăng nhập và mật khẩu không được để trống', 16, 1);
            RETURN;
        END
        
        IF LEN(@TENDN) = 0 OR DATALENGTH(@MK) = 0
        BEGIN
            RAISERROR(N'Tên đăng nhập và mật khẩu phải có giá trị hợp lệ', 16, 1);
            RETURN;
        END
        
        -- Kiểm tra nhân viên tồn tại với tên đăng nhập và mật khẩu đã hash
        IF NOT EXISTS (SELECT 1 FROM NHANVIEN WHERE TENDN = @TENDN AND MATKHAU = @MK)
        BEGIN
            PRINT N'Không tìm thấy nhân viên hoặc thông tin đăng nhập không chính xác';
            RETURN;
        END
        
        -- Truy vấn thông tin nhân viên 
        -- Lương trả về dạng mã hóa (chưa giải mã)
        SELECT 
            MANV, 
            HOTEN, 
            EMAIL, 
            LUONG    -- Trả về lương đã mã hóa RSA, không giải mã
        FROM NHANVIEN 
        WHERE TENDN = @TENDN AND MATKHAU = @MK;
        
    END TRY
    BEGIN CATCH
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();
        
        RAISERROR(N'Lỗi khi truy vấn thông tin nhân viên: %s', @ErrorSeverity, @ErrorState, @ErrorMessage);
    END CATCH
END
GO

-- =============================================
-- CÁC STORED PROCEDURES KHÁC (Đã được sửa lại)
-- =============================================

-- Stored Procedure: SP_LOGIN_NHANVIEN 
CREATE OR ALTER PROCEDURE SP_LOGIN_NHANVIEN
    @MANV NVARCHAR(20), 
    @MATKHAU VARBINARY(MAX) 
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        -- Kiểm tra thông tin đăng nhập với mật khẩu đã hash
        IF NOT EXISTS (SELECT 1 FROM NHANVIEN WHERE MANV = @MANV AND MATKHAU = @MATKHAU)
        BEGIN
            RAISERROR(N'Thông tin đăng nhập không chính xác', 16, 1);
            RETURN;
        END

        -- Trả về thông tin nhân viên
        SELECT MANV, HOTEN, EMAIL
        FROM NHANVIEN
        WHERE MANV = @MANV AND MATKHAU = @MATKHAU;
    END TRY
    BEGIN CATCH
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(N'Lỗi đăng nhập: %s', 16, 1, @ErrorMessage);
    END CATCH
END
GO

-- Stored Procedure: SP_LOP_BY_MANV (Sửa tên cho đúng)
CREATE OR ALTER PROCEDURE SP_LOP_BY_MANV
    @MANV VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
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
    END TRY
    BEGIN CATCH
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(N'Lỗi truy vấn lớp: %s', 16, 1, @ErrorMessage);
    END CATCH
END
GO

-- Stored Procedure: SP_SINHVIEN_BY_LOP (Sửa tên procedure)
CREATE OR ALTER PROCEDURE SP_SINHVIEN_BY_LOP
    @MALOP VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
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
    END TRY
    BEGIN CATCH
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(N'Lỗi truy vấn sinh viên: %s', 16, 1, @ErrorMessage);
    END CATCH
END
GO

-- Stored Procedure: SP_FORGOT_PASSWORD_NHANVIEN (Sửa để sử dụng mật khẩu hash)
CREATE OR ALTER PROCEDURE SP_FORGOT_PASSWORD_NHANVIEN
    @MANV VARCHAR(20),
    @EMAIL VARCHAR(50),
    @NEW_MATKHAU VARBINARY(MAX) -- Mật khẩu mới đã hash SHA1
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        -- Kiểm tra xem nhân viên có tồn tại với MANV và EMAIL không
        IF NOT EXISTS (SELECT 1 FROM NHANVIEN WHERE MANV = @MANV AND EMAIL = @EMAIL)
        BEGIN
            PRINT N'Thông tin nhân viên và email không khớp';
            RETURN;
        END

        -- Cập nhật mật khẩu mới (đã hash)
        UPDATE NHANVIEN
        SET MATKHAU = @NEW_MATKHAU
        WHERE MANV = @MANV AND EMAIL = @EMAIL;
        
        PRINT N'Mật khẩu đã được cập nhật thành công';
    END TRY
    BEGIN CATCH
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(N'Lỗi cập nhật mật khẩu: %s', 16, 1, @ErrorMessage);
    END CATCH
END
GO

-- =============================================
-- Stored Procedure: SP_UPD_PUBLIC_ENCRYPT_NHANVIEN
-- Mô tả: Cập nhật thông tin nhân viên với mã hóa RSA cho lương
-- Tham số:
--   @MANV: Mã nhân viên
--   @HOTEN: Họ tên nhân viên  
--   @EMAIL: Email nhân viên
--   @LUONG: Lương đã được mã hóa RSA từ client (VARBINARY)
-- =============================================
CREATE OR ALTER PROCEDURE SP_UPD_PUBLIC_ENCRYPT_NHANVIEN 
    @MANV VARCHAR(20),
    @HOTEN NVARCHAR(100),
    @EMAIL VARCHAR(50),
    @LUONG VARBINARY(MAX)  -- Lương đã mã hóa RSA từ client
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRY
        -- Kiểm tra tham số đầu vào không được NULL
        IF @MANV IS NULL OR @HOTEN IS NULL OR @EMAIL IS NULL OR @LUONG IS NULL
        BEGIN
            RAISERROR(N'Tất cả tham số đều bắt buộc và không được để trống', 16, 1);
            RETURN;
        END
        
        -- Kiểm tra độ dài tham số
        IF LEN(@MANV) = 0 OR LEN(@HOTEN) = 0 OR LEN(@EMAIL) = 0 OR DATALENGTH(@LUONG) = 0
        BEGIN
            RAISERROR(N'Tất cả tham số đều phải có giá trị hợp lệ', 16, 1);
            RETURN;
        END
        
        -- Kiểm tra nhân viên có tồn tại không
        IF NOT EXISTS (SELECT 1 FROM NHANVIEN WHERE MANV = @MANV)
        BEGIN
            RAISERROR(N'Không tìm thấy nhân viên với mã "%s"', 16, 1, @MANV);
            RETURN;
        END
        
        -- Kiểm tra email đã tồn tại chưa (trừ email của nhân viên hiện tại)
        IF EXISTS (SELECT 1 FROM NHANVIEN WHERE EMAIL = @EMAIL AND MANV != @MANV)
        BEGIN
            RAISERROR(N'Email "%s" đã được sử dụng bởi nhân viên khác', 16, 1, @EMAIL);
            RETURN;
        END
        
        -- Cập nhật thông tin nhân viên
        UPDATE NHANVIEN 
        SET HOTEN = @HOTEN,
            EMAIL = @EMAIL,
            LUONG = @LUONG
        WHERE MANV = @MANV;
        
        PRINT N'Cập nhật nhân viên thành công: ' + @MANV + N' - ' + @HOTEN;
        
    END TRY
    BEGIN CATCH
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();
        
        RAISERROR(N'Lỗi khi cập nhật nhân viên: %s', @ErrorSeverity, @ErrorState, @ErrorMessage);
    END CATCH
END
GO

PRINT N'Đã tạo lại tất cả stored procedures theo yêu cầu mã hóa.';
GO

