# Tiến độ Phát triển Frontend (Frontend Development Progress)

Tài liệu này ghi nhận trạng thái hiện tại, các chức năng đã hoàn thành, lỗi đã được sửa và danh sách các công việc cần thực hiện tiếp theo của phần Frontend trong dự án **Team 6 End-to-End Autonomous Software Factory**.

---

## 📊 Trạng thái Tổng quan (Overall Status)

- **Ngôn ngữ & Framework:** React (Vite + TypeScript)
- **Quản lý State:** Zustand
- **Đa ngôn ngữ (i18n):** `react-i18next` (Đã hỗ trợ song ngữ Tiếng Anh và Tiếng Việt hoàn chỉnh, chuyển đổi linh hoạt qua dropdown)
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
Bảng điều khiển trung tâm quản lý toàn bộ vòng đời phát triển phần mềm tự động (SDLC) qua các AI Agent. Được cấu trúc thành 3 View (trang) chuyên biệt điều hướng qua thanh Sub-navigation:

*   **Build View (`/sdlc`):**
    *   [x] **Workflow Stepper & Agent Cards:** Hiển thị các Agent tương ứng các phase. Trạng thái (Idle, Running, Completed, Failed).
    *   [x] **Stage Inspector:** Inspect từng bước của Agent, hiển thị logs thời gian thực từ backend (tích hợp SSE với tự động reconnect và cảnh báo timeout).
    *   [x] **Human Gate Panel (Review Gate):** Cho phép người dùng phê duyệt (Approve/Reject) kết quả của Agent trước khi chạy agent tiếp theo.
    *   [x] **McpActivityPanel:** Giám sát thời gian thực các tương tác và cuộc gọi công cụ (tool calls) của các Agent.
    *   [x] **ReleaseGatePanel:** Kiểm tra độ sẵn sàng và phê duyệt đóng gói/phát hành sản phẩm cuối cùng.
*   **Audit View (`/sdlc/audit`):**
    *   [x] **WorkflowMetricsPanel:** Biểu diễn trực quan các chỉ số vận hành (Cycle Time, tỷ lệ phê duyệt tự động, số lần chạy lại của Agent, phân phối lỗi).
    *   [x] **AuditTimeline (Run Timeline):** Hiển thị toàn bộ lịch sử chạy của agent, chuyển đổi trạng thái máy (state transitions), các lần chuyển giao A2A (A2A handoffs), và lịch sử kiểm duyệt (hỗ trợ các bộ lọc nâng cao theo vai trò và loại sự kiện).
*   **Outputs View (`/sdlc/outputs`):**
    *   [x] **ArtifactViewer:** Quản lý và duyệt toàn bộ danh sách các artifact được tạo ra và lưu trữ của các Agent trên hệ thống.
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
    *   *Cách sửa:* Thực hiện ép kiểu tường minh (`as string | undefined`) và bao bọc bằng hàm `String()` khi thực hiện mã hóa URL trong [AppShell.tsx](../src/components/layout/AppShell.tsx) và [TopBar.tsx](../src/components/layout/TopBar.tsx).
2.  **Lỗi khai báo kiểu i18next:**
    *   *Mô tả:* Lỗi thiếu khai báo kiểu của `react-i18next` gây lỗi biên dịch khi dùng hook `useTranslation`.
    *   *Cách sửa:* Khởi tạo file định nghĩa kiểu [react-i18next.d.ts](../src/react-i18next.d.ts) để đồng bộ hóa tự động các keys dịch thuật từ [translation.json](../src/locales/en/translation.json).
3.  **Lỗi React imports & Props không khớp:**
    *   *Mô tả:* Thiếu hàm hook React (`useCallback`) trong `ThemeProvider.tsx` và thừa tham số CSS `color` không hợp lệ trong các thẻ `PipelineStep` ở LandingPage.
    *   *Cách sửa:* Import đầy đủ các hook và loại bỏ các props CSS dư thừa không định nghĩa trong interface của component.
4.  **Lỗi chuyển hướng 401 không chính xác:**
    *   *Mô tả:* Khi phiên làm việc hết hạn, interceptor chuyển hướng về `/auth` chỉ kích hoạt khi path bắt đầu bằng `/app`, tuy nhiên route thực tế là `/sdlc`.
    *   *Cách sửa:* Sửa điều kiện kiểm tra path trong [client.ts](../src/services/api/client.ts) từ `/app` thành `/sdlc`.
