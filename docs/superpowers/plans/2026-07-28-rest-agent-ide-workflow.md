# LUMORA REST Agent 与 IDE 独立启动实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Java Core 与 Python Agent 从 gRPC + Protobuf 迁移到本机 REST/JSON，删除一键启动器，并让 Python、Java、Electron 可通过各自 IDE 和本机私有 YAML 独立启动。

**Architecture:** Java Core 继续掌握任务状态、SQLite、审批和权限，通过稳定的 `AgentRuntimeClient` 接口调用 Python FastAPI。Python Controller 只处理认证、协议、DTO 和 HTTP 错误映射，业务仍由 `PlannerService` 完成。三个模块各自读取被 Git 忽略的本机开发配置；共享 OpenAPI 只作为人工契约，不生成源码。

**Tech Stack:** Python 3.12、FastAPI 0.140、Uvicorn 0.51、Pydantic 2、PyYAML 6；Java 21、Spring Boot 3.5、Spring MVC `RestClient`、MyBatis-Plus、Liquibase、SQLite；Electron 37、TypeScript、YAML 2、pnpm 11。

## Global Constraints

- Electron ↔ Java 保持 REST/SSE；Java ↔ Python 固定为 REST/JSON。
- 当前阶段不保留 gRPC 双栈，不保留 Protobuf、Buf 或任何生成代码步骤。
- 当前阶段不提供根级一键启动命令，三个运行时分别从 IDE 启动。
- Java 保持传统 `Controller → Service → Mapper` 分层与普通 Java `class`，禁止使用 `record`。
- Python 按 `controller/http`、`dto`、`security`、`service`、`model`、`config` 分责，继续使用 `requirements.txt` 和 `requirements-dev.txt`。
- Java 是任务状态、数据、审批和权限的唯一权威；Python 不直接操作 Java 数据库。
- Java、Python、Electron 的真实 `dev-local.yml` 必须被 Git 忽略，只提交不含真实 Token 的 `.example.yml`。
- 三个本机开发配置使用同一个仅限本机调试的启动 Token；正式打包随机 Token 不在本计划实现。
- Java/Python 内部服务 Token 与未来用户 Access Token 是不同安全边界，当前不实现登录、用户表、套餐或云计费。
- 所有服务只监听或调用 `127.0.0.1`；认证、协议校验、HTTP 错误映射、事务、迁移和生命周期边界使用中文注释。
- `artwork/` 和 `generalDesign/` 保持未跟踪，不得暂存；只在最后一步本地同步总体设计。

---

## File Structure

### Shared contract

- Create `contracts/agent-api.yaml`: Python Agent OpenAPI contract, documentation only.
- Delete `protocol/`: remove Protobuf, Buf, generators and contract-shape test after both runtimes migrate.

### Python Agent

- Create `agent/config/dev-local.example.yml`: safe local configuration template.
- Create `agent/app/config/yaml_loader.py`: strict local YAML loading.
- Modify `agent/app/config/settings.py`: settings from validated YAML mapping.
- Create `agent/app/dto/request/plan_task_request.py`.
- Create `agent/app/dto/response/health_response.py`.
- Create `agent/app/dto/response/plan_step_response.py`.
- Create `agent/app/dto/response/plan_task_response.py`.
- Create `agent/app/dto/response/error_response.py`.
- Create `agent/app/security/request_authenticator.py`.
- Create `agent/app/controller/http/agent_controller.py`.
- Modify `agent/app/main.py`: FastAPI/Uvicorn lifecycle.
- Delete `agent/app/controller/grpc/`.
- Replace `agent/tests/controller/grpc/` with HTTP/config tests.
- Modify `agent/requirements.txt` and `agent/requirements-dev.txt`.

### Java Core

- Move `core/.../grpc/client/AgentRuntimeClient.java` to `core/.../agent/client/`.
- Replace `GrpcAgentRuntimeClient.java` with `HttpAgentRuntimeClient.java`.
- Move `AgentPlanStep.java` to `core/.../agent/model/`.
- Create Agent HTTP request/response DTO classes under `core/.../agent/dto/`.
- Create `core/.../agent/exception/AgentRuntimeException.java`.
- Create `core/.../agent/config/AgentClientConfiguration.java`.
- Modify `CoreProperties.java`, `application.yml`, `TaskServiceImpl.java` and tests.
- Create `core/src/main/resources/application-dev-local.example.yml`.
- Modify `core/pom.xml`: remove gRPC/Protobuf dependencies, properties, extension and plugin.

