# Ứng Dụng Báo Giá – Kyowa Kako Việt Nam (KKVN)

Ứng dụng Web Full-stack hỗ trợ tra cứu cấu hình cơ bản, lập báo giá chi tiết, quản lý phiên bản (Revision), phân quyền xem Giá Cost và xuất bản in PDF song ngữ Nhật – Việt chuẩn mẫu của **Công ty TNHH Kyowa Kako Việt Nam**.

## 1. Cách Chạy Ứng Dụng

Tại thư mục gốc `D:\baogia`, chạy lệnh:

```powershell
npm start
```

Sau đó mở trình duyệt tại địa chỉ: **`http://localhost:3000`**

## 2. Cấu Trúc Thư Mục

- [`package.json`](file:///D:/baogia/package.json): Cấu hình dự án và script khởi chạy.
- [`server/index.js`](file:///D:/baogia/server/index.js): HTTP & REST API Server, xử lý phân quyền RBAC (`admin`/`manager` vs `sale`), CRUD báo giá, quản lý phiên bản (Revision) và đồng bộ Excel.
- [`server/db.js`](file:///D:/baogia/server/db.js): Khởi tạo cơ sở dữ liệu `SQLite` (`data/kkvn_baogia.sqlite`), nạp tự động 64 cấu hình Model tháp, danh mục thiết bị đo, quạt, bơm, dịch vụ và 3 báo giá mẫu thực tế.
- [`server/excel.js`](file:///D:/baogia/server/excel.js): Bộ đọc/ghi file Excel (`.xlsx`) đồng bộ trực tiếp cả 3 sheet (`Data báo giá cost`, `Data báo giá cơ bản`, `Danh sách tất cả thiết bị đo`).
- [`public/index.html`](file:///D:/baogia/public/index.html), [`public/styles.css`](file:///D:/baogia/public/styles.css), [`public/app.js`](file:///D:/baogia/public/app.js): Giao diện người dùng 5 phân hệ và trình kết xuất bản in A4 song ngữ Nhật – Việt.
- [`public/assets/`](file:///D:/baogia/public/assets): Chứa logo `KKVN` và mộc đỏ công ty trích xuất nguyên bản từ các file PDF mẫu của khách hàng.

## 3. Các Tính Năng Chính Đã Thực Hiện

1. **Luồng 1 – Báo Giá Cơ Bản**:
   - Tra cứu 64 model thuộc 5 dòng tháp (`FSD 0.5`, `FSD 1.0`, `FSW 1.0L`, `FSW 2.0L`, `EMR HR`) hoặc tìm nhanh theo lưu lượng yêu cầu (`m³/min`).
   - Đối chiếu chính xác công thức: `FSD 0.5 - Model 55` có Tổng giá cơ bản = `908.376.000 VND` và Tổng giá Cost = `454.188.000 VND`.
   - Hiển thị rõ 4 thiết bị đo đi kèm mặc định (*Đồng hồ chênh áp x1, Van điện từ x1, Đo mức tuần hoàn x2, Đo mức hóa chất x2*) để tránh cộng trùng.
2. **Luồng 2 – Báo Giá Chi Tiết**:
   - Hỗ trợ 3 mẫu bố cục thực tế: **Trọn bộ Hệ tháp (`2601-016-01` Taikisha)**, **Thiết bị lẻ (`2601-012-02` SMC)**, và **Chia theo khu vực/tháp (`2601-025-02` Mektec)**.
   - Tùy chọn quy tắc xử lý khoản **Chi phí quản lý, thiết kế (5%)**: *Tách/Thay thế sang mục B. Khác*, *Giữ trong mục A*, hoặc *Cộng bổ sung*.
   - Cho phép nhập giá thương lượng (`Chênh lệch +/-` hoặc `Đơn giá sau điều chỉnh`), cảnh báo nếu giá thấp hơn `Giá Cost`.
3. **Bản In / Xuất PDF Chuẩn Mẫu KKVN (Khổ A4)**:
   - Tái tạo chuẩn xác biểu mẫu báo giá song ngữ Nhật – Việt kèm logo `KKVN`, thông tin Người duyệt / Người đảm trách, điều kiện thương mại ① → ⑦ và mộc đỏ công ty.
4. **Quản Lý Hồ Sơ, Phiên Bản (Revision) & Phân Quyền**:
   - Chuyển đổi nhanh tài khoản trên thanh Header giữa **Quản lý (`Mr Yamanaka Masayuki`, `Mr Bảo Trường` - Xem Cost & Duyệt BG)** và **Nhân viên KD (`Mrs Cẩm Tú` - Ẩn Giá Cost)**.
   - Tạo phiên bản mới (`-01` → `-02` → `-03`) giữ nguyên lịch sử giá (snapshot).
5. **Quản Trị Danh Mục & Đồng Bộ Excel**:
   - Import/Cập nhật trực tiếp từ file `.xlsx` và Export toàn bộ danh mục ra file Excel 3 sheet chuẩn.
