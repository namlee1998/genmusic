# -*- coding: utf-8 -*-
"""Team6_RPWeek1.pdf – 10 trang, section 5 gọn"""
import os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── fonts ─────────────────────────────────────────────────────
FD = "C:/Windows/Fonts/"
for n,f in [("TNR","times.ttf"),("TNR-B","timesbd.ttf"),
            ("TNR-I","timesi.ttf"),("Ar","arial.ttf"),
            ("Ar-B","arialbd.ttf"),("Ar-I","ariali.ttf")]:
    pdfmetrics.registerFont(TTFont(n, FD+f))

# ── palette ───────────────────────────────────────────────────
NAVY  = colors.HexColor("#1F3864"); NAVY2 = colors.HexColor("#2E5090")
TEAL  = colors.HexColor("#17375E"); GRN   = colors.HexColor("#375623")
ORNG  = colors.HexColor("#7B3F00"); PURP  = colors.HexColor("#4B0082")
RED_D = colors.HexColor("#7B0000"); MS    = colors.HexColor("#C8522A")
HDR   = colors.HexColor("#1F3864"); ALT   = colors.HexColor("#EEF5FB")
LBL   = colors.HexColor("#EBF5FB"); GRAY  = colors.HexColor("#555555")
GRAY_L= colors.HexColor("#AAAAAA"); WHITE = colors.white; BLACK = colors.black

TW = 16.0  # usable table width (cm) — A4 595pt − 2×2.5cm margins

# ── style factory ─────────────────────────────────────────────
def sty(name,font="TNR",sz=10,lead=14,color=BLACK,align=TA_LEFT,
        sb=0,sa=3,li=0):
    return ParagraphStyle(name,fontName=font,fontSize=sz,leading=lead,
                          textColor=color,alignment=align,
                          spaceBefore=sb,spaceAfter=sa,leftIndent=li)

SB   = sty("b",   sz=10,lead=14,sa=4,align=TA_JUSTIFY)
SBB  = sty("bb",  font="TNR-B",sz=10,lead=14,sa=4)
SIT  = sty("it",  font="TNR-I",sz=9,lead=13,color=GRAY,align=TA_JUSTIFY)
SN   = sty("n",   font="TNR-I",sz=8,lead=11,color=GRAY)
H1   = sty("h1",  font="TNR-B",sz=14,lead=18,color=NAVY,sb=10,sa=4)
H2   = sty("h2",  font="TNR-B",sz=11,lead=15,color=NAVY2,sb=7,sa=3)
COV  = sty("cov", font="TNR-B",sz=22,lead=28,color=NAVY,align=TA_CENTER,sa=6)
COVS = sty("covs",font="TNR-B",sz=13,lead=17,color=NAVY2,align=TA_CENTER,sa=4)
FT   = sty("ft",  font="Ar",sz=8,lead=11,color=GRAY_L,align=TA_CENTER)
TH   = sty("th",  font="Ar-B",sz=8,lead=11,color=WHITE,align=TA_CENTER)
THL  = sty("thl", font="Ar-B",sz=8,lead=11,color=WHITE)
TD   = sty("td",  font="Ar",sz=8,lead=11)
TDC  = sty("tdc", font="Ar",sz=8,lead=11,align=TA_CENTER)
TDB  = sty("tdb", font="Ar-B",sz=8,lead=11,color=NAVY)

CENTER_VALS = {"Có","Không","Một phần","Tự xây","Mock","Real","Mock (log)",
               "—","Cao","Thấp","Trung bình","N/A","1","2","3","4","5","6"}

def B(t): return f'<font name="TNR-B">{t}</font>'
def I(t): return f'<font name="TNR-I">{t}</font>'
sp  = lambda h=0.15: Spacer(1, h*cm)
hr  = lambda w=0.5,c=GRAY_L: HRFlowable(width="100%",thickness=w,color=c,
                                          spaceAfter=3,spaceBefore=3)
blt = lambda t: Paragraph("• "+t, sty("bl",sz=10,lead=14,li=10,sa=2))
h1  = lambda n,t: Paragraph(f"{n}.&nbsp;&nbsp;{t}", H1)
h2  = lambda n,t: Paragraph(f"{n}&nbsp;&nbsp;{t}", H2)

