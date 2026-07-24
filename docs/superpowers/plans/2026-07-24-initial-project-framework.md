# LUMORA 初始项目框架实施计划

> **供执行代理使用：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐项实施本计划。所有步骤均使用复选框（`- [ ]`）跟踪状态。

**目标：** 建立四个可由 IDE 独立打开的工程根目录，并跑通一个跨 Electron、Java 和 Python 的任务持久化、进度流、操作审批及任务完成闭环。

**架构：** Electron Renderer 只能通过白名单 Preload API 与 Electron Main 通信。Electron Main 通过本机 gRPC 调用 Java Local Core；Java 负责 SQLite 状态、审批、审计及 Python 进程边界；Python 通过 gRPC 返回确定性的 Agent 计划。所有跨进程消息均源自 `protocol/proto`，任何运行时都不得导入其他运行时的源码。

**技术栈：** Electron、React、TypeScript、Vite、Zustand、Vitest、Playwright；Java 21、Spring Boot、MyBatis、SQLite、JUnit 5；Python 3.12、grpcio、Pydantic、pytest；Protobuf、gRPC、Buf；Windows PowerShell 联调脚本。

## 全局约束

- 仓库必须包含名称固定的独立根目录：`desktop/`、`core/`、`agent/`、`protocol/` 和 `integration/`。
- Java 固定使用 21，Python 固定使用 3.12。
- Renderer 不得访问 Node.js、后端端口、启动令牌、API Key 或生成的 gRPC Client。
- 跨运行时通信必须使用生成的 Protobuf 协议，禁止跨工程导入运行时源码。
- Java 是任务、审批、审计、本地工具和进程生命周期的持久化权威。
- Python 负责任务规划和 Agent 编排，但不得直接操作 Playwright 或无限制系统工具。
- 初始自动化流程不得依赖第三方模型 API Key。
- 所有本地端口必须绑定 `127.0.0.1`，每次启动使用独立的随机令牌。
- 协议、构建工具和依赖版本必须通过锁文件或 Wrapper 固定。
- 进程边界、安全校验、生命周期、状态转换和非直观配置必须有简洁的定位性注释；显而易见的赋值和流程不添加重复叙述。
- 每个任务都必须以最新测试结果和一次聚焦提交结束。

---

## 计划文件结构

