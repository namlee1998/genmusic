# Implementation Plan — Đăng nhập bằng Google

## Bước 1 — Cấu hình
- Đăng ký OAuth client trên Google Cloud Console (Web application).
- Lưu `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` vào biến môi trường.

## Bước 2 — Backend
- Thêm route `GET /api/v1/auth/google` để khởi tạo luồng và điều hướng tới Google.
- Thêm route `GET /api/v1/auth/google/callback` xử lý mã trả về, đổi lấy token và xác minh ID token.
- Tạo service `googleAuth.js`:
  - Xác minh ID token qua thư viện `google-auth-library`.
  - Tìm người dùng theo email; nếu chưa có thì tạo mới từ hồ sơ Google.
  - Cập nhật tên + avatar, cấp session token (JWT).

## Bước 3 — Frontend
- Thêm `GoogleSignInButton` vào màn hình đăng nhập.
- Xử lý trạng thái loading/lỗi và điều hướng sau khi đăng nhập thành công.

## Bước 4 — Kiểm thử
- Viết unit test cho `verifyGoogleToken` và `findOrCreateGoogleUser` (mock thư viện Google).
- Viết integration test cho route callback (thành công, người dùng từ chối, token không hợp lệ).

## Bước 5 — Bảo mật
- Không hard-code khoá bí mật; đọc từ env.
- Xác thực tham số `state` để chống CSRF.
- Không ghi token hay khoá bí mật ra log.
