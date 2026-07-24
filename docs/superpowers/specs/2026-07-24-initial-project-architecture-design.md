# LUMORA Initial Project Architecture Design

Date: 2026-07-24
Status: Approved direction, pending specification review

## 1. Purpose

This document defines the initial repository and runtime structure for LUMORA.
The goal is to keep Electron, Java, and Python independently understandable,
buildable, testable, and openable in their respective IDEs while retaining the
convenience of a single Git repository during early development.

The initial framework must establish boundaries and a working end-to-end task
flow. It does not attempt to implement every page or every Agent capability.

## 2. Decision

LUMORA will use one Git repository containing four independent project roots:

```text
LUMORA/
|-- desktop/                    # Electron + React + TypeScript
|-- core/                       # Java 21 + Spring Boot + MyBatis-Plus
|-- agent/                      # Python 3.12 + LangGraph
|-- protocol/                   # Protobuf contracts and generation config
|-- integration/                # Joint startup, packaging, and local config
|-- docs/
|-- artwork/
`-- generalDesign/
```

This is not a source-sharing monolith. Each runtime has its own dependency
manifest, build process, tests, configuration, and IDE project root.

Developers normally open only the project they are editing:

- `desktop/` in VS Code or WebStorm.
- `core/` in IntelliJ IDEA.
- `agent/` in PyCharm or VS Code.
- The repository root only for protocol work, integration, and packaging.

## 3. Considered Alternatives

### 3.1 Single mixed project

All source code would live under a shared `apps/`, `services/`, and `packages/`
workspace. This makes root-level orchestration convenient but causes noisy IDE
indexing and obscures the fact that the three runtimes are separate products.
It is not selected.

### 3.2 Multiple Git repositories

Desktop, Java Core, Python Agent, and protocol contracts would each have their
own repository. This provides the strongest repository isolation, but early
protocol changes would require coordinated releases and cross-repository
version updates. It is deferred until the contracts and team ownership become
stable.

### 3.3 Independent project roots in one repository

Each runtime is isolated as if it were a separate repository, while protocol
and integration changes can still be committed atomically. This is the
selected approach.

## 4. Dependency Rules

Runtime dependencies must point in one direction:

```text
Electron Renderer
      |
      | allowlisted preload IPC
      v
Electron Main
      |
      | localhost gRPC
      v
Java Local Core
      |
      | localhost gRPC
      v
