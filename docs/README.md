# 📁 docs/ — Tổng quan

> Tài liệu dự án **Team 6 — End-to-End Autonomous Software Factory**
> Kiến trúc: Multica + Claude Code CLI (no API key)

---

## Cấu trúc thư mục

```
docs/
├── README.md                          ← File này
├── architecture.md                    ← Kiến trúc hệ thống (TO-BE)
├── QUALITY_GATE_RULES.md             ← Rules cho QA gate
├── CHANGELOG.md                       ← Lịch sử thay đổi
│
├── core/
│   └── AGENTS.md                      ← Cấu hình 4 agents (TO-BE)
│
├── project/
│   ├── MULTICA_INTEGRATION_PLAN.md   ← 🏆 Kế hoạch chính — đọc đây trước
│   ├── TASK_GIANG_FE.md              ← Công việc Frontend (Giang)
│   ├── TASK_MINH_BE.md               ← Công việc Backend (Minh)
│   ├── TASK_NAM_AGENT.md             ← Công việc Agent (Nam)
│   ├── 6-week-roadmap.md             ← Roadmap gốc của dự án
│   └── QA_Testing.md                 ← QA testing guidelines
│
├── process/
│   └── CONTRIBUTING.md               ← Hướng dẫn đóng góp code
│
├── research/
│   ├── blueprint.txt                  ← Blueprint research notes
│   ├── omo.txt                        ← OMO workflow research
│   ├── sequence.txt                   ← Sequence diagram notes
│   └── llm_strategy_report.md        ← LLM strategy research
│
└── archive/
    ├── week-1/                        ← Báo cáo tuần 1 (PDF)
    └── pre-multica/                   ← Docs cũ trước khi chuyển sang Multica
        ├── v4-alignment.md            ← (cũ) V4 alignment status
        ├── review_0.1.md              ← (cũ) Code review 0.1
        ├── JOURNAL.md                 ← (cũ) Dev journal
        ├── WORKLOG.md                 ← (cũ) Work log
        ├── USER_FEEDBACK.md           ← (cũ) User feedback
        └── agent-artifact-flow.md     ← (cũ) Agent artifact flow (LangGraph era)
```

---

## Đọc theo thứ tự

1. **[architecture.md](architecture.md)** — Hiểu kiến trúc tổng thể (Multica + Claude CLI)
2. **[project/MULTICA_INTEGRATION_PLAN.md](project/MULTICA_INTEGRATION_PLAN.md)** — Kế hoạch 7 ngày chi tiết
3. **[core/AGENTS.md](core/AGENTS.md)** — Chi tiết từng agent (PO/UX/DEV/QA)
4. Task file của bạn:
   - Giang: [project/TASK_GIANG_FE.md](project/TASK_GIANG_FE.md)
   - Minh: [project/TASK_MINH_BE.md](project/TASK_MINH_BE.md)
   - Nam: [project/TASK_NAM_AGENT.md](project/TASK_NAM_AGENT.md)
