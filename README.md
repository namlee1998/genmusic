# AIDLC Control Platform (Team 6)

Welcome to the **End-to-End Autonomous Software Factory** built by Team 6. This project is a cutting-edge platform designed to completely automate the Software Development Life Cycle (SDLC) using multi-AI agents, LangGraph state management, and an interactive React-based dashboard.

## Overview

The platform consists of three main components:
1. **AI Agents (`/agents`)**: A Python/LangGraph backend that powers 5 specialized AI Agents (Intent, PO, UX, DEV, QA).
2. **Backend (`/backend`)**: A Node.js/Express service that acts as an API gateway, connects to Supabase, and proxies real-time Server-Sent Events (SSE).
3. **Frontend (`/frontend`)**: A React/Vite dashboard providing a premium UI for Human-in-the-loop (HITL) gate approvals, real-time logging, and artifact viewing.

## Getting Started

### 1. Prerequisites
- Node.js (v18+)
- Python (3.10+)
- Supabase account and project

### 2. Environment Setup
You must configure the environment variables for each service.
- **Backend**: Copy `backend/.env.example` to `backend/.env` and fill in your `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
- **Frontend**: Copy `frontend/.env.example` to `frontend/.env`.
- **Agents**: Copy `agents/.env.example` to `agents/.env` and provide your `OPENAI_API_KEY` (and `OPENAI_API_BASE` if using a custom gateway like Litellm).

### 3. Chế Độ Chạy Giả Lập Tiết Kiệm (Hybrid Mock Mode)
Nếu bạn đang dev UI/UX ở Frontend và không muốn tốn tiền API (Token) cho các con AI Agent, bạn có thể bật chế độ giả lập. 
Trong file `backend/.env`, chỉnh biến `USE_MOCK_AGENTS=true`. Hệ thống sẽ không gọi xuống cổng `8000` của Python nữa mà sẽ lấy data tĩnh trong thư mục `mock-data/` để trả về ngay lập tức cho Frontend.

### 4. Running the Services

You need three terminal windows to run the system:

**Terminal 1 (Backend):**
```bash
cd backend
npm install
npm run dev
```

**Terminal 2 (AI Agents):**
```bash
cd agents
pip install -r requirements.txt
python main.py
```

**Terminal 3 (Frontend):**
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173` in your browser. Use the mock admin credentials (`admin@vfs.com` / `admin123`) if configured, or your Supabase auth credentials.

## Documentation

To help you understand the architecture, vision, and detailed design of the system, the project documentation has been consolidated into the `/docs` directory:

*   **Core Systems:**
    *   [Architecture Overview](docs/core/ARCHITECTURE.md) - High-level system structure and data flow.
    *   [AI Agents](docs/core/AGENTS.md) - Role description and specifications of PO, UX, DEV, and QA Agents.
    *   [Project Blueprint](docs/core/blueprint.md) - Detailed vision and scope of the autonomous software factory.
    *   [Sequence Flow](docs/core/sequence.md) - BMAD Human-in-the-Loop flow sequence diagram.
*   **Processes & Quality:**
    *   [QA Testing Guide](docs/process/QA_Testing.md) - Testing workflows, manual verification, and test status.
    *   [Code Review Report v0.1](docs/process/review_0.1.md) - Structural audit of codebase v0.1.
    *   [Contributing Guide](docs/process/CONTRIBUTING.md) - Guidelines for contributing code.
*   **Planning & References:**
    *   [6-Week Roadmap](docs/planning/6-week-roadmap.md) - Phase targets and delivery timeline.
    *   [User Feedback](docs/planning/USER_FEEDBACK.md) - Human review and system improvement notes.
    *   [OMO & HITL Reference](docs/reference/omo.md) - Detailed guide to OMO runtime loop & hooks.

## License
MIT License
