# Prompt Hỗ Trợ Thiết Kế UI/UX (Dành cho AI Design Tools)

**System Personas & Goal:**
You are an expert UI/UX Designer. I want you to design a highly professional, modern, and clean B2B SaaS dashboard for a "Multi-Agent Auto Testcase Generator" platform. The platform uses AI to read product specifications and outputs executable YAML automation test scripts.

**General Layout & Theme:**

- **Navigation:** A persistent Left Sidebar acting as the main navigation with 4 main tabs. Unselected tabs should look muted, while the active tab should have a strong visual indicator.
- **Visual Style:** Minimalist, highly functional, lots of whitespace. Use modern web fonts (e.g., Inter, Geist, or Roboto). Apply subtle borders and shadows to separate zones. Color scheme: Neutral grays and whites for backgrounds, with a modern Indigo or Sharp Blue as the primary accent color.
- **Micro-interactions:** Add hover states for buttons, files, and sleek transition cues.
Please mock up the following 4 distinct screens based on the 4 sidebar tabs:

### Screen 1: Virtual Document Management (Tab: Quản lý tài liệu)

- **Primary Goal:** Workspace for uploading and organizing raw spec files (PDF, Word, PNG, TXT).
- **UI Elements:**
  - **Virtual Folders Pane:** A collapsible folder tree or folder cards layout for CRUD operations (Create, Read, Update, Delete folders).
  - **Upload Zone:** A prominently displayed Drag-and-Drop area at the top or center.
  - **File List/Grid:** Display uploaded files with icons representing their formats (.docx, .pdf, .png). Include columns/metadata: Name, Type, Uploaded Date, Status.
  - **Preview Feature:** When a user clicks a file, display a "Quick Preview" side-panel overlaid on the right. Include an expand button that triggers a "Full Screen Preview" modal UI over the whole screen.

### Screen 2: Scenario Spec Generation - Agent 1 (Tab: Phân tích luồng)

- **Primary Goal:** Visualize how Agent 1 extracts User Behaviors/Flows from the raw documents.
- **UI Elements:**
  - **Two-Column Split View:**
    - _Left Panel (Input):_ Read-only view of the selected document.
    - _Right Panel (Output):_ A rich-text/markdown viewer displaying the structured user flows.
  - **Agent Live Execution (Observability):** Between the columns or hovering, there should be an interactive "Terminal/Log Timeline" block that shows the Agent's real-time thinking process. Examples: "🧠 Thinking...", "🛠 Using tool: Extractor...", "✅ Extracted 5 flows...". Use skeleton loading, spinners, and green tick icons.

### Screen 3: Test Scenario Design - Agent 2 (Tab: Kịch bản thử nghiệm)

- **Primary Goal:** Visualize the transformation from generic user flows to QA-level structured manual testcases (Happy & Negative paths).
- **UI Elements:**
  - Similar split layout, but the _Left Panel_ is now the Output from Agent 1, and the _Right Panel_ is the new Testcase Output.
  - **Traceability UX:** Show a visual connection. For example, if a testcase on the right is selected, the specific parent logic line on the left is highlighted.
  - **Agent Steps:** A stepper or visual chips tracking the AI's internal process: "Validating flow" -> "Generating paths" -> "Adding Negative Cases".

### Screen 4: AutoMobile YAML Export - Agent 3 (Tab: Xuất kịch bản YAML)

- **Primary Goal:** Display the final output which consists of multiple executable YAML scripts mapping to UI actions, and let users preview/download them.
- **UI Elements:**
  - **YAML File Explorer:** A visually distinct area displaying a list or grid of generated `.yaml` file cards (e.g., `login_test.yaml`, `checkout_test.yaml`).
  - **Syntax-Highlighted Code Preview:** When a file card is clicked, a large IDE-like code editor panel (VSCode style, dark mode code block) opens, showing the YAML script.
  - **Actions:** Each YAML card should have "Preview", "Copy", and "Download" buttons. A global floating action button to "Download All (ZIP)".

**Output Requirements:**
Generate the full high-fidelity layout. If you are a code-generator AI (like v0 or Bolt), please output the full React/Tailwind code with responsive grid layouts, placeholder images/text, and fully working tab-switching logic showing these 4 screens. Make it look exceptionally premium.
