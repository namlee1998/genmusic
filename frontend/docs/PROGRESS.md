# Tiến độ Phát triển Frontend (Frontend Development Progress)

Tài liệu này ghi nhận trạng thái hiện tại, các chức năng đã hoàn thành, lỗi đã được sửa và danh sách các công việc cần thực hiện tiếp theo của phần Frontend trong dự án **Team 6 End-to-End Autonomous Software Factory**.

---

## 📊 Trạng thái Tổng quan (Overall Status)

- **Ngôn ngữ & Framework:** React (Vite + TypeScript)
- **Quản lý State:** Zustand
- **Đa ngôn ngữ (i18n):** `react-i18next` (hỗ trợ Tiếng Anh và Tiếng Việt)
- **Styling:** Tailwind CSS + Vanilla CSS (Custom styling cho các Dashboard phức tạp)
- **Độ sạch của Code (Code Quality):**
  - **Lỗi TypeScript:** 0 lỗi (Đã sửa đổi toàn bộ các lỗi ép kiểu Supabase metadata, React imports, và các props không khớp).
  - **Lỗi ESLint:** 0 lỗi cảnh báo nghiêm trọng trong code nghiệp vụ chính.

---

## 🖥️ Chi tiết các Trang & Thành phần (Pages & Components Status)

### 1. Landing Page (`/` hoặc `/landing`)
Trang giới thiệu chính của sản phẩm với giao diện tối ưu hóa SEO, hiện đại, và mượt mà.
- [x] Giao diện giới thiệu sản phẩm (Hero Section)
- [x] Hiển thị các bước quy trình SDLC (Pipeline Steps)
- [x] Tích hợp i18n chuyển đổi ngôn ngữ
- [x] Nút điều hướng CTA (Call-to-Action) dẫn tới Dashboard/Auth

### 2. SDLC Dashboard (`/dashboard`)
Bảng điều khiển trung tâm quản lý toàn bộ vòng đời phát triển phần mềm tự động (SDLC) qua các AI Agent. Bao gồm 4 Tab chính:

*   **Tab 1: Quản lý tài liệu (Virtual Document Management)**
    *   [x] Giao diện kéo thả Upload tài liệu (Spec, PDF, Docx, TXT)
    *   [x] Collapsible Folder Tree (Cây thư mục ảo) để tổ chức tài liệu
    *   [x] Side-panel "Quick Preview" hiển thị nội dung tài liệu nhanh chóng
    *   [x] Full-screen Preview modal
*   **Tab 2: Phân tích luồng (Flow Analysis)**
    *   [x] Hiển thị quy trình xử lý của Agent 1 (Phân tích đặc tả hành vi của người dùng từ tài liệu)
    *   [x] Tương tác xem biểu đồ luồng/Timeline của các Agent
*   **Tab 3: Kịch bản kiểm thử (Test Scenarios & Kanban)**
    *   [x] Kanban Board quản lý trạng thái các ca kiểm thử (Test cases)
    *   [x] Phối hợp duyệt thủ công thông qua Human Gate Panel
*   **Tab 4: Kết quả thực thi (Execution Results)**
    *   [x] Báo cáo chi tiết kết quả chạy kiểm thử từ sandbox
    *   [x] Trình xem log/artifact của Agent trong quá trình sinh code

### 3. Trang Quản trị (Admin Panel - `/admin`)
- [x] **Admin Dashboard:** Tổng quan thống kê hệ thống (lượt sử dụng, số lượng project, API calls)
- [x] **Admin Funnel:** Biểu đồ phễu chuyển đổi và tương tác người dùng
- [x] **Admin Users:** Quản lý danh sách người dùng, phân quyền hệ thống

### 4. Auth & Xác thực (`/auth`)
- [x] Trang Đăng nhập & Đăng ký tích hợp Supabase Auth
- [x] Quản lý session và đồng bộ thông tin user về global store (`useAppStore`)

### 5. Profile & Cài đặt dự án (`/profile`, `/settings`)
- [x] **Profile:** Xem thông tin cá nhân, cập nhật avatar, Metadata công ty & vai trò công việc
- [x] **Project Settings:** Cấu hình biến môi trường, API keys, các webhook cho dự án cụ thể

---

## 🛠️ Các Lỗi Đã Được Sửa Gần Đây (Recent Bug Fixes)

1.  **Lỗi Types của Supabase User Metadata:**
    *   *Mô tả:* Metadata của user (`company_name`, `job_title`) trả về từ Supabase mặc định có kiểu `{}` gây ra lỗi build TypeScript.
    *   *Cách sửa:* Thực hiện ép kiểu tường minh (`as string | undefined`) và bao bọc bằng hàm `String()` khi thực hiện mã hóa URL trong [AppShell.tsx](file:///c:/Users/Admin/Desktop/AI_thucchien/group_project_2/Team_6_End-to-End-Autonomous-Software-Factory-Multi-AI-Agent/frontend/src/components/layout/AppShell.tsx) và [TopBar.tsx](file:///c:/Users/Admin/Desktop/AI_thucchien/group_project_2/Team_6_End-to-End-Autonomous-Software-Factory-Multi-AI-Agent/frontend/src/components/layout/TopBar.tsx).
2.  **Lỗi khai báo kiểu i18next:**
    *   *Mô tả:* Lỗi thiếu khai báo kiểu của `react-i18next` gây lỗi biên dịch khi dùng hook `useTranslation`.
    *   *Cách sửa:* Khởi tạo file định nghĩa kiểu [react-i18next.d.ts](file:///c:/Users/Admin/Desktop/AI_thucchien/group_project_2/Team_6_End-to-End-Autonomous-Software-Factory-Multi-AI-Agent/frontend/src/react-i18next.d.ts) để đồng bộ hóa tự động các keys dịch thuật từ [translation.json](file:///c:/Users/Admin/Desktop/AI_thucchien/group_project_2/Team_6_End-to-End-Autonomous-Software-Factory-Multi-AI-Agent/frontend/src/locales/en/translation.json).
3.  **Lỗi React imports & Props không khớp:**
    *   *Mô tả:* Thiếu hàm hook React (`useCallback`) trong `ThemeProvider.tsx` và thừa tham số CSS `color` không hợp lệ trong các thẻ `PipelineStep` ở LandingPage.
    *   *Cách sửa:* Import đầy đủ các hook và loại bỏ các props CSS dư thừa không định nghĩa trong interface của component.

---

## 📋 Kế hoạch & Công việc Tiếp theo (Next Steps / TODOs)

- [ ] **Kết nối API Real-time:** Hoàn thiện tích hợp WebSockets/SSE từ backend cho các agent cập nhật trạng thái pipeline ngay lập tức lên giao diện.
- [ ] **Tối ưu hóa UI/UX:** Thêm các micro-animations tinh tế cho các thẻ Agent Card và Kanban Board để tạo cảm giác mượt mà (premium design).
- [ ] **Bổ sung Unit Tests:** Viết các test case cơ bản cho các hook Zustand và các component dùng chung (`Button`, `ResizablePanels`).
- [ ] **Hoàn thiện Dark Mode:** Đảm bảo toàn bộ các thành phần mới thêm (AuditSidebar, FinalReviewPacket, PenpotPreview) hỗ trợ hoàn hảo cả giao diện sáng và tối.