5.  **Thiếu Error Boundary toàn cục:**
    *   *Mô tả:* Hệ thống thiếu Error Boundary dẫn đến khi có lỗi runtime phát sinh ở bất cứ component nào, toàn bộ ứng dụng sẽ bị crash thành màn hình trắng.
    *   *Cách sửa:* Tạo component [ErrorBoundary.tsx](../src/components/ErrorBoundary.tsx) với giao diện đẹp mắt hỗ trợ song ngữ EN/VI và tích hợp bao bọc ứng dụng trong [main.tsx](../src/main.tsx).
6.  **Xung đột kiểu dữ liệu và lỗi Unit Tests sau khi merge Staging:**
    *   *Mô tả:* Lỗi biên dịch TypeScript do thiếu trường `phase` và `artifact_version` trong `AuditEvent` tại `useSdlcStore.ts`, và kiểu dữ liệu `unknown` trả về từ Supabase `user_metadata` gây ra lỗi build. Đồng thời, bộ kiểm thử của `SdlcDashboard` bị lỗi `useNavigate()` do thiếu ngữ cảnh Router.
    *   *Cách sửa:* Khai báo thêm các trường tùy chọn trong interface `AuditEvent` tại [useSdlcStore.ts](../src/store/useSdlcStore.ts). Thực hiện ép kiểu tường minh `as string` cho metadata trong [AppShell.tsx](../src/components/layout/AppShell.tsx). Cuối cùng, bọc component kiểm thử trong `<MemoryRouter>` và cập nhật các assertions theo giao diện Sub-navigation mới trong [SdlcDashboard.test.tsx](../tests/SdlcDashboard.test.tsx).

---

## 🎉 Các Cải Tiến Lớn Đã Hoàn Thành (Completed Major Improvements)

1. **Tái cấu trúc giao diện SDLC Dashboard thành 3 view chuyên biệt (Build, Audit, Outputs):** Giúp nâng cao trải nghiệm người dùng, hiển thị thông tin rõ ràng và mạch lạc hơn thay thế cho dạng tabs tích hợp cũ.
2. **Nâng cấp Audit Trail & Workflow Metrics**: Thiết lập thêm các panel phân tích biểu diễn trực quan hiệu năng của Agent (Cycle Time, tỷ lệ phê duyệt tự động, v.v.), tích hợp các trường thông tin chi tiết vào Timeline (State Transitions, A2A handoffs) đi kèm bộ lọc sự kiện trực quan.
3. **Tối ưu hóa hiệu năng & bundle size:** Thực hiện code-splitting bằng `React.lazy()`, cấu hình Manual Chunks trong Vite config thông minh để triệt tiêu Circular dependencies, chia nhỏ AppShell, tối ưu hóa toàn bộ file bundle dưới 300KB.
4. **Hoàn thiện tính năng SDLC với Mock-first:** Tích hợp nút "Release to Production" thực tế với mockup API, tối ưu timeline của Audit Trail tương thích ngược với backend, và tích hợp hiển thị Penpot preview cho các spec thiết kế UX.
5. **Bảo trì & Mở rộng Unit Tests:** Viết bổ sung các ca kiểm thử mới và cập nhật các unit test của `SdlcDashboard` phù hợp với cấu trúc điều hướng mới (sử dụng Router/useNavigate), đạt tỷ lệ pass 100% trên toàn bộ hệ thống (25/25 tests).
6. **Tạo Mock Backend Server Express**: Xây dựng máy chủ giả lập Node/Express (`npm run mock` trên cổng 3000) giả lập toàn bộ API của SDLC, Auth, Backlog, Quota và stream log thời gian thực qua Server-Sent Events (SSE), hỗ trợ chạy offline toàn bộ ứng dụng.
7. **Tích hợp công cụ phân tích tĩnh Fallow**: Tích hợp Fallow dọn dẹp các tệp tin rác cũ, theo dõi sức khỏe mã nguồn ở chế độ watch mode (`npm run fallow:watch`) và loại trừ các tệp báo cáo khỏi git bằng `.gitignore`.
8. **Bản địa hóa toàn diện (i18n) & Redesign Bộ chuyển đổi Ngôn ngữ**:
   - Tách biệt toàn bộ các chuỗi giao diện (tiếng Anh & tiếng Việt) từ tất cả các component, trang và hooks sang các tệp tài nguyên JSON (`translation.json`).
   - Thiết kế lại `LanguageSwitcher` từ nút bấm đơn giản thành dropdown menu tùy chỉnh hiện đại, tích hợp icon động, hover states cao cấp và logic đóng khi click ngoài vùng chọn.
   - Cấu hình Mock i18next động trong kiểm thử (`tests/setup.ts`) giúp tự động giải quyết các khẳng định ngôn ngữ khác nhau giữa các test case của Dashboard, Auth, và Profile mà không làm lỗi luồng chạy test.