### Electron Desktop

- Create `desktop/config/dev-local.example.yml`.
- Create `desktop/src/main/config/dev-config.ts`.
- Modify `desktop/src/main/index.ts` and related tests.
- Modify `desktop/package.json`: remove `@grpc/grpc-js`, add `yaml`.
- Restore `desktop/pnpm-workspace.yaml` and `desktop/pnpm-lock.yaml`.

### Integration and docs

- Delete root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`.
- Delete `integration/dev/`, `integration/dev.mjs` and `integration/tests/dev/`.
- Modify integration checks for the REST-only structure.
- Update root/component README files, `docs/development.md`, historical design supersession notices, and local `generalDesign/windows-ai-assistant-architecture.md`.

---

### Task 1: Shared REST Contract and Python Local YAML Configuration

**Files:**
- Create: `contracts/agent-api.yaml`
- Create: `agent/config/dev-local.example.yml`
- Create: `agent/app/config/yaml_loader.py`
- Modify: `agent/app/config/settings.py`
- Create: `agent/tests/config/test_yaml_loader.py`
- Modify: `agent/tests/config/test_settings.py`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `load_yaml_mapping(path: Path) -> Mapping[str, object]`
- Produces: `AgentSettings.from_yaml(path: Path) -> AgentSettings`
- Produces OpenAPI operations `GET /api/v1/health` and `POST /api/v1/tasks/plan`.
- Task 2 consumes `AgentSettings` and the exact OpenAPI DTO field names.

- [ ] **Step 1: Write failing YAML settings tests**

Create temporary YAML files and assert:

```python
settings = AgentSettings.from_yaml(config_path)
self.assertEqual(settings.host, "127.0.0.1")
self.assertEqual(settings.port, 45101)
self.assertEqual(settings.startup_token, "a" * 64)
self.assertEqual(settings.protocol_version, "1")
```

Also cover:

- missing file gives an actionable Chinese error containing the path;
- host other than `127.0.0.1` is rejected;
- token shorter than 32 characters is rejected;
- missing nested `server` or `lumora` section is rejected;
- YAML custom Python tags are rejected by `yaml.safe_load`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
$env:PYTHONPATH='agent'
agent\.venv\Scripts\python.exe -m unittest agent.tests.config.test_yaml_loader -v
```

Expected: FAIL because `yaml_loader.py` and `AgentSettings.from_yaml` do not exist.

- [ ] **Step 3: Implement strict YAML loading**

Add to `requirements.txt`:

```text
PyYAML>=6.0.3,<7
```

`load_yaml_mapping` must use `yaml.safe_load`, require a mapping root and never log loaded values. `AgentSettings.from_yaml` maps:

```yaml
server:
  host: 127.0.0.1
  port: 45101
lumora:
  startup-token: replace-with-local-token
  protocol-version: "1"
```

Keep Pydantic validation as the final type/range boundary. Add Chinese comments at the untracked-secret and loopback validation boundaries.
Remove the old environment-only `AgentSettings.from_environment` entry point and update
`agent/tests/config/test_settings.py` to exercise the same validation through `from_yaml`.

- [ ] **Step 4: Add ignored local files and safe example**

Add exact ignore entries:

```gitignore
agent/config/dev-local.yml
core/src/main/resources/application-dev-local.yml
desktop/config/dev-local.yml
```

Commit `agent/config/dev-local.example.yml` with placeholder token
`replace-with-at-least-32-local-characters`; do not create or stage a real file.

- [ ] **Step 5: Write the OpenAPI contract**

Create OpenAPI 3.1 YAML with:

- bearer auth;
- headers `X-Lumora-Protocol-Version` and `X-Correlation-Id`;
- camelCase `HealthResponse`, `PlanTaskRequest`, `PlanTaskResponse`, `PlanStepResponse`, `ErrorResponse`;
- statuses 200, 400, 401, 412 and 500;
- servers restricted to `http://127.0.0.1:45101`.

The request body is:

```json
{"taskId":"task-123","goal":"整理本地文档"}
```

- [ ] **Step 6: Run GREEN verification**

Run:

```powershell
agent\.venv\Scripts\python.exe -m pip install -r agent\requirements.txt
$env:PYTHONPATH='agent'
agent\.venv\Scripts\python.exe -m unittest agent.tests.config.test_yaml_loader -v
agent\.venv\Scripts\python.exe -m unittest agent.tests.config.test_settings -v
git diff --check
```

Expected: YAML tests PASS and no whitespace errors.

- [ ] **Step 7: Commit**