def tbl(rows, widths, hdr=1, fs=8, vp=4, hdr_color=HDR):
    data = []
    for ri,row in enumerate(rows):
        cells = []
        for ci,cell in enumerate(row):
            if isinstance(cell, str):
                if ri < hdr:
                    st = THL if ci == 0 else TH
                elif cell in CENTER_VALS or (ci > 0 and len(cell) <= 10):
                    st = TDC
                else:
                    st = TD
                cells.append(Paragraph(cell, st))
            else:
                cells.append(cell)
        data.append(cells)
    t = Table(data, colWidths=[w*cm for w in widths], repeatRows=hdr)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,hdr-1), hdr_color),
        ("FONTNAME",      (0,0),(-1,hdr-1), "Ar-B"),
        ("FONTSIZE",      (0,0),(-1,-1), fs),
        ("FONTNAME",      (0,hdr),(-1,-1), "Ar"),
        ("TOPPADDING",    (0,0),(-1,-1), vp),
        ("BOTTOMPADDING", (0,0),(-1,-1), vp),
        ("LEFTPADDING",   (0,0),(-1,-1), 5),
        ("RIGHTPADDING",  (0,0),(-1,-1), 5),
        ("GRID",          (0,0),(-1,-1), 0.35, colors.HexColor("#B8CCE4")),
        ("ROWBACKGROUNDS",(0,hdr),(-1,-1), [WHITE, ALT]),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ]))
    return t

def kv_box(pairs, key_w=4.0, bg=LBL):
    rows = [[Paragraph(k,TDB), Paragraph(v,TD)] for k,v in pairs]
    t = Table(rows, colWidths=[key_w*cm, (TW-key_w)*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(0,-1), bg),
        ("GRID",          (0,0),(-1,-1), 0.3, colors.HexColor("#B8CCE4")),
        ("TOPPADDING",    (0,0),(-1,-1), 4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
        ("LEFTPADDING",   (0,0),(-1,-1), 5),
        ("RIGHTPADDING",  (0,0),(-1,-1), 5),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ]))
    return t

def banner(text, color=NAVY, fc=WHITE, fs=10):
    t = Table([[Paragraph(text, sty("bn",font="Ar-B",sz=fs,lead=14,color=fc))]],
               colWidths=[TW*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), color),
        ("TOPPADDING",    (0,0),(-1,-1), 5),
        ("BOTTOMPADDING", (0,0),(-1,-1), 5),
        ("LEFTPADDING",   (0,0),(-1,-1), 8),
    ]))
    return t

def quote_box(text):
    t = Table([[Paragraph(I(text), sty("q",font="TNR-I",sz=10,lead=14,
                                        color=NAVY2,align=TA_JUSTIFY))]],
               colWidths=[TW*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), colors.HexColor("#EEF4FB")),
        ("BOX",           (0,0),(-1,-1), 1.2, NAVY),
        ("TOPPADDING",    (0,0),(-1,-1), 8),
        ("BOTTOMPADDING", (0,0),(-1,-1), 8),
        ("LEFTPADDING",   (0,0),(-1,-1), 12),
        ("RIGHTPADDING",  (0,0),(-1,-1), 12),
    ]))
    return t

def commit_box(text):
    t = Table([[Paragraph(text, sty("cm",font="TNR-B",sz=10,lead=15,
                                     color=NAVY2,align=TA_CENTER))]],
               colWidths=[TW*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), colors.HexColor("#EEF4FB")),
        ("BOX",           (0,0),(-1,-1), 1.2, NAVY),
        ("TOPPADDING",    (0,0),(-1,-1), 10),
        ("BOTTOMPADDING", (0,0),(-1,-1), 10),
        ("LEFTPADDING",   (0,0),(-1,-1), 14),
        ("RIGHTPADDING",  (0,0),(-1,-1), 14),
    ]))
    return t

# ── OUTPUT ────────────────────────────────────────────────────
OUT = (r"D:\work\thucchien\team6"
       r"\Team_6_End-to-End-Autonomous-Software-Factory-Multi-AI-Agent"
       r"\nam_rp_w1\Team6_RPWeek1.pdf")
doc = SimpleDocTemplate(OUT, pagesize=A4,
      leftMargin=2.5*cm, rightMargin=2.5*cm,
      topMargin=2.0*cm,  bottomMargin=2.0*cm,
      title="AIDLC – Báo cáo Tuần 1", author="Team 6")
S = []

# ══════════════════════════════════════════════════════
# PAGE 1 – COVER + TOC
# ══════════════════════════════════════════════════════
S += [sp(1.5),
    Paragraph("BÁO CÁO TUẦN 1", COV),
    Paragraph("END-TO-END AUTONOMOUS SOFTWARE FACTORY", COVS),
    Paragraph("Multi-AI Agent Platform — AIDLC Control Platform",
              sty("cs",font="TNR-I",sz=11,lead=15,color=GRAY,align=TA_CENTER)),
    sp(0.5), hr(1.5, NAVY), sp(0.3)]

