# System Architecture

## Core Design Principles
The AIDLC Control Platform is designed around a **Hybrid Multi-Agent Workflow** using LangGraph. The core philosophy is to balance high-quality AI outputs with strict cost controls and human oversight.

## Components

### 1. LangGraph StateMachine (`agents/src/workflows/main_pipeline.py`)
- **State Definition**: Uses a typed `PipelineState` dictionary passing contexts (PRD, UX Spec, etc.) between nodes.
- **Nodes**: Each agent (Intent, PO, UX, DEV, QA) operates as an isolated LangGraph node.
- **Edges & Routing**: Features conditional edges for the Rework loops (e.g., Sandbox Gate routing back to DEV if code verification fails).

### 2. Hybrid LLM Router (`agents/src/utils/router.py`)
- **Static Mapping**: Agents are strictly mapped to models based on their complexity (e.g., DEV uses `deepseek-v4-pro`, UX uses `gpt-4o-mini`).
- **Dynamic Fallback**: If the input token count exceeds the safe context window (e.g., 64,000 tokens), the router automatically shifts the payload to a large-context model and disables expensive modes like "Thinking".

### 3. Real-Time Streaming (Server-Sent Events)
- Python agents yield `on_chat_model_stream` events.
- Node.js consumes these via HTTP streams and forwards them to the React client using `text/event-stream`.
- Allows the UI to display a live "typewriter" effect while the AI is thinking.

### 4. Human-in-the-Loop (HITL)
- After an agent completes its phase, the Node.js backend pauses the workflow.
- A human gatekeeper reviews the generated artifact (e.g., PRD or UX Spec) in the React dashboard.
- The gatekeeper can `Approve` (continue to the next agent), `Reject`, or `Request Changes` (sending a feedback prompt back into the AI context for rework).