```powershell
git add -- .gitignore contracts/agent-api.yaml agent/config/dev-local.example.yml agent/app/config agent/tests/config
git commit -m "feat: define REST agent contract and local config"
```

Do not stage any real `dev-local.yml`.

---

### Task 2: Replace Python gRPC with FastAPI REST

**Files:**
- Create: `agent/app/dto/request/plan_task_request.py`
- Create: `agent/app/dto/response/health_response.py`
- Create: `agent/app/dto/response/plan_step_response.py`
- Create: `agent/app/dto/response/plan_task_response.py`
- Create: `agent/app/dto/response/error_response.py`
- Create: `agent/app/security/request_authenticator.py`
- Create: `agent/app/controller/http/agent_controller.py`
- Modify: `agent/app/main.py`
- Modify: `agent/requirements.txt`
- Modify: `agent/requirements-dev.txt`
- Delete: `agent/app/controller/grpc/`
- Delete: `agent/tests/controller/grpc/`
- Create: `agent/tests/controller/http/test_agent_controller.py`
- Modify: `agent/tests/test_main.py`

**Interfaces:**
- Produces: `create_app(settings: AgentSettings, planner_service: PlannerService) -> FastAPI`
- Produces: `GET /api/v1/health`
- Produces: `POST /api/v1/tasks/plan`
- Task 3 consumes the exact JSON/header contract.

- [ ] **Step 1: Add FastAPI test dependencies**

Replace runtime gRPC dependencies with:

```text
fastapi>=0.140,<0.141
uvicorn>=0.51,<0.52
pydantic>=2.11,<3
PyYAML>=6.0.3,<7
```

Replace `grpcio-tools` in `requirements-dev.txt` with:

```text
httpx>=0.28,<1
```

Install only after the requirements files are changed:

```powershell
agent\.venv\Scripts\python.exe -m pip install -r agent\requirements-dev.txt
```

- [ ] **Step 2: Write failing real-route tests**

Using `fastapi.testclient.TestClient(create_app(...))`, cover:

- valid authenticated health returns exact three camelCase fields;
- valid plan request returns `taskId` and mapped steps;
- missing/wrong bearer token returns 401;
- wrong protocol header returns 412;
- blank goal returns 400;
- missing correlation ID returns 400;
- error JSON never contains the token or stack trace.

Use a literal 64-character token and real `PlannerService`; do not assert on a mock router.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
$env:PYTHONPATH='agent'
agent\.venv\Scripts\python.exe -m unittest agent.tests.controller.http.test_agent_controller -v
```

Expected: FAIL because the HTTP controller and DTOs do not exist.

- [ ] **Step 4: Implement security and DTO boundaries**

`RequestAuthenticator` uses `hmac.compare_digest` and validates:

- `Authorization: Bearer <token>`;
- protocol header equals settings;
- nonblank correlation ID.

DTOs use aliases so HTTP JSON is camelCase while Python attributes remain snake_case. Error mapping returns stable codes:

```text
AUTHENTICATION_FAILED
PROTOCOL_MISMATCH
INVALID_REQUEST
INTERNAL_ERROR
```

- [ ] **Step 5: Implement the HTTP controller and app lifecycle**

`AgentHttpController` owns an `APIRouter`. Route methods only authenticate, call `PlannerService`, map DTOs and translate errors. `app/main.py`:

```python
def create_app(
    settings: AgentSettings,
    planner_service: PlannerService,
) -> FastAPI:
    ...

def main() -> None:
    settings = AgentSettings.from_yaml(default_dev_config_path())
    uvicorn.run(
        create_app(settings, PlannerService()),
        host=settings.host,
        port=settings.port,
    )
