# QA Report — Đăng nhập bằng Google

## Tổng quan
- **Tổng số test case:** 18
- **Phân loại:** 4 functional · 6 negative · 4 edge · 4 security
- **Kết quả:** 18 Pass · 0 Fail · 0 Blocker
- **AC Coverage:** 6/6 = 100%
- **Bad Case Ratio:** (6 negative + 4 edge) / 18 = 55.6%
- **Khuyến nghị phát hành:** ✅ PASS

## Độ phủ Acceptance Criteria
| AC | Test cases | Phủ |
|---|---|---|
| AC-1 | TC-001 | ✅ |
| AC-2 | TC-002, TC-007, TC-015 | ✅ |
| AC-3 | TC-003, TC-008, TC-012, TC-018 | ✅ |
| AC-4 | TC-004, TC-006, TC-009, TC-013, TC-016, TC-017 | ✅ |
| AC-5 | TC-005, TC-010 | ✅ |
| AC-6 | TC-011, TC-014 | ✅ |

## Điểm nổi bật về kiểm thử
- **Bảo mật:** kiểm chống CSRF (state), không lộ khoá bí mật, cookie HttpOnly+Secure, kiểm audience của ID token.
- **Trường hợp biên:** thiếu avatar/tên, email unicode dài, chống nhấn nút lặp.
- **Trường hợp lỗi:** từ chối quyền, token sai, code hết hạn, timeout mạng, email chưa xác thực.

## Kết luận
Tất cả test case đạt, độ phủ AC 100%, không có blocker. Tính năng sẵn sàng qua Quality Gate.
