# UX Spec — Đăng nhập bằng Google

## Nguyên tắc thiết kế
- Nút Google phải tuân thủ hướng dẫn thương hiệu của Google (logo "G", nền trắng, viền xám nhạt, chữ "Sign in with Google").
- Đặt nút ở vị trí nổi bật, ngay dưới form email/mật khẩu, ngăn cách bằng dải phân cách "hoặc".
- Mọi trạng thái (mặc định, hover, loading, lỗi) đều có phản hồi thị giác rõ ràng.

## Bố cục màn hình đăng nhập
1. Logo sản phẩm (trên cùng).
2. Form email + mật khẩu hiện có.
3. Dải phân cách: "──── hoặc ────".
4. Nút **"Sign in with Google"** (full-width).
5. Liên kết phụ: "Quên mật khẩu?", "Tạo tài khoản".

## Trạng thái nút Google
- **Mặc định:** nền trắng, viền `#dadce0`, icon Google, chữ "Sign in with Google".
- **Hover:** đổ bóng nhẹ, nền `#f8f9fa`.
- **Loading:** hiển thị spinner thay icon, vô hiệu hoá nút để tránh nhấn lặp.
- **Lỗi:** banner đỏ phía trên form với thông báo "Đăng nhập bằng Google thất bại. Vui lòng thử lại."

## Accessibility
- Nút có `aria-label="Sign in with Google"`.
- Tương phản màu chữ/nền đạt WCAG AA.
- Hỗ trợ điều hướng và kích hoạt bằng bàn phím (Enter/Space).