```

Delete the machine `LUMORA_READY` line and all gRPC imports.

- [ ] **Step 6: Verify GREEN and delete Python gRPC**

Run:

```powershell
$env:PYTHONPATH='agent'
agent\.venv\Scripts\python.exe -m unittest discover -s agent/tests -v
agent\.venv\Scripts\python.exe -m ruff check agent/app agent/tests
agent\.venv\Scripts\python.exe -m mypy agent/app
```

Expected: all Python tests pass; no import requires `grpc`, `protobuf` or generated modules.

- [ ] **Step 7: Commit**

```powershell
git add agent
git commit -m "refactor: expose Python agent over REST"
```

---

### Task 3: Replace Java gRPC Client with Spring RestClient

**Files:**
- Create: `core/src/main/java/com/lumora/core/agent/client/AgentRuntimeClient.java`
- Create: `core/src/main/java/com/lumora/core/agent/client/HttpAgentRuntimeClient.java`
- Create: `core/src/main/java/com/lumora/core/agent/config/AgentClientConfiguration.java`
- Create: `core/src/main/java/com/lumora/core/agent/model/AgentPlanStep.java`
- Create: `core/src/main/java/com/lumora/core/agent/dto/request/AgentPlanTaskRequest.java`
- Create: `core/src/main/java/com/lumora/core/agent/dto/response/AgentPlanStepResponse.java`
- Create: `core/src/main/java/com/lumora/core/agent/dto/response/AgentPlanTaskResponse.java`
- Create: `core/src/main/java/com/lumora/core/agent/exception/AgentRuntimeException.java`
- Delete: `core/src/main/java/com/lumora/core/grpc/client/`
- Create: `core/src/test/java/com/lumora/core/agent/client/HttpAgentRuntimeClientTest.java`
- Modify: `core/src/main/java/com/lumora/core/config/CoreProperties.java`
- Modify: `core/src/main/java/com/lumora/core/service/impl/TaskServiceImpl.java`
- Modify: Java tests importing the old client package
- Modify: `core/src/main/resources/application.yml`
- Create: `core/src/main/resources/application-dev-local.example.yml`
- Modify: `core/pom.xml`

**Interfaces:**
- Preserves the `AgentRuntimeClient.planTask(String, String, String)` business contract.
- Produces loopback-only HTTP calls matching `contracts/agent-api.yaml`.
- Later tasks rely on zero Java gRPC/Protobuf build dependencies.

- [ ] **Step 1: Write failing HTTP client tests**

Use `MockRestServiceServer.bindTo(RestClient.Builder)` and literal JSON. Cover:

- exact path `/api/v1/tasks/plan`;
- bearer, protocol and correlation headers;
- camelCase request JSON;
- response mapping to regular `AgentPlanStep` classes;
- 401, 412, 500 and connection error mapping;
- exception text never contains the token;
- non-loopback `agentUrl` rejected before a request.

- [ ] **Step 2: Run tests and verify RED**

From `core/`:

```powershell
.\mvnw.cmd -Dtest=HttpAgentRuntimeClientTest test
```

Expected: test compilation fails because the HTTP client classes do not exist.

- [ ] **Step 3: Implement regular Java DTO/model classes**

All request/response/model types are ordinary classes with constructors and getters. Do not add comments to trivial getters. HTTP response classes are separate from `AgentPlanStep`.

- [ ] **Step 4: Implement configuration and HTTP client**

Change properties from `agentPort` to:

```java
private String agentUrl = "http://127.0.0.1:45101";
private String agentStartupToken = "";
```

`AgentClientConfiguration` validates URI scheme `http`, host exactly `127.0.0.1`, and a valid port. Configure JDK HTTP connect/read timeout to 30 seconds and build one Spring `RestClient`.

`HttpAgentRuntimeClient` sends the three headers, maps responses, and converts HTTP/transport failures to `AgentRuntimeException`. Authentication and error-redaction boundaries require Chinese comments.

- [ ] **Step 5: Switch business imports and remove Maven generation**

Update `TaskServiceImpl` and tests to import `com.lumora.core.agent.*`. Remove:

- `grpc.version`, `protobuf.version`;
- gRPC, protobuf and `jakarta.annotation-api` dependencies used only by gRPC;
- `os-maven-plugin`;
- `protobuf-maven-plugin` and all protoc configuration.

Configure:

```yaml
lumora:
  agent-url: ${LUMORA_AGENT_URL:http://127.0.0.1:45101}
  agent-startup-token: ${LUMORA_AGENT_STARTUP_TOKEN:${LUMORA_STARTUP_TOKEN:}}
```

Create a safe Java local example without a real token.

- [ ] **Step 6: Run GREEN verification**

From `core/`:

```powershell
.\mvnw.cmd -Dtest=HttpAgentRuntimeClientTest test
.\mvnw.cmd test
```

Expected: focused and full Java tests pass; Maven output has no protobuf generation goals and `target/generated-sources/protobuf` is not required.

- [ ] **Step 7: Commit**

```powershell
git add core
git commit -m "refactor: call Python agent over REST"
```

---

### Task 4: Electron Local YAML Configuration

**Files:**
- Create: `desktop/config/dev-local.example.yml`
- Create: `desktop/src/main/config/dev-config.ts`
- Create: `desktop/tests/main/dev-config.test.ts`
- Modify: `desktop/src/main/index.ts`
- Modify: existing gateway/startup tests
- Modify: `desktop/package.json`
- Modify: root `pnpm-lock.yaml` temporarily

**Interfaces:**
- Produces: `loadDevConfig(path: string): DevConfig`
- `DevConfig` contains `coreUrl` and `startupToken`.
- Electron Main consumes config; Renderer never receives token or config path.

- [ ] **Step 1: Write failing config loader tests**

Use temporary YAML files and assert:

```typescript
expect(loadDevConfig(path)).toEqual({
  coreUrl: "http://127.0.0.1:45102",
  startupToken: "a".repeat(64),
});
```

Cover missing file, malformed YAML, token shorter than 32, non-loopback URL and missing keys. The error must name the file/key but never print the token.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
pnpm.cmd --filter lumora-desktop test -- tests/main/dev-config.test.ts
```

Expected: FAIL because `dev-config.ts` does not exist.

- [ ] **Step 3: Add YAML dependency and strict loader**

Remove unused:

```json
"@grpc/grpc-js": "1.13.4"
```

Add:

```json
"yaml": "2.8.1"
```

`loadDevConfig` uses Node `fs` only in Main Process, parses YAML, validates exact loopback HTTP URL and token length, and returns a frozen plain object.

- [ ] **Step 4: Wire Electron Main**

Load `desktop/config/dev-local.yml` before creating `RestTaskGateway`. Do not expose config through preload, IPC or Renderer state. Keep constructor injection available so existing tests do not read a developer file.

- [ ] **Step 5: Add safe example and GREEN verification**

Example:

```yaml
lumora:
  core-url: http://127.0.0.1:45102
  startup-token: replace-with-at-least-32-local-characters
```

Run:

```powershell
pnpm.cmd install
pnpm.cmd --filter lumora-desktop test
pnpm.cmd --filter lumora-desktop typecheck
```

Expected: Desktop tests/typecheck pass and no Renderer source imports `dev-config`.

- [ ] **Step 6: Commit**

```powershell
git add desktop package.json pnpm-lock.yaml
git commit -m "feat: load Electron local development config"
```

Do not stage `desktop/config/dev-local.yml`.

---

### Task 5: Remove Protobuf and Unified Launcher Infrastructure

**Files:**
- Delete: `protocol/`
- Delete: `integration/dev/`
- Delete: `integration/dev.mjs`
- Delete: `integration/tests/dev/`
- Delete: root `package.json`
- Delete: root `pnpm-workspace.yaml`
- Delete: root `pnpm-lock.yaml`
- Delete: `.superpowers/sdd/2026-07-24-unified-development-launcher/task-1-report.md`
- Create: `desktop/pnpm-workspace.yaml`
- Generate: `desktop/pnpm-lock.yaml`
- Modify: `integration/tests/repository-boundaries.ps1`
- Delete/Modify: obsolete protocol, Java scaffold and Python scaffold checks
- Modify: `integration/verify.ps1`

**Interfaces:**
- Restores independent language project ownership.
- Unified verification consumes component-native commands only.

- [ ] **Step 1: Write failing REST-only repository checks**

Require:

- `contracts/agent-api.yaml`;
- Python HTTP controller and local example;
- Java HTTP client and local example;
- Desktop local example and its own lock/workspace.

Reject:

- `protocol/`, root `package.json`, root `pnpm-workspace.yaml`, root `pnpm-lock.yaml`;
- `integration/dev/` and launcher tests;
- checked-in real `dev-local.yml`;
- source or build references to `grpc`, `protobuf`, `buf`, generated protocol packages;
- cross-language source imports.

Exclude `docs/superpowers/specs/` and `docs/superpowers/plans/` from the obsolete-reference
scan because those files are retained historical decision records.

Run before deleting old infrastructure and verify RED.

- [ ] **Step 2: Delete obsolete infrastructure**

Delete all listed launcher and protocol files, including the obsolete tracked SDD task report.
Do not revert or rewrite history; the new commit records the architecture replacement.

- [ ] **Step 3: Restore Desktop package ownership**

Create:

```yaml
nodeLinker: hoisted
allowBuilds:
  electron: true
  electron-winstaller: true
  esbuild: true
onlyBuiltDependencies:
  - electron
  - electron-winstaller
  - esbuild
```

From `desktop/` run:

```powershell
pnpm.cmd install
```

Expected: `desktop/pnpm-lock.yaml` has one importer `.` and no `@grpc/grpc-js`, Buf or protobufjs direct dependency.

- [ ] **Step 4: Simplify unified verification**

`integration/verify.ps1` runs:

1. repository boundaries;
2. Python unittest;
3. Python Ruff and MyPy;
4. Desktop tests and typecheck from `desktop/`;
5. Java tests through `core/mvnw.cmd` only when `-IncludeJava`.

Remove protocol generation, launcher tests and global Maven assumptions.

- [ ] **Step 5: Run GREEN verification**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File integration/tests/repository-boundaries.ps1
powershell -ExecutionPolicy Bypass -File integration/verify.ps1 `
  -PythonCommand agent\.venv\Scripts\python.exe `
  -IncludeJava
git diff --check
```

Expected: repository checks and all component tests pass.

- [ ] **Step 6: Commit**

```powershell
git add -A -- .superpowers/sdd/2026-07-24-unified-development-launcher/task-1-report.md protocol integration package.json pnpm-workspace.yaml pnpm-lock.yaml desktop
git commit -m "build: remove generated protocol and launcher"
```

Confirm `artwork/` and `generalDesign/` remain untracked before committing.

---

### Task 6: Documentation, IDE Workflow and Full Migration Verification

**Files:**
- Modify: `README.md`
- Modify: `agent/README.md`
- Modify: `core/README.md`
- Modify: `desktop/README.md`
- Modify: `integration/README.md`
- Modify: `docs/development.md`
- Modify: older tracked specs/plans with supersession notices
- Modify locally only: `generalDesign/windows-ai-assistant-architecture.md`

**Interfaces:**
- Produces the standard manual IDE workflow.
- Records current no-login local-single-user scope and future account/usage boundary.

- [ ] **Step 1: Write the documentation changes**

Document exact IDE settings:

- PyCharm module `app.main`, working directory `agent/`, Python 3.12 venv;
- IntelliJ main class `CoreApplication`, JDK 21, profile `dev-local`, working directory `core/`;
- WebStorm/IDEA Desktop `start`, working directory `desktop/`;
- startup order Python → Java → Electron;
- three ignored local YAML paths and same-token requirement;
- exact REST endpoints and health checks;
- component-specific install/test/debug commands;
- current no-login, local SQLite scope;
- future Java-owned login, user data ownership, model usage and cloud-authoritative package billing.

- [ ] **Step 2: Mark old designs as superseded**

At the top of tracked designs/plans that mandate gRPC or one-command launching, add a short notice linking to:

```text
docs/superpowers/specs/2026-07-28-rest-agent-ide-workflow-design.md
```

Do not rewrite historical content; it remains a decision record.

- [ ] **Step 3: Synchronize untracked general design**

Update `generalDesign/windows-ai-assistant-architecture.md` with:

- REST-only Java/Python boundary;
- three-IDE development workflow;
- Java authority and future account/usage evolution;
- local YAML secret handling.

Confirm the directory remains `?? generalDesign/` and never stage it.

- [ ] **Step 4: Perform a three-service smoke test with IDE-equivalent entry points**

Create real local YAML files from examples without staging them, using one temporary 64-character development token. Start:

1. Python from `agent/`;
2. Java from `core/`;
3. Electron from `desktop/`.

Verify:

- authenticated Python health;
- authenticated Java health;
- Electron creates a task through Java;
- Java calls Python planning REST;
- task plan persists in SQLite and reaches Electron through existing REST/SSE;
- missing/wrong tokens fail without leaking secrets.

The automated worker may launch the same component-native commands from terminals instead of
opening GUI IDEs; the entry points, working directories and profiles must be identical to the
documented IDE configurations. Stop each owned process explicitly and remove only temporary
smoke data/config created for this check if it is not needed by the user.

- [ ] **Step 5: Run complete automated verification**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File integration/verify.ps1 `
  -PythonCommand agent\.venv\Scripts\python.exe `
  -IncludeJava
git grep -n -I -E 'grpc|Grpc|gRPC|protobuf|Protobuf|buf' -- `
  ':!docs/superpowers/plans/*' `
  ':!docs/superpowers/specs/*'
git diff --check
git status --short
```

Expected:

- all repository, Python, Desktop and Java checks pass;
- no active source/build/documentation reference outside historical decision records;
- only `artwork/` and `generalDesign/` remain untracked.

- [ ] **Step 6: Commit tracked documentation**

```powershell
git add README.md agent/README.md core/README.md desktop/README.md integration/README.md docs
git commit -m "docs: document REST agent IDE workflow"
```

Do not stage `generalDesign/`.
