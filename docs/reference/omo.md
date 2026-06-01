Báo cáo: OMO Workflow và Human-in-the-Loop (HITL)
Bản Word-ready: sơ đồ đã được render thành ảnh PNG để đưa vào báo cáo

1. Nhận định chính
OMO không giống BMAD ở điểm HITL không tự nhiên xuất hiện qua chuyển session. OMO là execution harness chạy sâu trong
terminal/coding loop, nên HITL phải được inject bằng IntentGate, Prometheus Interview, lifecycle hooks, manual interrupt, /pause-/resume và configdriven permissions.
Cách thiết kế đúng: quan sát toàn bộ, log toàn bộ, nhưng chỉ yêu cầu approve ở các hành động rủi ro cao.

2. Sơ đồ tổng OMO Workflow + HITL

Hình 1. Workflow tổng của OMO và các điểm HITL nên gắn vào hệ thống.

3. Cách đọc sơ đồ tổng
Bước
1

Khối
User + ultrawork

2

IntentGate

3

Sisyphus

4

Category Router

5

tmux Parallel Execution

6

Ralph Loop + Todo Enforcer

7

Output + Recovery

Ý nghĩa
User đưa task cho OMO bằng command ultrawork
[task description].
Phân tích intent, scope, complexity; hỏi lại nếu
input mơ hồ.
Orchestrator lập plan, chia việc, delegate subagent.
Route task sang visual/deep/quick/ultrabrain và
chọn model phù hợp.
Nhiều agent chạy song song, giao tiếp bằng
team_* tools.
Tự review, tự sửa nếu chưa đạt; ép agent quay lại
task nếu idle/missed task.
Deliver output; nếu context limit hit thì lưu
checkpoint và /resume.

4. Bảng mapping HITL mechanisms
Mechanism
Prometheus Interview
IntentGate Clarification
Lifecycle Hooks
Manual Interrupt
/pause + /resume
Config Permissions

Trigger
User gõ Tab hoặc /start-work
Input ambiguous
after_plan, before_tool_call,
before_file_edit, on_task_complete
User Ctrl+C hoặc nhập instruction
mới
Custom hook nhận command
Agent muốn dùng tool/file ngoài
scope

Human action
Trả lời câu hỏi hoặc stop interview
Clarify intent
Pause/approve/reject/revise
Dừng hoặc đổi hướng agent

Mục đích
Làm rõ task trước khi execution sâu.
Tránh agent hiểu sai task.
Inject policy và review gate vào
runtime.
Can thiệp bất cứ lúc nào.

Freeze rồi resume
Grant/deny permission

Tạm dừng có kiểm soát.
Ngăn unauthorized actions.

5. Lifecycle Hooks: nơi inject HITL

Hình 2. Hook lifecycle của OMO và các điểm có thể pause/approve/review.

6. Risk-based HITL để tránh approve fatigue

Hình 3. Chính sách HITL theo rủi ro: không approve mọi hành động.

7. Câu chốt đưa vào báo cáo
OMO tự động hóa execution bằng IntentGate, Sisyphus, Category Router, tmux parallel agents, Ralph Loop và Todo Enforcer. Tuy
nhiên, để dùng trong môi trường có kiểm soát, HITL phải được inject qua Prometheus Interview, lifecycle hooks, manual
interrupt, /pause-/resume và config permissions. Human có thể quan sát toàn bộ quá trình, nhưng chỉ cần approve ở các điểm rủi
ro cao.


