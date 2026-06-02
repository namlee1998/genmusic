# User Flow — Đăng nhập bằng Google

```
[Màn hình đăng nhập]
      │ nhấn "Sign in with Google"
      ▼
[Nút chuyển trạng thái loading] ──► [Chuyển hướng tới màn hình đồng ý của Google]
      │                                          │
      │                          ┌───────────────┴───────────────┐
      │                          │ người dùng đồng ý              │ người dùng từ chối / lỗi
      │                          ▼                                ▼
      │                 [Callback về ứng dụng]            [Quay về màn hình đăng nhập]
      │                          │                                │
      │            ┌─────────────┴──────────────┐                 ▼
      │            │ email đã tồn tại            │ email chưa tồn tại   [Hiện banner lỗi đỏ]
      │            ▼                             ▼
      │   [Đăng nhập + cấp token]       [Tạo tài khoản mới từ hồ sơ Google]
      │            │                             │
      │            └──────────────┬──────────────┘
      │                           ▼
      │                  [Lưu/cập nhật email, tên, avatar]
      │                           ▼
      └──────────────────► [Vào trang chủ đã đăng nhập]
```

## Các điểm quyết định
- **Đồng ý vs Từ chối:** quyết định ở màn hình consent của Google.
- **Người dùng mới vs cũ:** dựa trên việc email Google đã tồn tại trong hệ thống hay chưa.
- **Thành công vs Lỗi:** mọi lỗi (timeout, token không hợp lệ, người dùng huỷ) đều dẫn về màn hình đăng nhập kèm thông báo.