9. **Đồng bộ hóa & Hoàn thiện Chế độ Sáng/Tối (Light/Dark Theme Support)**:
   - Loại bỏ triệt để các màu nền đen/tối cứng (`bg-[#050505]`, `bg-[#0d0e13]`) và các lớp CSS thô (`slate-*`, `gray-*`) gây lỗi hiển thị trong chế độ sáng.
   - Cấu hình bổ sung các biến tùy chỉnh mới (`--color-input`, `--color-code-bg`, `--color-code-toolbar`) và thiết lập lớp tiện ích `.input-field` giúp tái sử dụng và bảo trì đồng bộ.
   - Tối ưu hóa ErrorBoundary hỗ trợ đầy đủ thiết kế thích ứng (Responsive & Adaptive Grid Overlay) hiển thị chuẩn xác ở cả hai giao diện sáng và tối.
10. **Tái cấu trúc SDLC Dashboard theo luồng Repo-first & Multica (Tích hợp mock API)**: Triển khai các component RepoInput, PipelineStepper, ApprovalQueue, QAResultCard, và DetailModal mới hỗ trợ toàn bộ quá trình giả lập và kiểm duyệt SDLC tự động một cách trực quan và mượt mà.
11. **Vô hiệu hóa cơ chế xác thực cho môi trường Local**: Hỗ trợ bypass đăng nhập ở cả frontend và backend, tự động định tuyến từ trang chủ trực tiếp tới Dashboard SDLC nhằm phục vụ quá trình phát triển và chạy thử nghiệm cục bộ nhanh chóng.
12. **Hoàn thiện AIFA v3 SDLCControlCenter**:
    - Thiết kế lại GatePanel hỗ trợ kiểm duyệt thủ công từng phase linh hoạt.
    - Cải tiến PipelineStepper hiển thị trực quan các bước tiến trình SDLC.
    - AuditLog tích hợp và ghi nhận tất cả hành động kiểm duyệt và trạng thái chuyển dịch của agent.
    - Hoàn thành giao diện FinalApproval cho việc phê duyệt release cuối cùng và bảng RepoInput nhập repo cần xử lý.
    - Tích hợp mock simulation hoàn chỉnh (20 giây chạy qua toàn bộ luồng, cấu hình qua biến môi trường `VITE_USE_MOCK=true`).
    - Cải tiến cơ chế cập nhật trạng thái với SSE (Server-Sent Events) kết hợp polling fallback ổn định khi mất kết nối.

---

## 📋 Kế hoạch & Công việc Tiếp theo (Next Steps / TODOs)

- [ ] **Tích hợp thực tế với Backend API:** Thay thế các hàm mock của Release to Production và Audit Trail bằng các API endpoints thực tế khi Backend hoàn thành phát triển.
- [ ] **Bổ sung kiểm thử End-to-End (E2E):** Thiết lập Playwright test suite để tự động hóa toàn bộ luồng tạo dự án, kiểm thử kéo thả Kanban, chạy Agent và duyệt Quality Gate.
- [ ] **Mở rộng Dashboard Analytics:** Bổ sung giao diện phân tích hiệu suất và biểu đồ thời gian/chi phí vận hành thực tế của mỗi Agent.
- [x] **Hỗ trợ ngôn ngữ Tiếng Việt (Vietnamese i18n Support):** Bổ sung đầy đủ các key dịch thuật và nội dung tiếng Việt trong file `vi/translation.json` để hệ thống hỗ trợ song ngữ hoàn chỉnh.
- [x] **Hoàn thiện tính năng chuyển đổi giao diện Sáng/Tối (Light/Dark Mode):** Đồng bộ các biến CSS và phối màu cho các component mới thêm để đảm bảo hiển thị chuẩn xác ở cả chế độ sáng và tối (tránh lỗi lệch màu sắc).
