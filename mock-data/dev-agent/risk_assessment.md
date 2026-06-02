# Risk Assessment

**Risk Level: LOW**

| Rủi ro | Mức độ | Giảm thiểu |
|---|---|---|
| Lộ khoá bí mật OAuth | Trung bình | Lưu trong biến môi trường, không commit; không ghi ra log |
| Tấn công CSRF trên callback | Thấp | Xác thực tham số `state` khớp session |
| Trùng email giữa tài khoản local và Google | Thấp | Tra cứu theo email; giai đoạn này chưa hỗ trợ account linking (ngoài phạm vi) |
| ID token giả mạo | Thấp | Xác minh chữ ký qua `google-auth-library` chính thức |

## Kết luận
Tính năng dùng thư viện chính thức của Google và tái sử dụng cơ chế session sẵn có.
Không có thay đổi phá vỡ. Mức rủi ro tổng thể: **LOW**.
