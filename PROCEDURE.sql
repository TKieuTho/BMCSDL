﻿
CREATE  PROCEDURE SP_INS_PUBLIC_ENCRYPT_NHANVIEN 
    @MANV VARCHAR(20),
    @HOTEN NVARCHAR(100),
    @EMAIL VARCHAR(50),
    @LUONG VARBINARY(MAX),  
    @TENDN NVARCHAR(100),
    @MK VARBINARY(MAX),    
    @PUB NVARCHAR(MAX)      
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRY
        -- Kiểm tra tham số đầu vào
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
        
        -- Kiểm tra tồn tại MANV
        IF EXISTS (SELECT 1 FROM NHANVIEN WHERE MANV = @MANV)
        BEGIN
            RAISERROR(N'Mã nhân viên "%s" đã tồn tại trong hệ thống', 16, 1, @MANV);
            RETURN;
        END
        
        -- Kiểm tra tồn tại tên đăng nhập 
        IF EXISTS (SELECT 1 FROM NHANVIEN WHERE TENDN = @TENDN)
        BEGIN
            RAISERROR(N'Tên đăng nhập "%s" đã được sử dụng', 16, 1, @TENDN);
            RETURN;
        END
        
        -- Kiểm tra tồn tại email 
        IF EXISTS (SELECT 1 FROM NHANVIEN WHERE EMAIL = @EMAIL)
        BEGIN
            RAISERROR(N'Email "%s" đã được sử dụng', 16, 1, @EMAIL);
            RETURN;
        END
        
        -- Chèn dữ liệu vào bảng NHANVIEN
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

CREATE OR ALTER PROCEDURE SP_SEL_PUBLIC_ENCRYPT_NHANVIEN 
    @MANV NVARCHAR(20),
    @MK VARBINARY(MAX) 
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRY
        -- Kiểm tra tham số đầu vào
        IF @MANV IS NULL OR @MK IS NULL
        BEGIN
            RAISERROR(N'Tên đăng nhập và mật khẩu không được để trống', 16, 1);
            RETURN;
        END
        
        IF LEN(@MANV) = 0 OR DATALENGTH(@MK) = 0
        BEGIN
            RAISERROR(N'Tên đăng nhập và mật khẩu phải có giá trị hợp lệ', 16, 1);
            RETURN;
        END
        
        -- Kiểm tra nhân viên tồn tại với tên đăng nhập và mật khẩu 
        IF NOT EXISTS (SELECT 1 FROM NHANVIEN WHERE TENDN = @MANV AND MATKHAU = @MK)
        BEGIN
            PRINT N'Không tìm thấy nhân viên hoặc thông tin đăng nhập không chính xác';
            RETURN;
        END
        
        -- Truy vấn thông tin nhân viên 
        SELECT 
            MANV, 
            HOTEN, 
            EMAIL, 
            LUONG    -- Trả về lương trong trang thái mã hóa RSA
        FROM NHANVIEN 
        WHERE TENDN = @MANV AND MATKHAU = @MK;
        
    END TRY
    BEGIN CATCH
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();
        
        RAISERROR(N'Lỗi khi truy vấn thông tin nhân viên: %s', @ErrorSeverity, @ErrorState, @ErrorMessage);
    END CATCH
END
GO



-- Stored Procedure: SP_LOGIN_NHANVIEN 
CREATE OR ALTER PROCEDURE SP_LOGIN_NHANVIEN
    @MANV NVARCHAR(20), 
    @MATKHAU VARBINARY(MAX) 
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        -- Kiểm tra thông tin đăng nhập với mật khẩu 
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

-- Stored Procedure: SP_SEL_LOP_BY_MANV 
CREATE OR ALTER PROCEDURE SP_SEL_LOP_BY_MANV
    @MANV VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        -- Kiểm tra tồn tại nhân viên 
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

-- Stored Procedure: SP_SEL_SINHVIEN_BY_LOP 
CREATE OR ALTER PROCEDURE SP_SEL_SINHVIEN_BY_LOP
    @MALOP VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        -- Kiểm tra tồn tại lớp
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

-- Stored Procedure: SP_FORGOT_PASSWORD_NHANVIEN 
CREATE OR ALTER PROCEDURE SP_FORGOT_PASSWORD_NHANVIEN
    @MANV VARCHAR(20),
    @EMAIL VARCHAR(50),
    @NEW_MATKHAU VARBINARY(MAX) 
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

