# Backend Gateway

Backend server cho hệ thống **AIDLC Control Platform**. Đóng vai trò là Gateway/Orchestrator giữa Frontend và AI Agents, sử dụng **Supabase** làm Database và Storage.

## Kiến trúc

Tuân thủ nghiêm ngặt mô hình **Controller - Service - Model** (theo `docs/rules/layering-rules.md`):

```
src/
├── config/
│   ├── database.js        # Supabase client
│   ├── environment.js     # Environment variables
│   └── agents.js          # Agents service URLs
├── controllers/
│   ├── DocumentController # HTTP request/response handling
│   └── WorkflowController # Orchestration endpoints + SSE streaming
├── services/
│   ├── DocumentService    # File upload logic (Supabase Storage)
│   ├── WorkflowService    # Workflow orchestration & agent calls
│   └── AgentService       # Bridge to Python AI Agents
├── models/
│   ├── Document.js        # Documents table (Supabase)
│   ├── Task.js            # Tasks table (Supabase)
│   ├── Testcase.js        # Testcases table (Supabase)
│   └── index.js           # Model exports
├── routes/
│   ├── documents.js       # Document routes (upload, CRUD)
│   ├── workflows.js       # Workflow routes (agents, status)
│   └── index.js           # /api/v1 mount point
├── middleware/
│   ├── errorHandler.js    # Global error handler + ApiError
│   ├── validation.js      # Request validation middleware
│   └── logger.js          # Request logging (dev only)
└── server.js              # Express app entry point
```

## Cài đặt

```bash
npm install
```

## Cấu hình

Copy `.env.example` thành `.env` và điền thông tin Supabase:

```bash
cp .env.example .env
```

```env
# Server
PORT=3000
NODE_ENV=development

# Supabase (bắt buộc)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-project-publishable-key
SUPABASE_SECRET_KEY=sb_secret_your-project-secret-key
SUPABASE_STORAGE_BUCKET=documents
SUPABASE_AUTH_REDIRECT_URL=http://localhost:5173/auth

# AI Agents
AGENTS_BASE_URL=http://localhost:8000

# Frontend URL (for CORS + fallback redirect URL)
FRONTEND_URL=http://localhost:5173

# Upload limits (bytes)
MAX_FILE_SIZE=10485760
```

> **Lưu ý:** `SUPABASE_SECRET_KEY` là secret key server-side và có quyền bypass RLS policies.

## Supabase Setup

Tạo các bảng trong Supabase SQL Editor:

```sql
-- Documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  folder_id TEXT,
  status TEXT DEFAULT 'uploaded',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id),
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  prompt_profile TEXT,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Testcases table
CREATE TABLE testcases (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id),
  feature_name TEXT NOT NULL,
  flow_name TEXT NOT NULL,
  scenario_data JSONB,
  automation_yaml TEXT,
  yaml_filename TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tasks_document_id ON tasks(document_id);
CREATE INDEX idx_testcases_task_id ON testcases(task_id);
```

Tạo Storage Bucket tên `documents` trong Supabase Dashboard → Storage.

## Chạy server

```bash
# Development (với hot-reload)
npm run dev

# Production
npm start
```

## Deploy (Render + Vercel)

Repo đã có `render.yaml` ở thư mục root để khai báo backend service trên Render theo dạng infrastructure-as-code.

Các biến môi trường bắt buộc trên Render:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `AGENTS_BASE_URL`
- `FRONTEND_URL` (URL frontend Vercel, ví dụ `https://your-app.vercel.app`)
- `SUPABASE_AUTH_REDIRECT_URL` (ví dụ `https://your-app.vercel.app/auth`)

Frontend trên Vercel cần cấu hình:

- `VITE_API_URL=https://<render-backend-domain>/api/v1`

Auth redirect trên Supabase (để tránh bị trả về localhost):

1. Vào `Supabase Dashboard -> Authentication -> URL Configuration`.
2. Đặt `Site URL` = URL frontend production (ví dụ `https://your-app.vercel.app`).
3. Trong `Redirect URLs`, thêm cả:
   - `https://your-app.vercel.app/auth`
   - `http://localhost:5173/auth`
4. Giá trị `redirect_to` gửi từ frontend phải khớp allow-list ở trên.

Gợi ý kiểm tra sau khi deploy:

1. Gọi `GET /health` trên backend Render.
2. Mở frontend Vercel, kiểm tra các request đi đúng domain backend.
3. Nếu lỗi CORS, kiểm tra lại `FRONTEND_URL` trên Render có đúng URL production không.
4. Nếu OAuth redirect sai, kiểm tra `SUPABASE_AUTH_REDIRECT_URL` trên Render và allow-list trong Supabase.

## API Endpoints

### Documents

| Method   | Path                       | Description                           |
| -------- | -------------------------- | ------------------------------------- |
| `POST`   | `/api/v1/documents/upload` | Upload tài liệu (multipart/form-data) |
| `GET`    | `/api/v1/documents`        | List documents (có phân trang)        |
| `GET`    | `/api/v1/documents/:id`    | Get document detail                   |
| `DELETE` | `/api/v1/documents/:id`    | Delete document + file trong Storage  |

### Workflows

| Method | Path                                    | Description                            |
| ------ | --------------------------------------- | -------------------------------------- |
| `POST` | `/api/v1/workflows/extract-flows`       | Chạy Agent 1 — Trích xuất UX Flows     |
| `GET`  | `/api/v1/workflows/status/:task_id`     | SSE stream task status (real-time log) |
| `POST` | `/api/v1/workflows/resolve-unknowns`    | Resolve unknowns từ Agent 1            |
| `POST` | `/api/v1/workflows/generate-testcases`  | Chạy Agent 2 — Sinh QA Scenarios       |
| `POST` | `/api/v1/workflows/generate-automation` | Chạy Agent 3 — Sinh Automation Code    |
| `GET`  | `/api/v1/workflows/tasks/:task_id`      | Get task status (non-streaming, JSON)  |

### Health

| Method | Path      | Description  |
| ------ | --------- | ------------ |
| `GET`  | `/health` | Health check |

## Dependencies

| Package                 | Mục đích                             |
| ----------------------- | ------------------------------------ |
| `@supabase/supabase-js` | Supabase client (Database + Storage) |
| `express`               | Web framework                        |
| `multer`                | Xử lý file upload                    |
| `axios`                 | HTTP client gọi AI Agents API        |
| `uuid`                  | Tạo UUID cho records                 |
| `cors`                  | CORS middleware                      |
| `dotenv`                | Load environment variables           |

## Quy tắc kiến trúc (tóm tắt)

- **Routes**: Chỉ định nghĩa URL → chuyển tiếp sang Controllers. Không viết logic.
- **Controllers**: Nhận HTTP Request → validate → gọi Service → format Response. Không nhận `req/res` object trong Service.
- **Services**: Chứa 100% business logic. Gọi AI Agents, xử lý workflow. Không biết về HTTP framework.
- **Models**: Nơi duy nhất giao tiếp với Supabase. Các tầng khác gọi qua models.
- **Không chứa logic LLM**: Backend chỉ là bridge, không gọi LLM hay xử lý prompt.