S.append(kv_box([
    ("Nhóm thực hiện",  "Team 6 — AI Product Development"),
    ("Báo cáo viên",    "Nam Lee  (namltmta@gmail.com)"),
    ("Ngày báo cáo",    "29/05/2026"),
    ("Phạm vi tuần 1",  "Research, Kiến trúc, MCP Tool Bus, Workflow, Roadmap 6 tuần"),
], key_w=3.8, bg=ALT))
S += [sp(0.5), hr(1.5, NAVY), sp(0.5)]

S.append(Paragraph("MỤC LỤC", H1))
S.append(hr(0.8, NAVY))
S.append(sp(0.1))

toc_items = [
    ("1",  "Tóm tắt thực hiện (Executive Summary)"),
    ("2",  "Nghiên cứu đối thủ cạnh tranh"),
    ("3",  "Định vị sản phẩm & Tính năng khác biệt"),
    ("4",  "Kiến trúc hệ thống"),
    ("5",  "MCP Tool Bus — Công cụ tích hợp"),
    ("6",  "Workflow SDLC Tự động"),
    ("7",  "Các Agent AI & Data Contracts"),
    ("8",  "Cổng kiểm duyệt con người (HITL Gates)"),
    ("9",  "Roadmap 6 tuần thực tế"),
    ("10", "Rủi ro & Kết luận"),
]
for num, title in toc_items:
    S.append(Paragraph(
        f'<font name="TNR-B">{num}</font>&nbsp;&nbsp;&nbsp;{title}',
        sty("tc", sz=10, lead=15, sa=1)))

S.append(PageBreak())

# ══════════════════════════════════════════════════════
# PAGE 2 – S1 EXECUTIVE SUMMARY + S2 COMPETITORS
# ══════════════════════════════════════════════════════
S += [h1("1","Tóm tắt thực hiện (Executive Summary)"), hr(0.8,NAVY), sp(0.1),
    Paragraph(
        f"Team 6 đã hoàn thành nghiên cứu thị trường, thiết kế kiến trúc và lập lộ trình 6 tuần "
        f"cho {B('AIDLC Control Platform')} — nền tảng điều phối SDLC tự động bằng đa AI Agent "
        f"với HITL governance và immutable audit trail.", SB),
    sp(0.1)]
S.append(kv_box([
    ("Nền tảng công nghệ",    "FastAPI 3.11 + LangGraph + React/Vite + Supabase"),
    ("Kiến trúc",             "Supervisor-Worker song song: 1 Supervisor → PO, UX, DEV, QA"),
    ("MCP Tool Bus",          "Abstraction layer: Notion, Figma, GitHub, Jira, TestRail, Slack"),
    ("Chiến lược phát triển", "Mock First — không phụ thuộc service ngoài cho đến tuần 6"),
    ("Milestone Tuần 3",      "Demo mock hoàn chỉnh 4 agents + HITL + Audit Trail"),
    ("Milestone Tuần 6",      "Sản phẩm real data + MCP_MODE=real + MCP tools thật"),
    ("Điểm khác biệt",        "HITL governance + Immutable Audit Trail + MCP Bus chuẩn hóa"),
], key_w=4.0))
S.append(sp(0.2))

S += [h1("2","Nghiên cứu đối thủ cạnh tranh"), hr(0.8,NAVY), sp(0.1),
    tbl([
        ["Sản phẩm",          "Loại",                   "Điểm mạnh",                          "Điểm yếu / Thiếu sót"],
        ["GitHub Copilot",    "AI Code Assistant",       "IDE integration, autocomplete nhanh","Chỉ code; không PO/UX/QA; không HITL; không audit"],
        ["Cursor",            "AI Code Editor",          "Chat codebase, context dài",         "Chỉ developer; không HITL; không audit trail"],
        ["Devin (Cognition)", "Autonomous Dev Agent",    "End-to-end tự động, issue-to-PR",    "Black box; không audit; không HITL; chi phí rất cao"],
        ["Amazon Kiro",       "AI Spec-to-Code",         "Spec → code tự động",               "Thiếu UX + QA agent; không HITL gates rõ ràng"],
        ["Amazon Q Developer","AI Dev Assistant",         "AWS integration, security scan",     "Chỉ code + review; không đủ SDLC pipeline"],
        ["CrewAI",            "Multi-Agent Framework",   "Flexible orchestration, OSS",        "Cần tự xây workflow + UI; không sẵn SDLC pipeline"],
        ["BMAD Method",       "AI Planning Framework",   "Cấu trúc hóa PRD và user story tốt","Chỉ tài liệu; không automation; không UI"],
        ["OMO Workflow",      "AI Workflow Tool",         "Business process automation",        "Không tập trung SDLC; thiếu code + QA agent"],
    ], [2.8, 3.0, 4.2, 6.0]),
    sp(0.1),
    Paragraph(
        f"{B('Khoảng trống:')} Không sản phẩm nào có đủ: "
        "Workflow PO→UX→DEV→QA song song  +  HITL gates  +  Immutable Audit Trail  "
        "+  Targeted Rework  +  MCP Bus chuẩn hóa.", SB),
    sp(0.15)]