-- Stored Procedure: SP_INS_SINHVIEN 
CREATE OR ALTER PROCEDURE SP_INS_SINHVIEN
	@MASV NVARCHAR(20),
	@HOTEN NVARCHAR(100),
	@NGAYSINH DATETIME,
	@DIACHI NVARCHAR(200),
	@MALOP NVARCHAR(200),
	@TENDN NVARCHAR(100),
	@MK VARBINARY(MAX),
	@MANV VARCHAR(20)
AS
BEGIN
	IF (@MANV != (SELECT LOP.MANV FROM LOP WHERE LOP.MALOP = @MALOP))
	BEGIN
		PRINT N'Nhân viên không có quyền thêm sinh viên vào lớp không thuộc sự quản lý của mình.'
		RETURN
	END
	
	INSERT INTO SINHVIEN (MASV, HOTEN, NGAYSINH, DIACHI, MALOP, TENDN, MATKHAU)
	VALUES (@MASV, @HOTEN, @NGAYSINH, @DIACHI, @MALOP, @TENDN, @MK)
END
GO

-- Stored Procedure: SP_UPD_SINHVIEN 
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

	IF (@MANV != (SELECT LOP.MANV 
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

-- Stored Procedure: SP_INS_UPD_BANGDIEM 
CREATE OR ALTER PROCEDURE SP_INS_UPD_BANGDIEM
    @MASV VARCHAR(20),
    @MAHP VARCHAR(20),
    @DIEMTHI VARBINARY(MAX),
    @MANV VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

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

    IF EXISTS (SELECT 1 FROM BANGDIEM WHERE MASV = @MASV AND MAHP = @MAHP)
    BEGIN
        UPDATE BANGDIEM
        SET DIEMTHI = @DIEMTHI
        WHERE MASV = @MASV AND MAHP = @MAHP;
    END
    ELSE
    BEGIN
        INSERT INTO BANGDIEM (MASV, MAHP, DIEMTHI)
        VALUES (@MASV, @MAHP, @DIEMTHI);
    END
END
GO

-- Stored Procedure: SP_SEL_BANGDIEM 
CREATE OR ALTER PROCEDURE SP_SEL_BANGDIEM
    @MASV VARCHAR(20),
    @MAHP VARCHAR(20),
    @MANV VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    IF (@MANV != (SELECT LOP.MANV
                  FROM LOP 
                  JOIN SINHVIEN SV ON SV.MALOP = LOP.MALOP
                  WHERE SV.MASV = @MASV))
    BEGIN
        PRINT N'Nhân viên không có quyền quản lý lớp này'
        RETURN
    END

    -- Trả về điểm thi
    SELECT MASV, MAHP, DIEMTHI
    FROM BANGDIEM
    WHERE MASV = @MASV AND MAHP = @MAHP;
END
GO

-- Stored Procedure: SP_SEL_DIEMLOP 
CREATE OR ALTER PROCEDURE SP_SEL_DIEMLOP
    @MALOP VARCHAR(20),
    @MANV VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    -- Kiểm tra quyền quản lý lớp của nhân viên
    IF NOT EXISTS (SELECT 1 FROM LOP WHERE MALOP = @MALOP AND MANV = @MANV)
    BEGIN
        RAISERROR(N'Nhân viên không có quyền quản lý lớp này', 16, 1);
        RETURN;
    END

    -- Lấy điểm của tất cả sinh viên trong lớp
    SELECT 
        k.MASV,
        k.MAHP,
        k.DIEMTHI
    FROM BANGDIEM k
    INNER JOIN SINHVIEN s ON k.MASV = s.MASV
    WHERE s.MALOP = @MALOP;
END
GO

-- Stored Procedure: SP_SEL_HOCPHAN 
CREATE OR ALTER PROCEDURE SP_SEL_HOCPHAN
AS
BEGIN
    SET NOCOUNT ON;
    -- Lấy danh sách học phần
    SELECT MAHP, TENHP, SOTC
    FROM HOCPHAN;
END
GO

-- Stored Procedure: SP_SEL_ALL_NHANVIEN 
CREATE OR ALTER PROCEDURE SP_SEL_ALL_NHANVIEN
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        SELECT 
            MANV,
            HOTEN,
            EMAIL,
            LUONG,     
            TENDN,
            PUBKEY
        FROM NHANVIEN;
    END TRY
    BEGIN CATCH
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();
        
        RAISERROR(N'Lỗi khi truy vấn danh sách nhân viên: %s', @ErrorSeverity, @ErrorState, @ErrorMessage);
    END CATCH
END;
GO

-- Stored Procedure: SP_UPD_NHANVIEN 
CREATE OR ALTER PROCEDURE SP_UPD_NHANVIEN
    @MANV VARCHAR(20),
    @HOTEN NVARCHAR(100),
    @EMAIL VARCHAR(20),
    @LUONG VARBINARY(MAX),
    @TENDN NVARCHAR(100),
    @MATKHAU VARBINARY(MAX),
    @PUBKEY VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    -- Kiểm tra nhân viên có tồn tại không
    IF NOT EXISTS (SELECT 1 FROM NHANVIEN WHERE MANV = @MANV)
    BEGIN
        PRINT N'Nhân viên không tồn tại trong hệ thống.'
        RETURN
    END

    -- Kiểm tra tên đăng nhập mới có trùng không
    IF EXISTS (SELECT 1 FROM NHANVIEN WHERE TENDN = @TENDN AND MANV != @MANV)
    BEGIN
        PRINT N'Tên đăng nhập đã tồn tại.'
        RETURN
    END

    -- Cập nhật thông tin nhân viên
    UPDATE NHANVIEN
    SET HOTEN = @HOTEN,
        EMAIL = @EMAIL,
        LUONG = @LUONG,
        TENDN = @TENDN,
        MATKHAU = @MATKHAU,
        PUBKEY = @PUBKEY
    WHERE MANV = @MANV
END
GO

-- Stored Procedure: SP_DEL_NHANVIEN 
CREATE OR ALTER PROCEDURE SP_DEL_NHANVIEN
    @MANV VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    -- Kiểm tra nhân viên có tồn tại không
    IF NOT EXISTS (SELECT 1 FROM NHANVIEN WHERE MANV = @MANV)
    BEGIN
        PRINT N'Nhân viên không tồn tại trong hệ thống.'
        RETURN
    END

    -- Kiểm tra nhân viên có đang quản lý lớp nào không
    IF EXISTS (SELECT 1 FROM LOP WHERE MANV = @MANV)
    BEGIN
        PRINT N'Nhân viên đang quản lý lớp, không thể xóa.'
        RETURN
    END

    -- Xóa nhân viên
    DELETE FROM NHANVIEN
    WHERE MANV = @MANV
END
GO

-- Stored Procedure: SP_SEL_BANGDIEM_BY_LOP 
CREATE OR ALTER PROCEDURE SP_SEL_BANGDIEM_BY_LOP
    @MALOP VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        sv.MASV,
        sv.HOTEN AS HOTEN_SV,
        hp.MAHP,
        hp.TENHP,
        bd.DIEMTHI
    FROM 
        SINHVIEN sv
        INNER JOIN BANGDIEM bd ON sv.MASV = bd.MASV
        INNER JOIN HOCPHAN hp ON bd.MAHP = hp.MAHP
    WHERE 
        sv.MALOP = @MALOP
    ORDER BY 
        sv.MASV, hp.MAHP;
END;
GO

-- Stored Procedure: SP_SEL_ALL_CLASS 
CREATE OR ALTER PROCEDURE SP_SEL_ALL_CLASS
AS
BEGIN
   SELECT
       L.MALOP,
       L.TENLOP,
       L.MANV,
       NV.HOTEN AS TENNGUOIQUANLY
   FROM LOP L
   LEFT JOIN NHANVIEN NV ON L.MANV = NV.MANV;
END;
GO

-- Stored Procedure: SP_AssignClassToEmployee 
CREATE OR ALTER PROCEDURE SP_AssignClassToEmployee
    @MALOP VARCHAR(20),
    @MANV VARCHAR(20)
AS
BEGIN
    -- Kiểm tra lớp có tồn tại
    IF NOT EXISTS (SELECT 1 FROM LOP WHERE MALOP = @MALOP)
    BEGIN
        RAISERROR(N'Lớp không tồn tại.', 16, 1);
        RETURN;
    END

    -- Kiểm tra nhân viên có tồn tại
    IF NOT EXISTS (SELECT 1 FROM NHANVIEN WHERE MANV = @MANV)
    BEGIN
        RAISERROR(N'Nhân viên không tồn tại.', 16, 1);
        RETURN;
    END

    -- Kiểm tra lớp đã có người quản lý hay chưa
    IF EXISTS (SELECT 1 FROM LOP WHERE MALOP = @MALOP AND MANV IS NOT NULL)
    BEGIN
        RAISERROR(N'Lớp này đã có người quản lý.', 16, 1);
        RETURN;
    END

    -- Cập nhật MANV để phân công lớp cho nhân viên
    UPDATE LOP
    SET MANV = @MANV
    WHERE MALOP = @MALOP;
END;
GO



