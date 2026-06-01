---
version: 4.0
status: final
author: AI Solutions Architect
date: "2026-05-26"
selected_models:
  primary: deepseek-v4-pro
  economy: deepseek-v4-flash
  routing: gpt-4o-mini
total_budget_est_6_weeks: 13.00
total_budget_est_per_feature: 0.045
---

# Báo cáo Kiến trúc & Chiến lược LLM

## 1. Tóm tắt Quyết định (Executive Summary)

Báo cáo này xác định việc lựa chọn LLM, cấu hình và chiến lược tối ưu hóa chi phí cho dự án **End-to-End Autonomous Software Factory (Multi-AI Agent)**.

Các quyết định kiến trúc cốt lõi:
1. **Mock First, LLM từ Tuần 3**: Các tuần đầu sử dụng mock agents. Tích hợp LLM thực sự từ Tuần 3 trở đi.
2. **Pipeline Tuần tự**: Luồng công việc (Workflow) di chuyển tuần tự qua 5 cổng kiểm duyệt của con người (HITL gates).
3. **DeepSeek làm Động cơ Cốt lõi**: Sử dụng DeepSeek V4 Pro cho các suy luận phức tạp và V4 Flash cho các tác vụ tiết kiệm.
4. **Thinking Có Chọn Lọc**: Chỉ DEV Agent (bộ phận tạo ra code thực thi được) mới bật tính năng Suy luận/Thinking. Tất cả các agent khác đều tắt Thinking.
5. **Không Bị Khóa Vendor**: Đảm bảo tương thích hoàn toàn thông qua OpenAI SDK và dự phòng (fallback) bằng OpenRouter.

## 2. Mapping Agent và Model

Pipeline điều hướng các tác vụ đến các model cụ thể dựa trên độ phức tạp của tác vụ nhằm tối ưu chi phí mà không làm giảm chất lượng.

| Agent | Loại Tác vụ | Model Được Giao | Thinking | Max Tokens |
|-------|-------------|-----------------|----------|------------|
| IntentGate | Phân loại Intent | GPT-4o-mini | OFF | 512 |
| PO Agent | Tạo PRD & Story | DeepSeek V4 Pro | OFF | 8,192 |
| UI/UX Agent | Tạo UX Spec & Wireframes | DeepSeek V4 Flash | OFF | 8,192 |
| **DEV Agent** | **Tạo Code Thực Tế** | **DeepSeek V4 Pro** | **ON** | **8,192** |
| QA Agent | Tạo Test Case | DeepSeek V4 Flash | OFF | 4,096 |
| Self-Review | Kiểm tra Output Contract | DeepSeek V4 Flash | OFF | 2,048 |

### Khối Cấu hình Agent (Machine-Readable)

```json
{
  "AGENT_MODELS": {
    "intent_gate": "gpt-4o-mini",
    "po_agent": "deepseek-v4-pro",
    "ux_agent": "deepseek-v4-flash",
    "dev_agent": "deepseek-v4-pro",
    "qa_agent": "deepseek-v4-flash",
    "self_review": "deepseek-v4-flash"
  },
  "AGENT_THINKING": {
    "dev_agent": true,
    "po_agent": false,
    "ux_agent": false,
    "qa_agent": false,
    "self_review": false
  }
}
```

## 3. Rào chắn cho DEV Agent (Guardrails)

Vì DEV Agent sử dụng V4 Pro có bật Thinking để tạo code đa tệp (multi-file), các rào chắn nghiêm ngặt là bắt buộc để ngăn chặn vượt ngân sách trong trường hợp vòng lặp vô hạn hoặc lỗi nghiêm trọng.

### Khối Cấu hình Guardrails (Machine-Readable)

```json
{
  "DEV_AGENT_CONFIG": {
    "model": "deepseek-v4-pro",
    "thinking": true,
    "max_tokens": 8192,
    "budget_cap_usd": 0.50,
    "max_rework_cycles": 2,
    "temperature": 0.0
  }
}
```

## 4. Abstraction & Chống Vendor Lock-in

Hệ thống được thiết kế để không phụ thuộc vào một nhà cung cấp cụ thể (provider-agnostic). Bằng cách sử dụng chuẩn OpenAI SDK, việc chuyển đổi nhà cung cấp (ví dụ: sang Anthropic hoặc Google qua OpenRouter) yêu cầu không cần sửa code, chỉ cần cập nhật cấu hình.

### Khối Cấu hình Provider (Machine-Readable)

```python
LLM_PROVIDERS = {
    "primary": {
        "provider_name": "deepseek",
        "base_url": "https://api.deepseek.com/v1",
        "api_key_env": "DEEPSEEK_API_KEY"
    },
    "fallback": {
        "provider_name": "openrouter",
        "base_url": "https://openrouter.ai/api/v1",
        "api_key_env": "OPENROUTER_API_KEY"
    }
}
```

### Tham khảo Code Triển khai (Python)

```python
import os
from openai import OpenAI
import json

def get_llm_client(provider_config):
    return OpenAI(
        base_url=provider_config["base_url"],
        api_key=os.getenv(provider_config["api_key_env"])
    )
```

## 5. Phân tích Chi phí & Benchmark

### 5.1. Benchmark Chất lượng

| Tiêu chí / Benchmark | DeepSeek V4 Pro | DeepSeek V4 Flash | GPT-4o | Claude 3.5 Sonnet |
|----------------------|-----------------|-------------------|--------|-------------------|
| **SWE-bench (Agentic)** | **91.2%** | N/A | ~86% | ~89% |
| **SWE-bench (Base)** | 80.6% | 79.0% | N/A | N/A |
| Context Window | 1M tokens | 1M tokens | 128K tokens | 200K tokens |

### 5.2. Ước tính Chi phí (Mỗi Feature)

Giả định Caching Context được sử dụng (tỉ lệ cache hit từ 56% đến 75%) cho các agent ở luồng sau.

| Luồng Thực thi | Ước tính Chi phí (USD) |
|----------------|------------------------|
| Happy Path (0 Lần Rework) | $0.039 |
| 1 DEV Rework (Gate 3 Bị Reject) | +$0.015 |
| 1 QA Rework (Gate 4 Bị Fail) | +$0.004 |
| **Chi phí Trung bình (Tỉ lệ Rework 30%)** | **$0.045 / feature** |

### 5.3. Dự phóng Ngân sách

| Giai đoạn | Số Features | Ước tính Chi phí (USD) |
|-----------|-------------|------------------------|
| Tuần 1-2 (Mock Mode) | 0 | $0.00 |
| Tuần 3-4 (Tích hợp LLM) | ~70 | $3.15 |
| Tuần 5-6 (Demo & Polish) | ~210 | $9.45 |
| **Tổng PoC 6 Tuần** | **~280** | **~$12.60** |
| Production (Hàng tháng với 20 feat/ngày)| ~600 | ~$27.00 |