# ══════════════════════════════════════════════════════
# PAGE 3 – S3 POSITIONING + S4 ARCHITECTURE
# ══════════════════════════════════════════════════════
S += [h1("3","Định vị sản phẩm & Tính năng khác biệt"), hr(0.8,NAVY), sp(0.1),
    quote_box('"AIDLC Control Platform là nền tảng quản trị SDLC tự động (AI-SDLC Governance Platform) '
              '— không chỉ là công cụ hỗ trợ code. Con người kiểm soát tại các cổng quan trọng; '
              'mọi quyết định được ghi lại và có thể audit."'),
    sp(0.15),
    tbl([
        ["Tính năng",                          "AIDLC", "Copilot",  "Devin",    "CrewAI"],
        ["PO Agent — PRD + User Story + AC",   "Có",    "Không",    "Một phần", "Tự xây"],
        ["UX/UI Agent — Wireframe + UX Spec",  "Có",    "Không",    "Không",    "Tự xây"],
        ["DEV Agent — Code Diff + Risk",       "Có",    "Có",       "Có",       "Tự xây"],
        ["QA Agent — Test Cases + Bug report", "Có",    "Không",    "Một phần", "Tự xây"],
        ["HITL Gates — Approve/Reject/Rework", "Có",    "Không",    "Không",    "Không"],
        ["Immutable Audit Trail",              "Có",    "Không",    "Không",    "Không"],
        ["Targeted Rework Routing",            "Có",    "Không",    "Không",    "Không"],
        ["MCP Tool Bus chuẩn hóa",             "Có",    "Không",    "Một phần", "Không"],
    ], [6.0, 2.5, 2.5, 2.5, 2.5]),
    sp(0.2)]

S += [h1("4","Kiến trúc hệ thống"), hr(0.8,NAVY), sp(0.1),
    tbl([
        ["Tầng",          "Công nghệ",                                    "Lý do chọn"],
        ["Frontend",      "React 18 + Vite + CSS Grid/Flexbox",            "SPA nhanh, hot reload"],
        ["Backend API",   "FastAPI (Python 3.11) + Uvicorn",               "Async native, tích hợp LangGraph"],
        ["Orchestration", "LangGraph — Supervisor-Worker pattern",         "State machine, parallel fan-out"],
        ["Streaming",     "Server-Sent Events (SSE)",                      "Real-time, không cần WebSocket"],
        ["Database",      "Supabase (PostgreSQL hosted)",                  "Hosted, realtime, auth sẵn"],
        ["MCP Tool Bus",  "Notion, Figma, GitHub, Jira, TestRail, Slack",  "Abstraction layer, testable, swappable"],
    ], [3.0, 7.0, 6.0]),
    sp(0.1),
    Paragraph(
        f"{B('Supervisor-Worker:')} Fan-out → PO/UX/DEV/QA chạy song song. "
        "Fan-in → tổng hợp artifacts. "
        f"{B('Targeted rework')} → chỉ restart worker có lỗi. "
        "Mỗi worker có run_id + parent_id riêng → audit độc lập.", SB),
    sp(0.1),
    tbl([
        ["SSE Event", "Payload chính",                                 "Mục đích"],
        ["state",     "workflow_state, status, worker_status, progress","Cập nhật trạng thái toàn bộ UI"],
        ["artifact",  "key, label, phase",                              "Thông báo artifact mới tạo ra"],
        ["audit",     "id, actor, action, ts, run_id, parent",          "Thêm dòng vào Audit Trail real-time"],
    ], [2.5, 7.5, 6.0]),
    sp(0.15), PageBreak()]

