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

### 2. SDLC Dashboard (`/sdlc`)
Bảng điều khiển trung tâm quản lý toàn bộ vòng đời phát triển phần mềm tự động (SDLC) qua các AI Agent. Bao gồm 3 View Mode chính tương tác qua Toolbar:

*   **Pipeline View (Trình giám sát luồng Agent):**
    *   [x] **Workflow Stepper & Agent Cards:** Hiển thị 3 Agent tương ứng 3 phase (Normalizer, Designer, Generator). Trạng thái (Idle, Running, Completed, Failed).
    *   [x] **Stage Inspector:** Inspect từng bước của Agent, hiển thị logs thời gian thực từ backend (tích hợp SSE với tự động reconnect và cảnh báo timeout).
    *   [x] **Human Gate Panel (Review Gate):** Cho phép người dùng phê duyệt (Approve/Reject) kết quả của Agent 1 và Agent 2 trước khi chạy agent tiếp theo.
    *   [x] **Artifact Viewer:** Xem nội dung các artifact sinh ra từ mỗi agent (hỗ trợ hiển thị YAML và code test case, tích hợp preview spec).
*   **Kanban View (Quản lý kịch bản kiểm thử):**
    *   [x] **Kanban Board:** Kéo thả quản lý trạng thái các ca kiểm thử (Todo, In Progress, Review, Completed).
    *   [x] **Audit Sidebar:** Thanh bên hiển thị lịch sử thay đổi kịch bản kiểm thử chi tiết.
*   **Release View (Gói phát hành sản phẩm):**
    *   [x] **Final Review Packet:** Tổng hợp các artifact cuối cùng (PRD, Normalizer output, Test scenarios, YAML scripts) thành một release package thống nhất.
    *   [x] **Audit Trail Timeline:** Hiển thị toàn bộ lịch sử chạy của agent, lịch sử phê duyệt của con người và phiên bản các artifact (hỗ trợ derive phase tự động và tương thích ngược với API).
    *   [x] **Release to Production:** Nút phát hành sản phẩm, hỗ trợ mô phỏng gọi API (optimistic UI + mock endpoint).
*   **Các thành phần tích hợp khác:**
    *   [x] **PenpotPreview:** Component render bản xem trước từ Penpot UI/UX.
    *   [x] **Document Management Panel:** Quản lý upload tài liệu đầu vào (PRD, User Flow, UI Spec) tích hợp ngay trong AppShell.

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
4.  **Lỗi chuyển hướng 401 không chính xác:**
    *   *Mô tả:* Khi phiên làm việc hết hạn, interceptor chuyển hướng về `/auth` chỉ kích hoạt khi path bắt đầu bằng `/app`, tuy nhiên route thực tế là `/sdlc`.
    *   *Cách sửa:* Sửa điều kiện kiểm tra path trong [client.ts](file:///c:/Users/Admin/Desktop/AI_thucchien/group_project_2/Team_6_End-to-End-Autonomous-Software-Factory-Multi-AI-Agent/frontend/src/services/api/client.ts) từ `/app` thành `/sdlc`.
5.  **Thiếu Error Boundary toàn cục:**
    *   *Mô tả:* Hệ thống thiếu Error Boundary dẫn đến khi có lỗi runtime phát sinh ở bất cứ component nào, toàn bộ ứng dụng sẽ bị crash thành màn hình trắng.
    *   *Cách sửa:* Tạo component [ErrorBoundary.tsx](file:///c:/Users/Admin/Desktop/AI_thucchien/group_project_2/Team_6_End-to-End-Autonomous-Software-Factory-Multi-AI-Agent/frontend/src/components/ErrorBoundary.tsx) với giao diện đẹp mắt hỗ trợ song ngữ EN/VI và tích hợp bao bọc ứng dụng trong [main.tsx](file:///c:/Users/Admin/Desktop/AI_thucchien/group_project_2/Team_6_End-to-End-Autonomous-Software-Factory-Multi-AI-Agent/frontend/src/main.tsx).

---

## 🎉 Các Cải Tiến Lớn Đã Hoàn Thành (Completed Major Improvements)
 
1. **Tối ưu hóa hiệu năng & bundle size:** Thực hiện code-splitting bằng `React.lazy()`, cấu hình Manual Chunks trong Vite config thông minh để triệt tiêu Circular dependencies, chia nhỏ AppShell, tối ưu hóa toàn bộ file bundle dưới 300KB.
2. **Hoàn thiện tính năng SDLC với Mock-first:** Tích hợp nút "Release to Production" thực tế với mockup API, tối ưu timeline của Audit Trail tương thích ngược với backend, và tích hợp hiển thị Penpot preview cho các spec thiết kế UX.
3. **Bổ sung Unit Tests:** Viết các test case hoàn chỉnh cho store `useSdlcStore`, dashboard, và client SSE, tinh chỉnh các lỗi mock API, đạt trạng thái pass 100% (34/34 tests).
4. **Tinh chỉnh UI/UX (Polish):** Thêm micro-animations (hover elevation, color glow, active feedback, button animations) cho `AgentPhaseCard` bằng Framer Motion, tối ưu responsive layout tại 1024px và 768px trong `sdlc.css`.
5. **Tạo Mock Backend Server Express**: Xây dựng máy chủ giả lập Node/Express (`npm run mock` trên cổng 3000) giả lập toàn bộ API của SDLC, Auth, Backlog, Quota và stream log thời gian thực qua Server-Sent Events (SSE), hỗ trợ chạy offline toàn bộ ứng dụng.
6. **Tích hợp công cụ phân tích tĩnh Fallow**: Tích hợp Fallow dọn dẹp các tệp tin rác cũ, theo dõi sức khỏe mã nguồn ở chế độ watch mode (`npm run fallow:watch`) và loại trừ các tệp báo cáo khỏi git bằng `.gitignore`.

---

## 📋 Kế hoạch & Công việc Tiếp theo (Next Steps / TODOs)

- [ ] **Tích hợp thực tế với Backend API:** Thay thế các hàm mock của Release to Production và Audit Trail bằng các API endpoints thực tế khi Backend hoàn thành phát triển.
- [ ] **Bổ sung kiểm thử End-to-End (E2E):** Thiết lập Playwright test suite để tự động hóa toàn bộ luồng tạo dự án, kiểm thử kéo thả Kanban, chạy Agent và duyệt Quality Gate.
- [ ] **Mở rộng Dashboard Analytics:** Bổ sung giao diện phân tích hiệu suất và biểu đồ thời gian/chi phí vận hành thực tế của mỗi Agent.


