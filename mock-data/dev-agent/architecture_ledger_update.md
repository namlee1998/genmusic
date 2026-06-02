# Architecture Ledger Update

## Thay đổi sau Story Đăng nhập bằng Google

- **Thêm nhà cung cấp danh tính ngoài (Google)** vào lớp xác thực. Lớp auth giờ hỗ trợ
  song song: email/mật khẩu (cũ) và Google (mới).
- **Mô-đun mới `src/auth/googleAuth.js`** đảm nhận xác minh ID token và ánh xạ hồ sơ → người dùng.
- **Bản ghi User** bổ sung trường `provider` ('local' | 'google') và `avatar`.
- **Session token** được tái sử dụng từ cơ chế JWT hiện có; không thay đổi định dạng token.
- **Biến môi trường mới:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

## Ảnh hưởng
- Không phá vỡ luồng đăng nhập email/mật khẩu hiện tại.
- Cần migration nhẹ để thêm cột `provider`, `avatar` (mặc định an toàn).