# ══════════════════════════════════════════════════════
# PAGE 4 – S5 MCP  (gọn: 2 bảng, không lý thuyết)
# ══════════════════════════════════════════════════════
S += [h1("5","MCP Tool Bus — Công cụ tích hợp"), hr(0.8,NAVY), sp(0.1),
    Paragraph(
        f"AIDLC tích hợp {B('6 MCP tools')} qua một bus duy nhất. "
        "Hiện tại đang dùng Mock Adapter (trả response từ mock-data folder, không cần account hay network). "
        f"Tuần 6 bật real adapters bằng một config: {B('MCP_MODE=real')}.", SB),
    sp(0.15)]

# Bảng 1: Tool — Agent — Calls — Artifact
S.append(tbl([
    ["Tool",         "Agent sử dụng", "Calls đang thực hiện",                                              "Artifact tạo ra"],
    ["Notion MCP",   "PO Agent",      "create_page  →  update_page (Stories+AC)  →  publish_page",         "PRD page, User Stories block, AC block trong Notion workspace"],
    ["Figma MCP",    "UX/UI Agent",   "prepare_frames  →  create_components  →  export_tokens",            "Figma file URL, design token JSON, component spec cho DEV consume"],
    ["GitHub MCP",   "DEV Agent",     "read_context  →  create_branch  →  create_pull_request  →  get_ci_status", "Branch name, PR URL, CI status, changed_files.json"],
    ["Jira MCP",     "QA Agent",      "create_issue (severity + owner)  →  update_issue (link TC)",         "Bug ticket ID (BUG-001…), Jira URL, bug ownership report"],
    ["TestRail MCP", "QA Agent",      "create_test_run  →  update_test_result  →  get_coverage_report",    "Test Run ID, AC Coverage Matrix, QA Report pass/fail"],
    ["Slack MCP",    "Supervisor",    "post_message (HITL gate open)  →  post_approval_result",             "Slack message link, notification log trong audit trail"],
], [2.3, 2.3, 5.8, 5.6]))

S.append(sp(0.2))

# Bảng 2: trạng thái Mock/Real theo tuần
S.append(tbl([
    ["Tool",         "Tuần 1–2",   "Tuần 3 (Demo)", "Tuần 4–5",   "Tuần 6"],
    ["Notion MCP",   "Mock",       "Mock",           "Mock",        "Real"],
    ["Figma MCP",    "Mock",       "Mock",           "Mock",        "Real"],
    ["GitHub MCP",   "Mock",       "Mock",           "Mock",        "Real"],
    ["Jira MCP",     "Mock",       "Mock",           "Mock",        "Real"],
    ["TestRail MCP", "Mock",       "Mock",           "Mock",        "Real"],
    ["Slack MCP",    "Mock (log)", "Mock (log)",     "Mock (log)",  "Real"],
], [3.2, 3.2, 3.2, 3.2, 3.2]))

S += [sp(0.15), PageBreak()]

# ══════════════════════════════════════════════════════
# PAGE 5 – S6 WORKFLOW + S7 AGENTS
# ══════════════════════════════════════════════════════
S += [h1("6","Workflow SDLC Tự động"), hr(0.8,NAVY), sp(0.1),
    tbl([
        ["#",  "Trạng thái",            "Actor",        "Mô tả"],
        ["1",  "DRAFT→SUPERVISOR_INIT", "Human User",   "Nhập feature request — Supervisor tạo run mới với run_id"],
        ["2",  "SUPERVISOR_INIT",        "Supervisor",   "Phân tích intent, kiểm tra clarity, lên execution plan"],
        ["3",  "WORKERS_RUNNING",        "Supervisor",   "Fan-out: PO, UX, DEV, QA nhận task và chạy song song"],
        ["4",  "PO_RUNNING",             "PO Agent",     "Intent parse → PRD → Stories+AC → Contract publish (Notion MCP)"],
        ["5",  "UX_RUNNING",             "UX Agent",     "Consume PRD → User flow → Wireframe → Token handoff (Figma MCP)"],
        ["6",  "DEV_RUNNING",            "DEV Agent",    "Consume contract → Impl plan → Code diff → Risk+CI (GitHub MCP)"],
        ["7",  "QA_RUNNING",             "QA Agent",     "Consume build → Generate tests → E2E + report (Jira+TestRail MCP)"],
        ["8",  "SUPERVISOR_FAN_IN",      "Supervisor",   "Thu thập artifacts, tổng hợp Final Review Packet, notify Slack"],
        ["9",  "HITL_REVIEW",           "Human (HITL)", "Review — Approve / Reject / Request Changes (targeted rework)"],
        ["10", "READY / REJECTED",       "Supervisor",   "Release hoặc kết thúc, full audit trail được lưu"],
    ], [0.6, 3.6, 2.7, 9.1]),
    sp(0.1),
    tbl([
        ["A2A Contract",         "Sender",    "Receivers",      "Nội dung"],
        ["product_contract.v1",  "PO Agent",  "UX, DEV, QA",    "PRD, User Stories, Acceptance Criteria"],
        ["design_handoff.v1",    "UX Agent",  "DEV",            "Wireframe spec + design tokens (Figma MCP export)"],
        ["build_artifact.v1",    "DEV Agent", "QA, Supervisor", "Code diff + changed_files + risk_assessment"],
        ["qa_result.v1",         "QA Agent",  "Supervisor",     "Test results + bug ownership + PASS/FAIL signal"],
    ], [3.8, 2.2, 2.8, 7.2]),
    sp(0.15)]