Python Agent Runtime
```

The following rules are mandatory:

1. `desktop/`, `core/`, and `agent/` cannot import one another's source code.
2. Cross-process communication uses generated Protobuf contracts.
3. The Renderer cannot connect directly to Java or Python.
4. The Renderer cannot receive backend ports, startup tokens, API keys, or
   unrestricted Node.js access.
5. Java owns durable task state, permissions, approvals, audit records, local
   tools, and process lifecycle.
6. Python owns Agent reasoning, planning, model routing, and resumable graph
   execution, but does not directly operate Playwright or unrestricted system
   tools.
7. Shared business models are not placed in a general-purpose shared package.
   Each runtime maps protocol messages into its own domain types.

These rules allow any runtime to move into a separate repository later without
changing its business architecture.

## 5. Project Responsibilities

### 5.1 Desktop

`desktop/` contains Electron Main, Preload, and React Renderer.

Initial responsibilities:

- Window and application lifecycle.
- Starting and monitoring Java Local Core.
- A single gRPC client owned by Electron Main.
- Allowlisted IPC exposed through Preload.
- Application shell, navigation, task input, task execution state, and
  approval dock.
- Backend event subscription and presentation.

The first visual implementation covers the home page, task execution page, and
approval dock. Remaining artwork-backed pages receive routes and stable layout
boundaries but are not fully implemented in the first framework milestone.

### 5.2 Java Local Core

`core/` is the authoritative local backend.

Initial responsibilities:

- Health and protocol compatibility endpoints.
- SQLite initialization and schema migrations.
- Task creation and task state transitions.
- Approval and audit records.
- Python process lifecycle.
- Server-streamed task events for Electron Main.
- A minimal tool boundary for later file, browser, and system tools.

Domain services contain business rules. MyBatis-Plus mappers only perform database
access. Database entities, domain objects, Protobuf messages, and UI DTOs remain
separate.

### 5.3 Python Agent Runtime

`agent/` is an independently packaged Python service.

Initial responsibilities:

- Health and protocol compatibility endpoints.
- Accepting a task-planning request.
- Returning a deterministic planning stub before real model integration.
- Emitting progress, completion, interruption, and failure events.
- Defining the boundary for later LangGraph checkpoints and model adapters.

The initial framework does not require a real model API key.

### 5.4 Protocol

`protocol/` is the only shared cross-runtime contract source.

Initial protocol domains:

- Runtime health and version negotiation.
- Task creation and task snapshots.
- Task event stream.
- Agent planning requests and results.
- Approval requests and decisions.
- Structured error details.

Protocol packages are versioned. Breaking changes require an explicit protocol
version increase rather than relying on runtime implementation details.

### 5.5 Integration

`integration/` contains orchestration only:

- Development startup scripts.
- Port and startup-token handoff.
- Process readiness checks.
- Generated-code orchestration.
- Packaging configuration.
- Local development configuration templates.

It must not become a fourth business-logic layer.

## 6. Initial End-to-End Flow

The framework milestone proves one vertical path:

1. The user enters a goal in the Renderer.
2. Preload sends an allowlisted command to Electron Main.
3. Electron Main calls Java Local Core through gRPC.
4. Java creates and persists a task.
5. Java asks Python for a deterministic task plan.
6. Java publishes normalized task events.
7. Electron Main forwards those events through allowlisted IPC.
8. The Renderer displays progress.
9. One simulated sensitive step creates an approval request.
10. The user approves or rejects the request.
11. Java persists the decision and completes or cancels the task.
12. The Renderer displays a verifiable final state.

This flow validates the process boundaries before real file operations, browser
automation, and model calls are introduced.

## 7. Error Handling

All cross-process errors use a structured protocol shape containing:

- Stable error code.
- User-safe message.
- Retryability.
- Correlation ID.
- Optional developer details that are excluded from normal UI.

Expected failure behavior:

- If Java is unavailable, Electron shows a local service startup state and can
  retry without freezing the Renderer.
- If Python is unavailable, Java marks the task as interrupted rather than
  losing it.
- If protocol versions are incompatible, startup fails with a clear diagnostic.
- If an event stream reconnects, the client fetches the latest task snapshot
  before applying new events.
- Approval timeout or rejection produces an explicit terminal or paused state.
- Secrets and raw model payloads are excluded from user-facing messages and
  normal logs.

## 8. Testing Strategy

Each project owns its unit tests:

- Desktop: component behavior, IPC boundary, and state transition tests.
- Java: domain state machine, persistence, approval, and gRPC service tests.
- Python: planning contract, event generation, and interruption tests.
- Protocol: generation checks and backward-compatibility checks.

Repository-level integration tests cover:

- Three-runtime health checks.
- Task creation and event streaming.
- Approval and rejection paths.
- Java restart with persisted task recovery.
- Python failure translated into a recoverable Java task state.

An Electron end-to-end test verifies the visible vertical flow. Tests must not
require a third-party model key for the initial milestone.

## 9. Development and IDE Experience

Each project supplies its own run configuration and README. Root-level scripts
are wrappers, not required for ordinary isolated development.

Generated protocol code is written into project-specific generated directories
and excluded from broad IDE indexing where supported. Python virtual
environments, Node dependencies, Java targets, databases, logs, and runtime
secrets are ignored by Git.

No root-level tool should force IntelliJ to treat the Node and Python code as
Java modules.

## 10. Initial Milestone Acceptance Criteria

The initial framework is complete when:

1. `desktop/`, `core/`, and `agent/` can be opened, built, and tested
   independently.
2. Protocol code can be generated reproducibly for TypeScript, Java, and
   Python.
3. A documented command starts all three runtimes for local development.
4. All runtimes expose health and compatible protocol versions.
5. The desktop application can create a task and display streamed progress.
6. The task passes through one approval or rejection path.
7. Java persists the task, events, approval, and audit record in SQLite.
8. Restarting a failed Python runtime does not discard the Java task record.
9. No real model API key is needed for automated tests or the demo flow.
10. The Electron security boundary keeps Node.js, backend connection details,
    and secrets out of the Renderer.

## 11. Deferred Scope

The following work is intentionally deferred until the vertical framework is
stable:

- Complete implementation of all artwork pages.
- Real file mutation and Windows automation.
- Playwright browser workflows.
- Third-party model providers and credential UI.
- OCR, embeddings, reranking, and document pipelines.
- External MCP servers.
- Auto-update and production installer hardening.
- Full Agent Office animation system.
- Splitting the four project roots into separate Git repositories.