```text
LUMORA/
|-- .editorconfig
|-- .gitignore
|-- README.md
|-- desktop/
|   |-- package.json
|   |-- pnpm-lock.yaml
|   |-- forge.config.ts
|   |-- vite.*.config.ts
|   |-- src/main/{index,core-client,process-manager,ipc}.ts
|   |-- src/preload/index.ts
|   |-- src/renderer/{App,main,styles}.tsx
|   |-- src/renderer/features/tasks/*
|   `-- tests/{main,renderer,e2e}/*
|-- core/
|   |-- pom.xml
|   |-- mvnw
|   |-- src/main/java/com/lumora/core/*
|   |-- src/main/resources/db/migration/V1__initial_schema.sql
|   `-- src/test/java/com/lumora/core/*
|-- agent/
|   |-- pyproject.toml
|   |-- src/lumora_agent/{server,service,planner,settings}.py
|   `-- tests/*
|-- protocol/
|   |-- buf.yaml
|   |-- buf.gen.yaml
|   `-- proto/lumora/v1/{common,core,agent}.proto
|-- integration/
|   |-- start-dev.ps1
|   |-- stop-dev.ps1
|   |-- verify.ps1
|   `-- tests/vertical-flow.ps1
`-- docs/development.md
```

## 共享接口

在开始各运行时开发之前，协议必须提供以下稳定接口：

```proto
service CoreService {
  rpc Health(HealthRequest) returns (HealthResponse);
  rpc CreateTask(CreateTaskRequest) returns (TaskSnapshot);
  rpc GetTask(GetTaskRequest) returns (TaskSnapshot);
  rpc SubscribeTaskEvents(SubscribeTaskEventsRequest) returns (stream TaskEvent);
  rpc DecideApproval(DecideApprovalRequest) returns (TaskSnapshot);
}

service AgentService {
  rpc Health(HealthRequest) returns (HealthResponse);
  rpc PlanTask(PlanTaskRequest) returns (PlanTaskResponse);
}
```

`TaskStatus` 包含 `CREATED`、`PLANNING`、`RUNNING`、
`WAITING_APPROVAL`、`COMPLETED`、`REJECTED`、`INTERRUPTED` 和
`FAILED`。每个请求均携带：

```proto
RequestContext {
  protocol_version
  startup_token
  correlation_id
}
```

---

### 任务 1：建立仓库基线和独立工程边界

**文件：**

- 新建：`.editorconfig`
- 新建：`.gitignore`
- 新建：`README.md`
- 新建：`desktop/README.md`
- 新建：`core/README.md`
- 新建：`agent/README.md`
- 新建：`protocol/README.md`
- 新建：`integration/README.md`
- 测试：`integration/tests/repository-boundaries.ps1`

**接口：**

- 输入：已批准的架构规格。
- 输出：稳定的工程根目录名称，以及供后续任务复用的边界检查脚本。

- [ ] **步骤 1：初始化当前为空的 Git 元数据目录**

执行：

```powershell
git init
git branch -M main
```

预期：`git rev-parse --is-inside-work-tree` 输出 `true`。

- [ ] **步骤 2：先编写失败的仓库边界测试**

创建 `integration/tests/repository-boundaries.ps1`：

```powershell
$ErrorActionPreference = 'Stop'
$projectRoots = @('desktop', 'core', 'agent', 'protocol', 'integration')
foreach ($projectRoot in $projectRoots) {
    if (-not (Test-Path -LiteralPath $projectRoot -PathType Container)) {
        throw "Missing independent project root: $projectRoot"
    }
}

$forbidden = Get-ChildItem desktop,core,agent -Recurse -File -ErrorAction SilentlyContinue |
    Select-String -Pattern '(from|import|require\()\s*["'']?\.\.[\\/](desktop|core|agent)'
if ($forbidden) {
    throw "Cross-runtime source import detected: $($forbidden.Path)"
}
```

- [ ] **步骤 3：运行测试并确认因缺少工程目录而失败**

执行：

```powershell
powershell -ExecutionPolicy Bypass -File integration/tests/repository-boundaries.ps1
```

预期：失败，并显示 `Missing independent project root`。

- [ ] **步骤 4：创建工程根目录和仓库策略文件**

`.gitignore` 至少包含：

```gitignore
.idea/
.vscode/
node_modules/
dist/
out/
target/
.venv/
__pycache__/
.pytest_cache/
generated/
*.db
*.db-shm
*.db-wal
logs/
.env
.env.local
runtime/
```

每个工程的 README 必须写明职责、构建命令、测试命令，以及不得导入其他运行时源码的规则。根 `README.md` 必须链接到各工程和架构规格。

- [ ] **步骤 5：重新运行边界测试**

执行：

```powershell
powershell -ExecutionPolicy Bypass -File integration/tests/repository-boundaries.ps1
```

预期：退出码为 `0`。

- [ ] **步骤 6：提交**

```powershell
git add .editorconfig .gitignore README.md desktop core agent protocol integration
git commit -m "chore: establish independent project roots"
```

---

### 任务 2：定义带版本的 Protobuf 协议

**文件：**

- 新建：`protocol/buf.yaml`
- 新建：`protocol/buf.gen.yaml`
- 新建：`protocol/proto/lumora/v1/common.proto`
- 新建：`protocol/proto/lumora/v1/core.proto`
- 新建：`protocol/proto/lumora/v1/agent.proto`
- 新建：`protocol/tests/contract-shape.ps1`
- 修改：`protocol/README.md`

**接口：**

- 输入：任务 1 建立的工程边界。
- 输出：`lumora.v1` 包中的 `CoreService`、`AgentService`、
  `TaskSnapshot`、`TaskEvent`、`ApprovalRequest` 和 `ErrorDetail`。

- [ ] **步骤 1：先编写失败的协议结构测试**

创建 `protocol/tests/contract-shape.ps1`：

```powershell
$ErrorActionPreference = 'Stop'
$protoText = Get-Content -Raw protocol/proto/lumora/v1/*.proto
$required = @(
    'service CoreService',
    'service AgentService',
    'rpc SubscribeTaskEvents',
    'rpc DecideApproval',
    'message RequestContext',
    'message TaskSnapshot',
    'message TaskEvent',
    'message ErrorDetail',
    'WAITING_APPROVAL',
    'INTERRUPTED'
)
foreach ($needle in $required) {
    if ($protoText -notmatch [regex]::Escape($needle)) {
        throw "Protocol contract is missing: $needle"
    }
}
```

- [ ] **步骤 2：运行测试并确认协议缺失**

执行：

```powershell
powershell -ExecutionPolicy Bypass -File protocol/tests/contract-shape.ps1
```

预期：因 `protocol/proto/lumora/v1` 尚不存在而失败。

- [ ] **步骤 3：定义公共消息**

`common.proto`：

```proto
syntax = "proto3";
package lumora.v1;

message RequestContext {
  string protocol_version = 1;
  string startup_token = 2;
  string correlation_id = 3;
}

message HealthRequest {
  RequestContext context = 1;
}

message HealthResponse {
  string service_name = 1;
  string service_version = 2;
  string protocol_version = 3;
}

message ErrorDetail {
  string code = 1;
  string user_message = 2;
  bool retryable = 3;
  string correlation_id = 4;
  string developer_detail = 5;
}
```

- [ ] **步骤 4：定义 Core 和 Agent 服务**

`core.proto` 必须定义共享的 `TaskStatus` 枚举、任务快照、任务事件、审批消息，以及“共享接口”章节中的五个 `CoreService` 方法。`agent.proto` 必须定义 `PlanStep`、`PlanTaskRequest`、`PlanTaskResponse` 和两个 `AgentService` 方法。持久化事件时间统一使用 `google.protobuf.Timestamp`。

- [ ] **步骤 5：添加协议检查和生成配置**

`buf.yaml` 的模块目录为 `proto`，Lint 配置使用 `STANDARD`，破坏性变更检查使用 `FILE`。`buf.gen.yaml` 配置 Java、Python 和 TypeScript 生成器，生成结果分别写入各工程已忽略的 `generated/` 目录。生成器版本必须由 Maven、Python 和 pnpm 的锁定依赖确定。

- [ ] **步骤 6：验证协议**

执行：

```powershell
powershell -ExecutionPolicy Bypass -File protocol/tests/contract-shape.ps1
buf lint protocol
```

预期：两个命令均以退出码 `0` 结束。

- [ ] **步骤 7：提交**

```powershell
git add protocol
git commit -m "feat: define versioned runtime protocol"
```

---

### 任务 3：实现确定性的 Python Agent Runtime

**文件：**

- 新建：`agent/pyproject.toml`
- 新建：`agent/src/lumora_agent/__init__.py`
- 新建：`agent/src/lumora_agent/settings.py`
- 新建：`agent/src/lumora_agent/planner.py`
- 新建：`agent/src/lumora_agent/service.py`
- 新建：`agent/src/lumora_agent/server.py`
- 新建：`agent/tests/test_planner.py`
- 新建：`agent/tests/test_service.py`
- 修改：`agent/README.md`

**接口：**

- 输入：`lumora.v1.AgentService` 和 `RequestContext`。
- 输出：`build_plan(goal: str) -> list[PlanStep]`，以及通过
  `python -m lumora_agent.server` 启动的本机 gRPC Server。

- [ ] **步骤 1：先编写失败的确定性规划测试**

```python
def test_build_plan_requires_approval_for_sensitive_demo_step():
    steps = build_plan("整理下载目录")
    assert [step.title for step in steps] == [
        "理解目标",
        "整理任务材料",
        "确认敏感操作",
        "生成结果",
    ]
    assert steps[2].requires_approval is True
```

- [ ] **步骤 2：运行测试并确认模块尚不存在**

执行：

```powershell
cd agent
python -m pytest tests/test_planner.py -v
```

预期：失败，并显示 `ModuleNotFoundError: lumora_agent`。

- [ ] **步骤 3：添加 Python 包和最小规划器**

定义不可变的 Pydantic `PlanStep`，包含 `title: str`、
`description: str` 和 `requires_approval: bool`。`build_plan()` 拒绝空目标，
并返回测试中列出的四个确定性步骤。

- [ ] **步骤 4：验证规划器**

执行：

```powershell
cd agent
python -m pytest tests/test_planner.py -v
```

预期：测试通过。

- [ ] **步骤 5：编写失败的服务测试**

使用动态端口启动测试服务，覆盖以下行为：

```python
def test_health_rejects_wrong_token(): ...
def test_health_reports_protocol_version_one(): ...
def test_plan_task_maps_deterministic_steps_to_proto(): ...
def test_plan_task_rejects_blank_goal(): ...
```

测试端口必须使用端口 `0` 动态分配，不得预留固定端口。

- [ ] **步骤 6：实现配置、服务和 Server**

`AgentSettings` 读取 `LUMORA_AGENT_PORT`、`LUMORA_STARTUP_TOKEN` 和
`LUMORA_PROTOCOL_VERSION`。服务使用 `hmac.compare_digest` 校验令牌，报告协议版本
`1`，将 `build_plan()` 映射为生成的协议消息，并对空目标返回 gRPC
`INVALID_ARGUMENT`。Server 仅绑定 `127.0.0.1`。

- [ ] **步骤 7：运行全部 Python 检查**

```powershell
cd agent
python -m pytest -q
python -m ruff check .
python -m mypy src
```

预期：全部以退出码 `0` 结束。

- [ ] **步骤 8：提交**

```powershell
git add agent
git commit -m "feat: add deterministic agent runtime"
```

---

### 任务 4：实现 Java 任务领域和 SQLite 持久化

**文件：**

- 新建：`core/pom.xml`
- 新建：`core/mvnw`
- 新建：`core/mvnw.cmd`
- 新建：`core/.mvn/wrapper/maven-wrapper.properties`
- 新建：`core/src/main/java/com/lumora/core/CoreApplication.java`
- 新建：`core/src/main/java/com/lumora/core/task/TaskStatus.java`
- 新建：`core/src/main/java/com/lumora/core/task/Task.java`
- 新建：`core/src/main/java/com/lumora/core/task/TaskService.java`
- 新建：`core/src/main/java/com/lumora/core/task/TaskRepository.java`
- 新建：`core/src/main/java/com/lumora/core/task/SqliteTaskRepository.java`
- 新建：`core/src/main/resources/db/migration/V1__initial_schema.sql`
- 新建：`core/src/test/java/com/lumora/core/task/TaskServiceTest.java`
- 新建：`core/src/test/java/com/lumora/core/task/SqliteTaskRepositoryTest.java`

**接口：**

- 输入：Java 21 及任务 2 定义的 `TaskStatus`。
- 输出：`TaskService.create(String goal)`、`startPlanning(UUID id)`、
  `waitForApproval(UUID id, Approval approval)`、`complete(UUID id)`、
  `reject(UUID id)` 和 `interrupt(UUID id, String reason)`。

- [ ] **步骤 1：先编写失败的任务状态测试**

覆盖合法状态路径：

```text
CREATED -> PLANNING -> RUNNING -> WAITING_APPROVAL -> COMPLETED
```

同时断言 `CREATED -> COMPLETED` 抛出 `IllegalTaskTransitionException`；
只有 `WAITING_APPROVAL` 可以进入拒绝状态；中断后必须保留任务 ID 和目标。

- [ ] **步骤 2：运行聚焦测试并确认编译失败**

执行：

```powershell
cd core
.\mvnw.cmd -q -Dtest=TaskServiceTest test
```

预期：因任务领域类尚不存在而失败。

- [ ] **步骤 3：实现最小领域状态机**

任务快照使用不可变对象。状态转换规则位于 `TaskService`，不得放入 Controller、
Mapper 或生成的 Protobuf 类。UUID 和时间分别通过可注入的 `Supplier<UUID>` 和
`Clock` 提供，以保证测试确定性。

- [ ] **步骤 4：验证领域测试**

执行：

```powershell
cd core
.\mvnw.cmd -q -Dtest=TaskServiceTest test
```

预期：测试通过。

- [ ] **步骤 5：编写失败的 SQLite 持久化测试**

测试创建和读取任务、按顺序追加和读取事件、审批持久化、审计持久化，以及关闭第一个
Repository 后使用同一临时数据库重新打开并恢复数据。

- [ ] **步骤 6：创建数据库结构和 Repository**

`V1__initial_schema.sql` 创建 `agent_task`、`task_event`、
`approval_request` 和 `audit_log`。初始化连接时启用
`PRAGMA foreign_keys = ON` 和 WAL 模式。枚举值使用稳定的大写文本保存。

- [ ] **步骤 7：运行 Java 领域和持久化测试**

执行：

```powershell
cd core
.\mvnw.cmd -q test
```

预期：所有项目测试通过，无失败项。

- [ ] **步骤 8：提交**

```powershell
git add core
git commit -m "feat: persist task and approval state"
```

---

### 任务 5：实现 Java gRPC 边界和 Python Client

**文件：**

- 新建：`core/src/main/java/com/lumora/core/config/RuntimeProperties.java`
- 新建：`core/src/main/java/com/lumora/core/grpc/RequestAuthenticator.java`
- 新建：`core/src/main/java/com/lumora/core/grpc/CoreGrpcService.java`
- 新建：`core/src/main/java/com/lumora/core/agent/AgentClient.java`
- 新建：`core/src/main/java/com/lumora/core/agent/GrpcAgentClient.java`
- 新建：`core/src/main/java/com/lumora/core/task/TaskEventPublisher.java`
- 新建：`core/src/test/java/com/lumora/core/grpc/CoreGrpcServiceTest.java`
- 新建：`core/src/test/java/com/lumora/core/agent/GrpcAgentClientTest.java`

**接口：**

- 输入：生成的 Java 协议类、`TaskService` 和 `AgentService.PlanTask`。
- 输出：绑定 `127.0.0.1` 的 `CoreService`、调用 Python 的 Java Client，
  以及可重放的任务事件。

- [ ] **步骤 1：先编写失败的认证和健康检查测试**

断言缺少或错误的令牌返回 `UNAUTHENTICATED`；协议版本不兼容返回
`FAILED_PRECONDITION`；合法健康检查返回服务名 `lumora-core` 和协议版本 `1`。

- [ ] **步骤 2：运行测试并确认 gRPC 服务尚不存在**

执行：

```powershell
cd core
.\mvnw.cmd -q -Dtest=CoreGrpcServiceTest test
```

预期：因 `CoreGrpcService` 不存在而失败。

- [ ] **步骤 3：实现请求认证和健康检查**

读取 `LUMORA_CORE_PORT`、`LUMORA_AGENT_PORT`、`LUMORA_STARTUP_TOKEN`、
`LUMORA_PROTOCOL_VERSION` 和 `LUMORA_DATABASE_PATH`。无效请求必须在调用领域服务
前被拒绝。Server 只绑定 `127.0.0.1`。

- [ ] **步骤 4：编写失败的任务编排测试**

使用内存版 `AgentClient`，验证 `CreateTask` 会持久化任务、调用
`planTask(taskId, goal, correlationId)`、按序发出状态事件，并在计划包含审批步骤时
停留于 `WAITING_APPROVAL`。

- [ ] **步骤 5：实现任务编排和事件重放**

`SubscribeTaskEvents` 先发送请求序号之后的持久化事件，再连接实时订阅者。每个任务的
事件序号必须严格递增。订阅者断开不得取消任务。

- [ ] **步骤 6：测试真实 Python gRPC Client**

测试夹具使用动态本地端口启动 Python Server。验证健康检查、计划映射、Deadline
处理，并将 `UNAVAILABLE` 转换为可重试的 `AgentUnavailableException`。

- [ ] **步骤 7：运行 Java 测试套件**

执行：

```powershell
cd core
.\mvnw.cmd -q test
```

预期：全部通过。

- [ ] **步骤 8：提交**

```powershell
git add core
git commit -m "feat: expose authenticated core grpc service"
```

---

### 任务 6：实现审批决策和可恢复故障流程

**文件：**

- 修改：`core/src/main/java/com/lumora/core/grpc/CoreGrpcService.java`
- 修改：`core/src/main/java/com/lumora/core/task/TaskService.java`
- 新建：`core/src/main/java/com/lumora/core/approval/ApprovalService.java`
- 新建：`core/src/test/java/com/lumora/core/approval/ApprovalServiceTest.java`
- 新建：`core/src/test/java/com/lumora/core/task/TaskRecoveryTest.java`

**接口：**

- 输入：`DecideApprovalRequest`、持久化任务状态和任务事件。
- 输出：幂等的批准或拒绝操作，以及重启恢复能力。

- [ ] **步骤 1：先编写失败的审批测试**

验证批准后确定性演示任务进入 `COMPLETED`；拒绝后进入 `REJECTED`；重复提交相同决策
返回当前快照；提交互相冲突的第二次决策返回 `FAILED_PRECONDITION`。

- [ ] **步骤 2：运行测试并确认失败**

执行：

```powershell
cd core
.\mvnw.cmd -q -Dtest=ApprovalServiceTest test
```

预期：因 `ApprovalService` 尚不存在而失败。

- [ ] **步骤 3：实现审批和审计持久化**

决策和审计事件必须在同一事务中保存。审计数据包含任务 ID、动作、决策、关联 ID、
时间和用户可理解的影响摘要，禁止保存启动令牌。

- [ ] **步骤 4：编写并实现恢复测试**

创建处于 `PLANNING` 的任务，模拟 Agent 不可用，重新打开 Repository，断言任务变为
`INTERRUPTED`，同时此前事件和目标仍可查询。

- [ ] **步骤 5：运行 Java 测试套件**

执行：

```powershell
cd core
.\mvnw.cmd -q test
```

预期：全部通过。

- [ ] **步骤 6：提交**

```powershell
git add core
git commit -m "feat: add auditable approval and recovery flow"
```

---

### 任务 7：建立安全的 Electron Main 和 Preload 边界

**文件：**

- 新建：`desktop/package.json`
- 新建：`desktop/forge.config.ts`
- 新建：`desktop/vite.main.config.ts`
- 新建：`desktop/vite.preload.config.ts`
- 新建：`desktop/vite.renderer.config.ts`
- 新建：`desktop/src/main/index.ts`
- 新建：`desktop/src/main/core-client.ts`
- 新建：`desktop/src/main/process-manager.ts`
- 新建：`desktop/src/main/ipc.ts`
- 新建：`desktop/src/preload/index.ts`
- 新建：`desktop/src/shared/task-contract.ts`
- 新建：`desktop/tests/main/security.test.ts`
- 新建：`desktop/tests/main/ipc.test.ts`

**接口：**

- 输入：生成的 TypeScript `CoreService` Client 和运行环境配置。
- 输出：`window.lumora.tasks.create`、`.get`、`.subscribe` 和
  `.decideApproval`，不得提供通用 IPC 或 gRPC 逃生接口。

- [ ] **步骤 1：先编写失败的 BrowserWindow 安全测试**

断言窗口配置包含：

```typescript
{
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true
}
```

同时断言默认拒绝应用外部的页面导航和新窗口请求。

- [ ] **步骤 2：运行测试并确认失败**

执行：

```powershell
cd desktop
pnpm vitest run tests/main/security.test.ts
```

预期：因主进程窗口工厂尚不存在而失败。

- [ ] **步骤 3：使用固定依赖创建 Electron Forge 工程**

运行时和开发依赖均使用 `pnpm add -E` 安装，确保 `package.json` 和
`pnpm-lock.yaml` 记录精确版本。Main、Preload 和 Renderer 分别配置 Vite 入口。

- [ ] **步骤 4：实现安全窗口创建**

导出可测试的 `createMainWindowOptions(preloadPath: string)`。应用启动留在
`index.ts`，浏览器安全策略放在职责单一的模块中。

- [ ] **步骤 5：编写失败的 Preload API 测试**

断言暴露的对象仅包含：

```typescript
type LumoraApi = {
  tasks: {
    create(goal: string): Promise<TaskSnapshot>;
    get(taskId: string): Promise<TaskSnapshot>;
    subscribe(taskId: string, onEvent: (event: TaskEvent) => void): () => void;
    decideApproval(input: ApprovalDecisionInput): Promise<TaskSnapshot>;
  };
};
```

端口、令牌、`ipcRenderer`、文件系统 API 和通用 Channel 名称均不得出现。

- [ ] **步骤 6：实现 Core Client、白名单 IPC 和 Preload API**

Main 持有 gRPC Channel 并读取连接参数。Preload 必须先校验普通数据对象，再调用命名
IPC Handler。订阅返回取消函数，窗口销毁时必须移除 Listener。

- [ ] **步骤 7：运行桌面端单元检查**

```powershell
cd desktop
pnpm test
pnpm lint
pnpm typecheck
```

预期：全部以退出码 `0` 结束。

- [ ] **步骤 8：提交**

```powershell
git add desktop
git commit -m "feat: add secure electron process boundary"
```

---

### 任务 8：实现桌面应用外壳和任务状态

**文件：**

- 新建：`desktop/src/renderer/main.tsx`
- 新建：`desktop/src/renderer/App.tsx`
- 新建：`desktop/src/renderer/styles.css`
- 新建：`desktop/src/renderer/components/AppSidebar.tsx`
- 新建：`desktop/src/renderer/features/tasks/task-store.ts`
- 新建：`desktop/src/renderer/features/tasks/HomePage.tsx`
- 新建：`desktop/src/renderer/features/tasks/TaskPage.tsx`
- 新建：`desktop/src/renderer/features/tasks/ApprovalDock.tsx`
- 新建：`desktop/tests/renderer/task-store.test.ts`
- 新建：`desktop/tests/renderer/task-flow.test.tsx`

**接口：**

- 输入：任务 7 的 `window.lumora.tasks`。
- 输出：目标输入、任务事件渲染、断线后快照恢复，以及批准或拒绝控制。

- [ ] **步骤 1：先编写失败的任务 Store 测试**

验证 `createTask(goal)` 拒绝纯空白输入、调用 Preload API、保存返回快照、只订阅一次、
忽略重复事件序号，并按顺序应用更新事件。

- [ ] **步骤 2：运行测试并确认失败**

执行：

```powershell
cd desktop
pnpm vitest run tests/renderer/task-store.test.ts
```

预期：因 `task-store.ts` 尚不存在而失败。

- [ ] **步骤 3：实现最小 Zustand 任务 Store**

保存按 ID 归一化的任务、当前任务 ID、最后事件序号、服务连接状态和用户可理解的错误。
不得保存端口、令牌、生成的 gRPC 对象、原始模型载荷或无限制 Trace。

- [ ] **步骤 4：编写失败的可见流程测试**

使用类型安全的 `window.lumora` 测试替身验证：

- 首页提交“整理下载目录”。
- 任务页显示用户可理解的步骤。
- `WAITING_APPROVAL` 打开审批 Dock。
- “拒绝”和“仅允许本次”会携带任务 ID 与审批 ID 调用 `decideApproval`。
- `COMPLETED` 显示最终结果。

- [ ] **步骤 5：实现与设计稿一致的首版应用外壳**

创建稳定左侧导航、首页目标输入框、任务进度时间线、结果面板和固定审批 Dock。颜色、
字体、间距、圆角和阴影使用 CSS 自定义属性。卡片圆角不超过 `8px`，桌面端最小宽度为
`1100px`，低于该宽度时导航折叠为图标栏。

- [ ] **步骤 6：运行桌面测试和可访问性检查**

```powershell
cd desktop
pnpm test
pnpm lint
pnpm typecheck
```

预期：全部以退出码 `0` 结束；所有可操作控件均具有可访问名称。

- [ ] **步骤 7：提交**

```powershell
git add desktop
git commit -m "feat: add task and approval desktop flow"
```

---

### 任务 9：实现 Windows 开发联调编排

**文件：**

- 新建：`integration/start-dev.ps1`
- 新建：`integration/stop-dev.ps1`
- 新建：`integration/runtime-config.ps1`
- 新建：`integration/verify.ps1`
- 新建：`integration/tests/runtime-config.Tests.ps1`
- 新建：`docs/development.md`

**接口：**

- 输入：Python 模块入口、Java 可执行文件、Electron 开发命令和各运行时健康检查。
- 输出：使用私有端口和共享随机令牌，一条命令启动三个运行时。

- [ ] **步骤 1：先编写失败的运行配置测试**

Pester 测试必须断言：

- 端口可用并绑定 `127.0.0.1`。
- 启动令牌至少包含 32 字节随机数据。
- 运行状态只写入已忽略的 `integration/runtime/`。
- 日志不得输出秘密信息。
- 停止目标必须来自该目录下经过校验的 PID 文件。

- [ ] **步骤 2：运行测试并确认失败**

执行：

```powershell
Invoke-Pester integration/tests/runtime-config.Tests.ps1 -Output Detailed
```

预期：因 `runtime-config.ps1` 尚不存在而失败。

- [ ] **步骤 3：实现运行配置**

使用 `RandomNumberGenerator.GetBytes(32)` 生成令牌，使用
`TcpListener(IPAddress.Loopback, 0)` 分配可用端口。写文件或停止进程前，必须解析
运行文件的绝对路径，并确认目标仍位于 `integration/runtime` 下。

- [ ] **步骤 4：实现按健康状态排序的启动流程**

`start-dev.ps1` 按以下顺序执行：

```text
生成协议代码
启动 Python
等待 Python 健康检查
启动 Java
等待 Java 健康检查
启动 Electron
```

发生失败时，只停止本次运行生成了有效 PID 文件的进程，并返回非零退出码。

- [ ] **步骤 5：实现验证脚本和开发文档**

`verify.ps1` 运行协议 Lint、Python 测试、Java 测试、桌面测试、仓库边界检查，以及
任务 10 的纵向流程测试。开发文档写明独立打开 IDE、各工程命令、联合启动、日志位置和
关闭方式。

- [ ] **步骤 6：运行配置测试**

执行：

```powershell
Invoke-Pester integration/tests/runtime-config.Tests.ps1 -Output Detailed
```

预期：测试通过。

- [ ] **步骤 7：提交**

```powershell
git add integration docs/development.md
git commit -m "feat: orchestrate local windows development"
```

---

### 任务 10：验证完整纵向流程和 Windows 打包

**文件：**

- 新建：`integration/tests/vertical-flow.ps1`
- 新建：`desktop/tests/e2e/task-flow.spec.ts`
- 修改：`desktop/package.json`
- 修改：`desktop/forge.config.ts`
- 修改：`integration/verify.ps1`

**接口：**

- 输入：任务 2 至任务 9 产生的所有运行时接口。
- 输出：初始里程碑的自动化证明，以及 Windows Electron 开发安装包。

- [ ] **步骤 1：先编写失败的服务级纵向测试**

`vertical-flow.ps1` 使用临时 SQLite 数据库启动 Python 和 Java，再通过生成的
Client 执行：

```text
Health -> CreateTask -> SubscribeTaskEvents
-> WAITING_APPROVAL -> DecideApproval(ALLOW)
-> COMPLETED -> GetTask
```

断言事件序号严格递增；重新打开数据库后任务仍存在；审批记录和审计记录均已写入。

- [ ] **步骤 2：运行测试并观察第一个集成失败点**

执行：

```powershell
powershell -ExecutionPolicy Bypass -File integration/tests/vertical-flow.ps1
```

预期：在第一个尚未正确连接的跨运行时边界失败。

- [ ] **步骤 3：只修复该测试暴露的集成缺陷**

修复必须位于问题所属的运行时内部，不得添加共享运行时源码，也不得绕过协议。每修复一个
问题就重新运行，直至测试到达 `COMPLETED`。

- [ ] **步骤 4：编写失败的 Electron 端到端测试**

通过 Playwright 启动 Electron 并验证：

```typescript
await page.getByRole("textbox", { name: "任务目标" }).fill("整理下载目录");
await page.getByRole("button", { name: "开始任务" }).click();
await expect(page.getByText("确认敏感操作")).toBeVisible();
await page.getByRole("button", { name: "仅允许本次" }).click();
await expect(page.getByText("任务已完成")).toBeVisible();
```

- [ ] **步骤 5：在不模拟 Preload 的情况下跑通 Electron 流程**

执行：

```powershell
cd desktop
pnpm playwright test tests/e2e/task-flow.spec.ts
```

预期：连接真实 Java 和 Python 子进程并通过。

- [ ] **步骤 6：分别验证所有工程**

执行：

```powershell
buf lint protocol
cd agent; python -m pytest -q; cd ..
cd core; .\mvnw.cmd -q test; cd ..
cd desktop; pnpm test; pnpm lint; pnpm typecheck; cd ..
powershell -ExecutionPolicy Bypass -File integration/tests/repository-boundaries.ps1
powershell -ExecutionPolicy Bypass -File integration/tests/vertical-flow.ps1
```

预期：每个命令都以退出码 `0` 结束。

- [ ] **步骤 7：构建 Windows 开发包**

执行：

```powershell
cd desktop
pnpm make
```

预期：Electron Forge 在 `desktop/out/make` 下生成 Windows 包；打包后的应用能通过
资源路径发现 Java 和 Python Runtime 资产。

- [ ] **步骤 8：执行最终全量验证**

执行：

```powershell
powershell -ExecutionPolicy Bypass -File integration/verify.ps1
```

预期摘要：

```text
Protocol: PASS
Python: PASS
Java: PASS
Desktop: PASS
Boundaries: PASS
Vertical flow: PASS
Package: PASS
```

- [ ] **步骤 9：提交**

```powershell
git add desktop integration docs
git commit -m "test: verify initial lumora framework"
```

---

## 完成门槛

在宣布初始框架完成前，必须使用 `integration/verify.ps1` 的最新运行结果，逐项核对已批准
架构规格中的全部验收标准。把实际使用的 Java、Python、Node、pnpm、Buf 和 Electron
版本写入 `docs/development.md`。本里程碑通过前，不得开始真实模型接入、浏览器自动化、
文件修改能力、Agent 办公室动画或其他设计稿页面的完整实现。