S += [h1("7","Các Agent AI & Data Contracts"), hr(0.8,NAVY), sp(0.1),
    tbl([
        ["Agent",       "Stages",                                                          "Output Artifacts",                                           "MCP calls",                                       "A2A gửi đi"],
        ["PO Agent",    "Intent parse → PRD draft\n→ Stories+AC → Contract publish",      "prd.md, user_stories.md,\nacceptance_criteria.md, scope.md", "Notion:\ncreate/update/publish",                  "product_contract.v1\n→ UX, DEV, QA"],
        ["UX/UI Agent", "Consume PRD → User flow\n→ Wireframe → Token handoff",           "ux_spec.md, user_flow.md,\nwireframe_spec.md, component_inventory.md","Figma:\nprepare_frames, export_tokens",       "design_handoff.v1\n→ DEV"],
        ["DEV Agent",   "Consume contract → Impl plan\n→ Code diff → Risk+CI handoff",    "implementation_plan.md,\ncode_diff.md, changed_files.json,\nrisk_assessment.md","GitHub:\ncreate_branch, create_PR,\nget_ci_status","build_artifact.v1\n→ QA, Supervisor"],
        ["QA Agent",    "Consume build → Generate tests\n→ Run E2E + report",             "test_cases.md, qa_report.md,\nac_coverage_matrix.md",          "Jira: create_issue;\nTestRail: create_run,\nupdate_result","qa_result.v1\n→ Supervisor"],
    ], [2.0, 4.0, 3.8, 3.2, 3.0]),
    sp(0.15), PageBreak()]

# ══════════════════════════════════════════════════════
# PAGE 6 – S8 HITL GATES
# ══════════════════════════════════════════════════════
S += [h1("8","Cổng kiểm duyệt con người (HITL Gates)"), hr(0.8,NAVY), sp(0.1),
    Paragraph(
        f"Sau fan-in, hệ thống chuyển sang {B('HITL_REVIEW')} và chờ quyết định. "
        "Đây là tầng bảo vệ cuối trước khi release.", SB),
    sp(0.1),
    tbl([
        ["Gate",               "Trigger",                                      "Hành động",                                         "Kết quả"],
        ["Normal HITL Review", "Risk=LOW, QA PASS",                            "Approve / Request Changes / Reject",                 "Approve→READY; Changes→Rework; Reject→REJECTED"],
        ["Risk=HIGH Block",    "DEV phát hiện auth / DB schema thay đổi",      "Tick xác nhận risk_assessment.md bắt buộc\n→ Accept & Approve / Reject","Không approve nếu chưa tick; risk ack ghi log"],
        ["QA Fail — BLOCKER",  "QA báo bug mức BLOCKER",                       "Send to DEV / Re-run QA / Force Override",           "DEV rework → QA re-run → quay lại HITL"],
        ["Force Override",     "Reviewer cần release gấp dù còn blocker",      "Nhập business justification bắt buộc",               "WORKFLOW_FORCE_RELEASED — ghi audit không xóa được"],
    ], [3.0, 3.8, 4.5, 4.7]),
    sp(0.15),
    Paragraph(f"{B('Targeted Rework Routing')} — Supervisor tự suy luận từ nội dung feedback:", SBB),
    sp(0.05),
    tbl([
        ["Nội dung feedback HITL",                        "Agent được restart"],
        ["Đề cập PRD / requirement / AC / user story",    "PO Agent"],
        ["Đề cập design / wireframe / mobile / layout",   "UX/UI Agent"],
        ["Đề cập code / auth / performance / risk / DB",  "DEV Agent"],
        ["Đề cập test / bug / coverage / QA report",      "QA Agent"],
        ["Chỉ nhắc 'bug' / 'blocker' / 'fail' chung",     "QA Agent (triage mặc định)"],
    ], [10.0, 6.0]),
    sp(0.1),
    Paragraph(I("Sau rework, workflow tự động quay lại HITL_REVIEW — không chạy lại toàn bộ pipeline."), SN),
    sp(0.15), PageBreak()]

