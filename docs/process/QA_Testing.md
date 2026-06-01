US-2: User Management – Quản lý User, Role, Status & Audit

As a system administrator/service,
I want to tạo, cập nhật, khóa, phân quyền và audit user account,
So that hệ thống quản lý user an toàn, kiểm soát truy cập chính xác và có khả năng truy vết đầy đủ.

Acceptance Criteria
User được tạo với thông tin hợp lệ và password được hash an toàn.
Hỗ trợ role-based access control (RBAC).
Hỗ trợ activate/deactivate/lock user.
Mọi thay đổi user phải được audit log.
Không lưu plaintext password tại DB/log/cache.
User status thay đổi phải có hiệu lực realtime với access token/session.
Tasks
T2.1 — Xây dựng User Management Service
Thiết kế API contract:
POST /users
PUT /users/{id}
GET /users/{id}
DELETE /users/{id}
Validate email/phone uniqueness.
Implement create/update/delete user lifecycle.
Implement password hashing bằng Argon2/Bcrypt.
Implement optimistic locking/version control cho update user.
Không persist plaintext password.
T2.2 — Implement Role-Based Access Control (RBAC)
Thiết kế role hierarchy:
ADMIN
SUPPORT
PARTNER
CUSTOMER
Mapping user ↔ role.
Implement permission evaluation middleware.
Support multi-role per user.
Support dynamic permission reload.
T2.3 — Implement User Status Management
Hỗ trợ trạng thái:
ACTIVE
INACTIVE
LOCKED
SUSPENDED
Khi user bị lock/suspend:
revoke session/token hiện tại
reject request mới
Support auto-lock sau N lần login fail.
T2.4 — Implement Audit Logging
Log toàn bộ action:
create user
update role
reset password
deactivate account
Audit log gồm:
actor
timestamp
action
target-user-id
correlation-id
Audit log immutable.
Test Cases
TC-2-01 — Tạo user thành công với password hashing
Type: Functional · Priority: P0 · Maps to: T2.1, AC1
Precondition: User Management Service đang chạy.
Test data:
email = user@test.com
password = P@ssw0rd123
Steps:
Gọi POST /users.
Inspect DB record.
Expected result:
✅ User được tạo thành công.
Password được hash bằng Argon2/Bcrypt.
Không lưu plaintext password.
TC-2-02 — Không cho phép duplicate email
Type: Validation · Priority: P0 · Maps to: T2.1
Precondition: Email user@test.com đã tồn tại.
Steps:
Tạo thêm user với cùng email.
Expected result:
⛔ Trả lỗi 409 duplicate email.
Không tạo record mới.
TC-2-03 — Không persist plaintext password
Type: Security · Priority: P0 · Maps to: T2.1, AC5
Steps:
Tạo user.
Grep DB/log/cache/tracing.
Expected result:
⛔ Không tìm thấy plaintext password ở bất kỳ đâu.
TC-2-04 — User update sử dụng optimistic locking
Type: Concurrency · Priority: P1 · Maps to: T2.1
Steps:
Client A đọc user version = 1.
Client B update user → version = 2.
Client A update bằng version cũ.
Expected result:
⛔ Update của Client A fail với 409 version conflict.
TC-2-05 — Assign role cho user
Type: Functional · Priority: P0 · Maps to: T2.2, AC2
Steps:
Assign role SUPPORT.
Login bằng user đó.
Access API dành cho SUPPORT.
Expected result:
✅ Access được API đúng permission.
TC-2-06 — User không đủ quyền truy cập resource
Type: Security · Priority: P0 · Maps to: T2.2
Precondition: User role = CUSTOMER.
Steps:
Gọi API admin-only.
Expected result:
⛔ Trả lỗi 403 forbidden.
TC-2-07 — Hỗ trợ multi-role user
Type: Functional · Priority: P1 · Maps to: T2.2
Steps:
Assign role SUPPORT + PARTNER.
Access API của cả 2 role.
Expected result:
✅ User có permission hợp lệ từ cả 2 role.
TC-2-08 — Lock user account
Type: Security · Priority: P0 · Maps to: T2.3, AC3
Steps:
Lock user.
Thử login lại.
Gọi API với token cũ.
Expected result:
⛔ Login fail.
⛔ Token cũ bị revoke.
⛔ API trả 401/403.
TC-2-09 — Auto-lock sau nhiều lần login fail
Type: Security · Priority: P1 · Maps to: T2.3
Steps:
Login sai password N lần liên tiếp.
Expected result:
✅ User bị chuyển trạng thái LOCKED.
Có audit log ghi nhận.
TC-2-10 — Activate lại user bị suspended
Type: Functional · Priority: P1 · Maps to: T2.3
Steps:
Suspend user.
Reactivate user.
Login lại.
Expected result:
✅ User login được bình thường sau khi ACTIVE.
TC-2-11 — Audit log khi update role
Type: Audit · Priority: P0 · Maps to: T2.4, AC4
Steps:
Update role user.
Inspect audit log.
Expected result:
✅ Có log:
actor
action
timestamp
target-user-id
correlation-id
TC-2-12 — Audit log immutable
Type: Security · Priority: P1 · Maps to: T2.4
Steps:
Thử modify audit log record.
Expected result:
⛔ Không thể update/delete audit log.
TC-2-13 — Delete user soft-delete
Type: Functional · Priority: P1 · Maps to: T2.1
Steps:
Delete user.
Query DB.
Expected result:
✅ User được mark deleted=true.
Không hard delete dữ liệu.
TC-2-14 — Invalid role assignment
Type: Negative · Priority: P1 · Maps to: T2.2
Steps:
Assign role không tồn tại.
Expected result:
⛔ Trả lỗi 400 invalid role.
TC-2-15 — Service fail khi DB unavailable
Type: Reliability · Priority: P0 · Maps to: T2.1
Steps:
Shutdown DB.
Gọi create user API.
Expected result:
⛔ Request fail an toàn.
Không tạo partial record.
Có error log + monitoring alert.
(Lưu ý: Hiện tại đang fake nghiệp vụ, còn template tương tự)