# PRD — Đăng nhập bằng Google (Google Sign-In)

## Problem Statement
Người dùng hiện phải tạo tài khoản bằng email và mật khẩu để sử dụng sản phẩm.
Quy trình này gây ma sát: phải nhớ thêm một mật khẩu, dễ bỏ ngang ở bước đăng ký.
Tính năng **Đăng nhập bằng Google** cho phép người dùng dùng chính tài khoản Google
sẵn có để đăng ký và đăng nhập chỉ với một cú nhấp, giảm ma sát và tăng tỉ lệ chuyển đổi.

## Target User
- Người dùng mới muốn đăng ký nhanh, không muốn tạo thêm mật khẩu.
- Người dùng cũ muốn đăng nhập tức thì bằng tài khoản Google của họ.

## Goals
- Thêm nút "Sign in with Google" trên màn hình đăng nhập.
- Cho phép tạo tài khoản tự động từ hồ sơ Google (email, tên, ảnh đại diện).
- Cấp phiên đăng nhập (session token) sau khi xác thực thành công.
- Hiển thị thông báo lỗi rõ ràng khi người dùng từ chối hoặc xác thực thất bại.

## Non-Goals
- Không thay thế hoàn toàn luồng email/mật khẩu hiện tại.
- Không hỗ trợ các nhà cung cấp danh tính khác (Facebook, Apple, GitHub) ở giai đoạn này.
- Không xử lý liên kết (account linking) giữa tài khoản email cũ và tài khoản Google.

## Key Requirements
1. Nút "Sign in with Google" hiển thị trên màn hình đăng nhập.
2. Nhấn nút sẽ điều hướng tới màn hình đồng ý (consent) của Google.
3. Xác thực thành công với người dùng mới → tạo tài khoản từ email Google.
4. Xác thực thành công với người dùng cũ → đăng nhập và cấp session token.
5. Người dùng từ chối / xác thực lỗi → quay về màn hình đăng nhập kèm thông báo lỗi.
6. Dữ liệu hồ sơ Google (email, tên, avatar) được lưu/cập nhật vào bản ghi người dùng.

## Technical Notes
Tính năng sử dụng giao thức OAuth 2.0 với luồng Authorization Code và xác minh ID token
phía máy chủ qua thư viện chính thức của Google. Khóa bí mật được lưu trong biến môi trường,
không hard-code trong mã nguồn.