# ══════════════════════════════════════════════════════
# PAGE 7-8 – S9 ROADMAP
# ══════════════════════════════════════════════════════
S += [h1("9","Roadmap 6 tuần thực tế"), hr(0.8,NAVY), sp(0.05),
    Paragraph(
        f"Nguyên tắc: {B('Mock First → Real Behavior → Production Ready')}. "
        f"Milestone cứng: {B('Tuần 3')} — mock demo; {B('Tuần 6')} — real data + MCP thật.", SB),
    sp(0.1)]

weeks = [
    ("9.1","Tuần 1  (26/05 – 01/06)  Research & Architecture", NAVY, "",
     [("Nghiên cứu",    "8 đối thủ: Copilot, Cursor, Devin, Kiro, Q Developer, CrewAI, BMAD, OMO"),
      ("Kiến trúc",     "Supervisor-Worker LangGraph; 4 agents + MCP Tool Bus + HITL gates"),
      ("Contracts",     "Định nghĩa A2A contracts, data contracts, 6 MCP tools, audit requirements"),
      ("Output",        "Báo cáo tuần 1 (tài liệu này), kiến trúc, workflow diagram")]),
    ("9.2","Tuần 2  (02/06 – 08/06)  Product Skeleton", TEAL, "",
     [("Backend",  "FastAPI skeleton: /api/start, /api/state, /api/artifacts, /api/approve, /api/stream (SSE)"),
      ("Frontend", "React app: login, sidebar navigation, Workflow/Inspector/Artifacts/Audit/Admin"),
      ("MCP Bus",  "MCP Tool Bus với Mock Adapter — 6 tools trả mock response từ mock-data folder"),
      ("Output",   "App chạy local, login, Run Demo button nhận SSE state từ backend")]),
    ("9.3","Tuần 3  (09/06 – 15/06)  MILESTONE 1 — Full Mock Demo", GRN,
     "MILESTONE 1: Demo mock data hoàn chỉnh — Team Review",
     [("4 Mock Agents",  "PO (4 stages) + UX (4 stages) + DEV (4 stages) + QA (3 stages) chạy song song, có MCP mock calls"),
      ("16+ Artifacts",  "PRD, Stories, AC, UX Spec, Wireframe, Code Diff, Risk Assessment, Test Cases, QA Report, ..."),
      ("HITL + Rework",  "Approve / Reject / Request Changes + targeted rework routing hoạt động đúng"),
      ("Output",         "Demo chạy end-to-end: feature request → 4 agents → HITL → audit export JSON/CSV")]),
    ("9.4","Tuần 4  (16/06 – 22/06)  Real Workflow Behavior", ORNG, "",
     [("Feature form",  "User nhập bất kỳ feature request; artifacts sinh từ input thực tế, không hardcode"),
      ("Phase gates",   "Gate logic chặn/mở đúng theo workflow state; targeted rework routing chính xác"),
      ("Output",        "Feature request mới → run mới với run_id; gates + rework hoạt động đúng")]),
    ("9.5","Tuần 5  (23/06 – 29/06)  Persistence, Polish & Testing", PURP, "",
     [("Supabase",    "Persist workflow runs, artifacts, audit events, approvals, MCP call logs"),
      ("Run history", "Xem lại các runs trước; audit filters: actor, worker, event type, run_id, tool"),
      ("Tests",       "Backend tests: start, approve, request_changes, artifact retrieval, audit export"),
      ("Output",      "Refresh không mất data; core APIs pass tests; stable demo")]),
    ("9.6","Tuần 6  (30/06 – 06/07)  MILESTONE 2 — Production Ready", RED_D,
     "MILESTONE 2: Sản phẩm hoàn chỉnh với Real Data + MCP Tools thật",
     [("MCP_MODE=real", "Bật 6 real adapters: Notion/Figma/GitHub/Jira/TestRail/Slack — không sửa agent code"),
      ("Real data",     "PRD thật trong Notion, branch thật trên GitHub, bug thật trên Jira, test run thật"),
      ("Demo script",   "Rehearse 5–8 phút: Login → Feature → Start → Inspect → Review → Rework → Export"),
      ("Output",        "AIDLC Platform hoàn chỉnh; giám khảo hiểu workflow không cần đọc source code")]),
]

