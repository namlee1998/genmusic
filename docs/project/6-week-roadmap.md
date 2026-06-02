# AIDLC Control Platform - 6 Week Roadmap

## Goal

Build a runnable web app that simulates an end-to-end AI Software Development Life Cycle with:

- PO Agent
- UI/UX Agent
- DEV Agent
- QA Agent
- Human approval gates
- Artifacts
- Audit trail
- Final review packet

Mock data is acceptable, but workflow, UI, backend state, approvals, artifacts, and audit trail must run for real.

---

## Week 1 - Research, Architecture, Tools, Product Flow

### Problems To Solve

- Understand the project brief clearly.
- Research competitors and define differentiation.
- Decide architecture and tool stack.
- Define the AIDLC workflow pipeline.
- Define agent roles and contracts.
- Define human gates and audit requirements.

### Key Work

- Competitor research: Copilot, Cursor, Devin, Kiro, Q Developer, CrewAI, BMAD, OMO.
- Define product positioning: AIDLC is a workflow governance platform, not only a coding assistant.
- Choose architecture:
  - Frontend web app
  - FastAPI backend
  - LangGraph-style supervisor-worker workflow
  - MCP tool abstraction
  - A2A handoff events
  - HITL gates
  - Artifact store
  - Audit trail
- Write product flow from feature request to release decision.
- Define data contract, agent contract, output contract, and test case contract.

### Output Of Week 1

- Week 1 report: `nam_rp_w1/Team6_RPWeek1.docx`
- Competitor comparison and differentiation.
- System architecture direction.
- AIDLC workflow flow.
- Agent contract list.
- Human gate list.
- Initial mock-first demo direction.

### Done When

- Team agrees on what product must be built.
- Team agrees on architecture.
- Team agrees on tools.
- Team has clear workflow states and gates.
- Team has clear agent inputs/outputs.

---

## Week 2 - Product Skeleton

### Problems To Solve

- Need a runnable app foundation.
- Need frontend and backend connected.
- Need basic workflow state.
- Need basic navigation and demo login.

### Key Work

- Build FastAPI backend skeleton.
- Build web app shell.
- Add demo login account.
- Add sidebar tabs:
  - Workflow
  - Idea
  - Stage Inspector
  - Artifacts
  - Audit Trail
  - Admin
- Add workflow APIs:
  - `/api/start`
  - `/api/state`
  - `/api/artifacts`
  - `/api/artifact/{id}`
  - `/api/audit`
  - `/api/approve`
  - `/api/stream`
- Add initial mock-data folders.

### Output Of Week 2

- Runnable local demo app.
- Login works.
- Run Demo button starts a workflow.
- State changes are visible in UI.
- Empty artifact and audit screens are ready.

### Done When

- User can login and open app.
- User can click Run Demo.
- Frontend receives backend state.
- No broken navigation.

---

## Week 3 - Full Mock Data Demo For Team

### Problems To Solve

- Need a complete story for team review.
- Need all agents visible.
- Need mock artifacts for every phase.
- Need audit trail and basic HITL behavior.

### Key Work

- Prepare canonical feature: Google Login.
- Implement mock PO Agent.
- Implement mock UI/UX Agent.
- Implement mock DEV Agent.
- Implement mock QA Agent.
- Generate artifacts:
  - PRD
  - User stories
  - Acceptance criteria
  - UX spec
  - User flow
  - Wireframe spec
  - Implementation plan
  - Mock code diff
  - Changed files
  - Risk assessment
  - Test cases
  - QA report
  - AC coverage matrix
  - Final review packet
- Add audit events for agent stages.
- Add Stage Inspector for agent internals.
- Add request changes mock rework.

### Output Of Week 3

- Mock-data demo for the full team.
- Workflow tab shows the running graph.
- Stage Inspector explains each agent stage.
- Artifacts tab shows generated outputs.
- Audit Trail tab shows readable events.
- HITL can approve / hold / request changes.

### Done When

- Team can watch full mock run end-to-end.
- Team understands what each agent is doing.
- Team can review artifacts and audit trail.
- Feedback from team is collected for Week 4.

---

## Week 4 - Real Workflow Behavior

### Problems To Solve

- Current demo is too fixed to one mock scenario.
- User must be able to enter a feature request.
- Gates must control phase progression.
- Rework must route to the correct agent.
- Final packet must reflect the current run.

### Key Work

- Add feature request form.
- Send feature request to backend `/api/start`.
- Store feature request as the first artifact.
- Make generated artifacts reference the user request.
- Add phase gates:
  - Requirement gate
  - UX gate
  - DEV/risk gate
  - QA gate
  - Final review gate
- Add targeted rework routing:
  - Requirement issue -> PO
  - Design issue -> UI/UX
  - Code/risk issue -> DEV
  - Test/bug issue -> QA
- Generate final review packet from active workflow state.

### Output Of Week 4

- User can enter custom feature request.
- Workflow uses user input.
- Phase gates work.
- Request changes routes to correct agent.
- Final review packet is generated from current run.

### Done When

- A new feature request creates a new run.
- Gates block/continue the workflow correctly.
- Rework does not restart the whole workflow unnecessarily.
- Final packet matches actual artifacts and audit.

---

## Week 5 - Persistence, Polish, Testing

### Problems To Solve

- In-memory state is not product-ready.
- Audit and artifacts need to be easier to inspect.
- Demo must be stable.
- Core backend paths need tests.

### Key Work

- Add SQLite/Postgres persistence for:
  - workflow runs
  - artifacts
  - audit events
  - approvals
- Add run history.
- Add audit filters:
  - actor
  - worker
  - event type
  - run id
- Improve artifact viewer.
- Improve final review screen.
- Add backend tests:
  - start workflow
  - approve gate
  - request changes
  - targeted rework
  - artifact retrieval
  - audit export
- Improve UI empty/loading/error states.

### Output Of Week 5

- Persistent workflow history.
- Better artifact and audit reading experience.
- Tested core APIs.
- More stable demo.

### Done When

- Refresh does not destroy important run data.
- Audit export works.
- Artifacts remain readable.
- Main API flows pass tests.

---

## Week 6 - Final Product Demo

### Problems To Solve

- Need final integrated product.
- Need smooth end-to-end demo.
- Need remove confusing mock-only or unused UI.
- Need final bug fixing and rehearsal.

### Key Work

- Integrate full workflow.
- Fix UI bugs.
- Fix backend state bugs.
- Verify gates.
- Verify rework.
- Verify final review packet.
- Verify audit export.
- Prepare demo script.
- Rehearse final presentation.

### Output Of Week 6

- Complete runnable AIDLC Control Platform.
- Final demo flow:
  1. Login.
  2. Enter feature request.
  3. Start workflow.
  4. Inspect agents.
  5. Review artifacts.
  6. Approve or request changes at gates.
  7. Show targeted rework.
  8. Review final packet.
  9. Release or hold.
  10. Export audit trail.

### Done When

- Product runs end-to-end from UI.
- Demo can finish in 5-8 minutes.
- Judges can understand the workflow without reading source code.
- Final output is a working web app, not only a report or diagram.

---

## Final Deliverables

- Runnable web app.
- Backend API.
- Workflow engine.
- Mock agent outputs.
- Artifact viewer.
- Stage inspector.
- Human gates.
- Audit trail.
- Final review packet.
- Week 1 report.
- Final demo script.