for no, title, color, ms, task_pairs in weeks:
    block = [banner(f"{no}.  {title}", color)]
    if ms:
        block.append(banner(f"★  {ms}", MS, WHITE, 9))
    rows = [["Hạng mục", "Nội dung"]] + [[k, v] for k, v in task_pairs]
    block.append(tbl(rows, [3.0, 13.0], hdr_color=color))
    block.append(sp(0.12))
    S.append(KeepTogether(block[:3]))
    S.append(block[-1])

S += [sp(0.1),
    tbl([
        ["Tuần", "Thời gian",    "Giai đoạn",             "MCP",  "Milestone"],
        ["1",    "26/05–01/06",  "Research & Architecture","—",    "Báo cáo W1, kiến trúc, MCP list"],
        ["2",    "02/06–08/06",  "Product Skeleton",       "Mock", "App, login, APIs, SSE, MCP Bus mock"],
        ["3",    "09/06–15/06",  "Mock Demo Complete",     "Mock", "★ Full mock demo — team review"],
        ["4",    "16/06–22/06",  "Real Workflow Behavior", "Mock", "Custom input, phase gates, rework"],
        ["5",    "23/06–29/06",  "Persistence & Polish",   "Mock", "Supabase, tests, stable"],
        ["6",    "30/06–06/07",  "Production Ready",       "Real", "★ Final demo — real MCP + real data"],
    ], [1.0, 3.0, 4.5, 2.0, 5.5]),
    sp(0.15), PageBreak()]

# ══════════════════════════════════════════════════════
# PAGE 9-10 – S10 RISKS + CONCLUSION
# ══════════════════════════════════════════════════════
S += [h1("10","Rủi ro & Kết luận"), hr(0.8,NAVY), sp(0.1),
    tbl([
        ["Rủi ro",                             "Xác suất",  "Tác động",  "Biện pháp xử lý"],
        ["SSE bị ngắt giữa chừng",             "Trung bình","Trung bình","Heartbeat ping 20s + auto-reconnect frontend"],
        ["Data mất khi restart server (W1–W2)","Cao",       "Thấp",      "In-memory reset là expected; Supabase từ W5"],
        ["Demo W3 không kịp tiến độ",          "Thấp",      "Cao",       "Mock data chuẩn bị từ W2; không cần service ngoài"],
        ["MCP real adapter lỗi ở W6",          "Trung bình","Trung bình","Mock adapter là fallback ngay lập tức"],
        ["Scope creep ngoài plan",             "Trung bình","Cao",       "Freeze scope sau W3; chỉ fix bugs từ W4 trở đi"],
    ], [4.5, 2.2, 2.2, 7.1]),
    sp(0.2),
    Paragraph(
        f"Team 6 đã xác lập nền tảng vững chắc: nghiên cứu đối thủ, "
        f"kiến trúc {B('Supervisor-Worker')}, {B('MCP Tool Bus')} gọn — 6 tools, 1 config để bật real — "
        f"và lộ trình 6 tuần rõ ràng. {B('AIDLC Control Platform')} khác biệt ở ba trụ cột: "
        f"{B('HITL governance')}, {B('immutable audit trail')}, "
        f"và {B('MCP Bus')} dễ mở rộng.", SB),
    sp(0.1),
    Paragraph(f"{B('Hành động tuần 2:')}", SBB)]
for a in [
    "Dựng FastAPI skeleton + commit GitHub (branch: features/backend-skeleton)",
    "React app + Vite, sidebar navigation, routing",
    "Implement /api/start và /api/stream SSE endpoint",
    "Implement MCP Tool Bus với Mock Adapter cho 6 tools",
    "Viết mock-data files cho canonical feature: Google Login",
    "Setup Supabase project + cấu hình .env; demo cuối tuần 2",
]:
    S.append(blt(a))

S += [sp(0.3),
    commit_box(f"{B('Cam kết Team 6:')}<br/>"
               "Tuần 3: Demo mock hoàn chỉnh — team thấy workflow + MCP call flow.<br/>"
               "Tuần 6: Sản phẩm hoàn chỉnh — MCP_MODE=real, data và tools thật."),
    sp(0.3), hr(0.5, GRAY_L),
    Paragraph("Team 6 — AIDLC Control Platform — Báo cáo Tuần 1 — 29/05/2026", FT)]

# ── BUILD ──────────────────────────────────────────────────────
doc.build(S)
size = os.path.getsize(OUT)/1024
print(f"[OK] {size:.0f} KB  →  {OUT}")
