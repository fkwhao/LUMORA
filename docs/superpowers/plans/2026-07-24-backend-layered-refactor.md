# LUMORA Backend Layered Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Java 和 Python 初始骨架重构为易读、职责清楚的传统分层结构，并把 Electron Main 到 Java 的通信切换为 REST/SSE。

**Architecture:** Renderer 继续通过白名单 IPC 调用 Electron Main，Main 使用带启动令牌的 REST Client 和 SSE Client 连接 Java。Java 使用 `Controller → Service → Mapper`，并通过 gRPC Client 调 Python；Python 使用 gRPC Controller 调用独立 Service。

**Tech Stack:** Java 21、Spring Boot 3.5、Spring MVC、MyBatis、SQLite、Python 3.12、grpc.aio、Pydantic、Electron、TypeScript、Protobuf。

## Global Constraints

- 不创建或修改 Python 虚拟环境；Python 3.12 由用户在 IDE 中配置。
- 不配置或下载 JDK；Java 21 和 Maven 由用户在 IDE 中配置。
- 保留用户对 `AgentTask.java` 和 `TaskService.java` 的缩进调整，并通过重构吸收这些文件。
- `artwork/` 和 `generalDesign/` 不加入 Git；总体设计只在本地同步内容。
- Java 业务对象使用普通 `class`，不使用 `record` 和 Lombok。
- Java 使用 4 空格缩进；Python 遵循 PEP 8；TypeScript 保持现有格式。
- 关键进程边界、认证、状态转换、事务和资源释放使用中文注释。
- 普通 getter、setter、赋值和显而易见的判断不写注释。
- 每个任务先写测试并观察预期失败，再编写生产代码。

---

## File Structure

### Java

```text
core/src/main/java/com/lumora/core/
├── controller/TaskController.java
├── controller/TaskEventController.java
├── controller/ApprovalController.java
├── dto/request/CreateTaskRequest.java
├── dto/request/ApprovalDecisionRequest.java
├── dto/response/ErrorResponse.java
├── dto/response/TaskResponse.java
├── entity/AgentTask.java
├── entity/ApprovalRecord.java
├── entity/ApprovalDecision.java
├── entity/TaskStatus.java
├── service/TaskService.java
├── service/ApprovalService.java
├── service/impl/TaskServiceImpl.java
├── service/impl/ApprovalServiceImpl.java
├── mapper/TaskMapper.java
├── mapper/ApprovalMapper.java
├── grpc/client/AgentRuntimeClient.java
├── grpc/client/GrpcAgentRuntimeClient.java
├── config/CoreProperties.java
├── config/RuntimeBeansConfig.java
├── exception/IllegalTaskTransitionException.java
├── exception/TaskNotFoundException.java
├── exception/RestExceptionHandler.java
└── security/SessionTokenFilter.java
```

### Python

```text
agent/
├── requirements.txt
├── requirements-dev.txt
├── app/
│   ├── main.py
│   ├── config/settings.py
│   ├── controller/grpc/agent_servicer.py
│   ├── exception/runtime_errors.py
│   ├── model/plan_step.py
│   └── service/planner_service.py
└── tests/
    ├── controller/grpc/test_agent_servicer.py
    ├── service/test_planner_service.py
    └── config/test_settings.py
```

### Desktop

```text
desktop/src/main/
├── task-gateway.ts
├── rest-task-gateway.ts
└── java-event-stream.ts
```

---

### Task 1: Correct Protocol Ownership and Structural Checks

**Files:**
- Modify: `protocol/proto/lumora/v1/core.proto`
- Modify: `protocol/README.md`
- Modify: `protocol/tests/contract-shape.ps1`
- Modify: `integration/tests/java-scaffold.ps1`
- Create: `integration/tests/python-scaffold.ps1`
- Modify: `integration/verify.ps1`

**Interfaces:**
- Produces: `core.proto` 只保留 Java 与 Python 共享的任务消息，不再声明 Electron 专用 `CoreService`。
- Produces: 结构测试要求 Java 分层目录、普通 `AgentTask class` 和 Python requirements 文件存在。

- [ ] **Step 1: Write failing structure checks**

在 `java-scaffold.ps1` 中加入以下断言：

```powershell
$requiredJavaFiles = @(
    'core/src/main/java/com/lumora/core/controller/TaskController.java',
    'core/src/main/java/com/lumora/core/service/TaskService.java',
    'core/src/main/java/com/lumora/core/service/impl/TaskServiceImpl.java',
    'core/src/main/java/com/lumora/core/mapper/TaskMapper.java',
    'core/src/main/java/com/lumora/core/entity/AgentTask.java'
)

foreach ($file in $requiredJavaFiles) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Missing layered Java file: $file"
    }
}

$agentTask = Get-Content -Raw -Encoding UTF8 `
    'core/src/main/java/com/lumora/core/entity/AgentTask.java'
if ($agentTask -notmatch 'public class AgentTask' -or $agentTask -match 'record AgentTask') {
    throw 'AgentTask must be a regular Java class.'
}
```

新建 `python-scaffold.ps1`，检查：

```powershell
$requiredPythonFiles = @(
    'agent/requirements.txt',
    'agent/requirements-dev.txt',
    'agent/app/main.py',
    'agent/app/controller/grpc/agent_servicer.py',
    'agent/app/service/planner_service.py',
    'agent/app/model/plan_step.py',
    'agent/app/config/settings.py'
)

foreach ($file in $requiredPythonFiles) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Missing layered Python file: $file"
    }
}

if (Test-Path -LiteralPath 'agent/pyproject.toml') {
    throw 'Python dependencies must be managed by requirements files.'
}
```

- [ ] **Step 2: Run checks and verify the expected failure**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File integration/tests/java-scaffold.ps1
powershell -ExecutionPolicy Bypass -File integration/tests/python-scaffold.ps1
```

Expected: both fail because the new layered files do not exist.

- [ ] **Step 3: Remove the obsolete frontend gRPC service**

从 `core.proto` 删除 `CreateTaskRequest`、`GetTaskRequest`、`SubscribeTaskEventsRequest`、`DecideApprovalRequest` 和 `CoreService`；保留 `TaskSnapshot`、`TaskEvent`、`ApprovalRequest` 及枚举，供 Java/Python 内部消息使用。同步协议 README，明确 REST DTO 不由 Protobuf 生成。

- [ ] **Step 4: Run protocol checks**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File protocol/tests/contract-shape.ps1
```

Expected: PASS，且脚本不再要求 `CoreService`。

- [ ] **Step 5: Commit**

```powershell
git add protocol integration
git commit -m "refactor: separate rest and grpc protocol boundaries"
```

---

### Task 2: Build the Traditional Java Service and Mapper Layers

**Files:**
- Delete: `core/src/main/java/com/lumora/core/task/AgentTask.java`
- Delete: `core/src/main/java/com/lumora/core/task/TaskStatus.java`
- Delete: `core/src/main/java/com/lumora/core/task/TaskService.java`
- Delete: `core/src/main/java/com/lumora/core/task/IllegalTaskTransitionException.java`
- Create: `core/src/main/java/com/lumora/core/entity/AgentTask.java`
- Create: `core/src/main/java/com/lumora/core/entity/ApprovalRecord.java`
- Create: `core/src/main/java/com/lumora/core/entity/ApprovalDecision.java`
- Create: `core/src/main/java/com/lumora/core/entity/TaskStatus.java`
- Create: `core/src/main/java/com/lumora/core/service/TaskService.java`
- Create: `core/src/main/java/com/lumora/core/service/ApprovalService.java`
- Create: `core/src/main/java/com/lumora/core/service/impl/TaskServiceImpl.java`
- Create: `core/src/main/java/com/lumora/core/service/impl/ApprovalServiceImpl.java`
- Create: `core/src/main/java/com/lumora/core/mapper/TaskMapper.java`
- Create: `core/src/main/java/com/lumora/core/mapper/ApprovalMapper.java`
- Create: `core/src/main/resources/mapper/TaskMapper.xml`
- Create: `core/src/main/resources/mapper/ApprovalMapper.xml`
- Create: `core/src/main/java/com/lumora/core/config/RuntimeBeansConfig.java`
- Create: `core/src/main/java/com/lumora/core/common/TaskIdGenerator.java`
- Create: `core/src/main/java/com/lumora/core/exception/IllegalTaskTransitionException.java`
- Create: `core/src/main/java/com/lumora/core/exception/TaskNotFoundException.java`
- Move/Rewrite: `core/src/test/java/com/lumora/core/service/TaskServiceTest.java`
- Create: `core/src/test/java/com/lumora/core/service/ApprovalServiceTest.java`

**Interfaces:**
- Produces: `TaskService#createTask(String)`, `getTask(String)`, `transitionTask(String, TaskStatus)`.
- Consumes: `TaskMapper#insert`, `findById`, `update`.
- Produces: `ApprovalService#decideApproval(String, String, ApprovalDecision)`.
- Consumes: `ApprovalMapper#findPendingByTaskId`, `updateDecision`.

- [ ] **Step 1: Rewrite the service test first**

测试使用内存 Fake Mapper，明确期望的普通 Java API：

```java
class TaskServiceTest {

    @Test
    void createsAndPersistsATask() {
        TaskMapper mapper = new InMemoryTaskMapper();
        TaskService service = new TaskServiceImpl(
                mapper,
                Clock.fixed(NOW, ZoneOffset.UTC),
                new FixedTaskIdGenerator(TASK_ID)
        );

        AgentTask task = service.createTask("  整理下载目录  ");

        assertThat(task.getTaskId()).isEqualTo(TASK_ID);
        assertThat(task.getGoal()).isEqualTo("整理下载目录");
        assertThat(mapper.findById(TASK_ID)).contains(task);
    }
}
```

保留现有合法转换、非法直接完成、空目标和中断保持身份测试，并将 record accessor 改为 getter。`ApprovalServiceTest` 使用内存 TaskMapper 和 ApprovalMapper，覆盖正确审批、伪造 ID、提前审批和重复审批。

- [ ] **Step 2: Verify the Java source is red**

Run after IDE config:

```powershell
cd core
mvn test -Dtest=TaskServiceTest,ApprovalServiceTest
```

Expected: compilation failure because the new packages and classes do not exist. 在当前未配置 JDK 的环境中，以 Task 1 的 Java 结构检查失败作为可执行红灯证据，并在交付说明中记录 Maven 未运行。

- [ ] **Step 3: Implement ordinary entity and service interfaces**

`TaskService.java`:

```java
public interface TaskService {

    AgentTask createTask(String goal);

    AgentTask getTask(String taskId);

    AgentTask transitionTask(String taskId, TaskStatus nextStatus);
}
```

`TaskMapper.java`:

```java
@Mapper
public interface TaskMapper {

    int insert(AgentTask task);

    Optional<AgentTask> findById(String taskId);

    int update(AgentTask task);
}
```

`ApprovalService.java`:

```java
public interface ApprovalService {

    AgentTask decideApproval(
            String taskId,
            String approvalId,
            ApprovalDecision decision
    );
}
```

`AgentTask`、`ApprovalRecord` 使用字段、完整构造方法、无参构造方法和 getter/setter。`TaskServiceImpl` 使用构造器注入 Mapper、Clock 和 TaskIdGenerator；`ApprovalServiceImpl` 验证任务处于 `WAITING_APPROVAL`、审批 ID 完全匹配且尚未决定。状态转换集中在 Service，Mapper 不判断业务状态。

- [ ] **Step 4: Add MyBatis XML**

`TaskMapper.xml` 和 `ApprovalMapper.xml` 分别声明完整 `resultMap`。任务 SQL 实现 `insert`、`findById` 和 `update`；审批 SQL 实现 `findPendingByTaskId` 和 `updateDecision`。字段与 `V1__initial_schema.sql` 保持一致。

- [ ] **Step 5: Run structure and Java tests**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File integration/tests/java-scaffold.ps1
cd core
mvn test -Dtest=TaskServiceTest
```

Expected: structure PASS；配置 JDK 21 后 JUnit PASS。

- [ ] **Step 6: Commit**

```powershell
git add core
git commit -m "refactor: add traditional java service and mapper layers"
```

---

### Task 3: Add Java REST, SSE, Authentication, and Error Mapping

**Files:**
- Modify: `core/pom.xml`
- Modify: `core/src/main/resources/application.yml`
- Create: `core/src/main/java/com/lumora/core/controller/TaskController.java`
- Create: `core/src/main/java/com/lumora/core/controller/TaskEventController.java`
- Create: `core/src/main/java/com/lumora/core/controller/ApprovalController.java`
- Create: `core/src/main/java/com/lumora/core/dto/request/CreateTaskRequest.java`
- Create: `core/src/main/java/com/lumora/core/dto/request/ApprovalDecisionRequest.java`
- Create: `core/src/main/java/com/lumora/core/dto/response/TaskResponse.java`
- Create: `core/src/main/java/com/lumora/core/dto/response/ErrorResponse.java`
- Create: `core/src/main/java/com/lumora/core/config/CoreProperties.java`
- Create: `core/src/main/java/com/lumora/core/security/SessionTokenFilter.java`
- Create: `core/src/main/java/com/lumora/core/exception/RestExceptionHandler.java`
- Create: `core/src/test/java/com/lumora/core/controller/TaskControllerTest.java`
- Create: `core/src/test/java/com/lumora/core/controller/ApprovalControllerTest.java`
- Create: `core/src/test/java/com/lumora/core/security/SessionTokenFilterTest.java`

**Interfaces:**
- Produces: `POST /api/v1/tasks`, `GET /api/v1/tasks/{taskId}`.
- Produces: `POST /api/v1/tasks/{taskId}/approvals/{approvalId}`.
- Produces: `GET /api/v1/tasks/{taskId}/events` with `text/event-stream`.

- [ ] **Step 1: Write MockMvc tests**

```java
mockMvc.perform(post("/api/v1/tasks")
        .header(HttpHeaders.AUTHORIZATION, "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"goal\":\"整理下载目录\"}"))
    .andExpect(status().isCreated())
    .andExpect(jsonPath("$.taskId").value(TASK_ID))
    .andExpect(jsonPath("$.status").value("CREATED"));
```

另写测试证明缺失令牌返回 401、空目标返回 400、未知任务返回 404。审批测试必须证明伪造 ID 返回 409、重复审批返回 409，并且只接受 `ALLOW_ONCE` 和 `REJECT`。

- [ ] **Step 2: Run and observe failure**

Run after IDE config:

```powershell
cd core
mvn test -Dtest=TaskControllerTest,ApprovalControllerTest,SessionTokenFilterTest
```

Expected: compilation failure because controllers and filter do not exist.

- [ ] **Step 3: Add Spring MVC and loopback configuration**

将 `spring-boot-starter` 替换为 `spring-boot-starter-web`，删除 `web-application-type: none`，增加：

```yaml
server:
  address: 127.0.0.1
  port: ${LUMORA_CORE_PORT:0}
```

- [ ] **Step 4: Implement DTOs and controllers**

Controller 只调用对应 Service 并使用 `TaskResponse.fromEntity(task)` 转换，不返回 Entity。`ApprovalController` 将 REST 决定映射到 `ApprovalDecision`。`TaskEventController` 返回 `SseEmitter`，并在注释中说明事件订阅由 Electron Main 持有，Renderer 不直接连接。

- [ ] **Step 5: Implement authentication and exception mapping**

`SessionTokenFilter` 只保护 `/api/**`，使用常量时间比较 Bearer Token。`RestExceptionHandler` 映射：

```text
IllegalArgumentException -> 400
SecurityException -> 401
TaskNotFoundException -> 404
IllegalTaskTransitionException -> 409
```

- [ ] **Step 6: Run tests and commit**

```powershell
cd core
mvn test
git add core
git commit -m "feat: expose java task rest api"
```

Expected after JDK configuration: all Java tests PASS.

---

### Task 4: Restructure Python Around Requirements and Clear Layers

**Files:**
- Delete: `agent/pyproject.toml`
- Delete: `agent/src/lumora_agent/`
- Create: `agent/requirements.txt`
- Create: `agent/requirements-dev.txt`
- Create: `agent/app/main.py`
- Create: `agent/app/config/settings.py`
- Create: `agent/app/controller/grpc/agent_servicer.py`
- Create: `agent/app/exception/runtime_errors.py`
- Create: `agent/app/model/plan_step.py`
- Create: `agent/app/service/planner_service.py`
- Move/Rewrite: `agent/tests/config/test_settings.py`
- Move/Rewrite: `agent/tests/service/test_planner_service.py`
- Move/Rewrite: `agent/tests/controller/grpc/test_agent_servicer.py`

**Interfaces:**
- Produces: `PlannerService.build_plan(goal: str) -> list[PlanStep]`.
- Produces: `AgentSettings.from_environment()`.
- Produces: `create_agent_servicer(settings, planner_service)`.

- [ ] **Step 1: Move tests to the desired imports**

```python
from app.service.planner_service import PlannerService


class PlannerServiceTest(unittest.TestCase):
    def test_sensitive_step_requires_approval(self) -> None:
        steps = PlannerService().build_plan("整理下载目录")
        self.assertTrue(steps[2].requires_approval)
```

Controller 测试继续覆盖错误令牌、协议不兼容和空目标映射。

- [ ] **Step 2: Run and observe import failure**

Run:

```powershell
$env:PYTHONPATH = "$(Resolve-Path agent)"
python -m unittest discover -s agent/tests -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.service'`.

- [ ] **Step 3: Create requirements files**

`requirements.txt`:

```text
grpcio>=1.74,<2
protobuf>=6.31,<7
pydantic>=2.11,<3
```

`requirements-dev.txt`:

```text
-r requirements.txt
grpcio-tools>=1.74,<2
mypy>=1.17,<2
pytest>=8.4,<9
ruff>=0.12,<1
```

- [ ] **Step 4: Implement the layered package**

将 `PlanStep` 移入 model，将 `build_plan` 改为 `PlannerService` 的实例方法，将 Settings 移入 config。gRPC Controller 使用构造器接收 Settings 和 PlannerService，不在 Controller 内定义业务类。

`app/main.py` 使用 `grpc.aio.server()`，负责注册 Controller、检查绑定端口、启动和优雅等待；资源生命周期处写中文注释。

- [ ] **Step 5: Run tests and static checks**

```powershell
$env:PYTHONPATH = "$(Resolve-Path agent)"
python -m unittest discover -s agent/tests -v
python -m ruff check agent/app agent/tests
python -m mypy agent/app
```

Expected: all Python tests and installed static checks PASS。

- [ ] **Step 6: Commit**

```powershell
git add agent
git commit -m "refactor: organize python agent runtime layers"
```

---

### Task 5: Add the Electron Main REST Gateway Without Changing React UI

**Files:**
- Create: `desktop/src/main/rest-task-gateway.ts`
- Create: `desktop/src/main/java-event-stream.ts`
- Modify: `desktop/src/main/task-gateway.ts`
- Modify: `desktop/src/main/index.ts`
- Modify: `desktop/package.json`
- Modify: `desktop/pnpm-lock.yaml`
- Create: `desktop/tests/main/rest-task-gateway.test.ts`
- Create: `desktop/tests/main/java-event-stream.test.ts`

**Interfaces:**
- Produces: `RestTaskGateway implements TaskGateway`.
- Consumes: Java `/api/v1/tasks` REST endpoints and SSE endpoint.

- [ ] **Step 1: Write gateway tests with a local fake HTTP server**

测试创建任务时验证：

```typescript
expect(receivedRequest.method).toBe("POST");
expect(receivedRequest.url).toBe("/api/v1/tasks");
expect(receivedRequest.headers.authorization).toBe("Bearer test-token");
expect(JSON.parse(receivedBody)).toEqual({ goal: "整理下载目录" });
```

另写测试验证非 2xx 响应转换为稳定错误，以及 SSE 事件只转发匹配任务。

- [ ] **Step 2: Run and observe missing-module failure**

```powershell
cd desktop
pnpm test -- tests/main/rest-task-gateway.test.ts tests/main/java-event-stream.test.ts
```

Expected: FAIL because the gateway and event stream modules do not exist.

- [ ] **Step 3: Implement REST gateway**

`RestTaskGateway` 构造器接收：

```typescript
type JavaConnection = {
  baseUrl: string;
  sessionToken: string;
};
```

运行 `pnpm add eventsource-parser`，使用该库解析 SSE 帧，不手写协议解析。所有请求设置 Bearer Token、JSON Content-Type 和 AbortSignal timeout。错误正文只保留可展示消息，不记录令牌。

- [ ] **Step 4: Keep demo mode explicit**

在 Java 进程尚未提供 ready 信息时继续使用 `DemoTaskGateway`；只有取得合法的 loopback base URL 和 session token 后才实例化 `RestTaskGateway`。此处写中文注释说明 Demo 是开发降级路径，不是生产通信方式。

- [ ] **Step 5: Run desktop tests**

```powershell
cd desktop
pnpm test
pnpm typecheck
```

Expected: all desktop tests and typecheck PASS.

- [ ] **Step 6: Commit**

```powershell
git add desktop
git commit -m "feat: add electron java rest gateway"
```

---

### Task 6: Synchronize Documentation and Run Final Verification

**Files:**
- Modify: `docs/development.md`
- Modify: `core/README.md`
- Modify: `agent/README.md`
- Modify: `protocol/README.md`
- Modify: `integration/verify.ps1`
- Verify locally: `generalDesign/windows-ai-assistant-architecture.md`

**Interfaces:**
- Produces: IDE 打开方式、依赖安装、启动顺序和通信边界的统一中文说明。

- [ ] **Step 1: Update documentation**

文档必须使用以下命令：

```powershell
cd agent
python -m pip install -r requirements-dev.txt
$env:PYTHONPATH = (Resolve-Path '.').Path
python -m unittest discover -s tests -v
```

Java 文档说明 Controller、Service、Mapper、Entity 和 gRPC 目录职责。Desktop 文档说明 Renderer 使用 IPC，只有 Main 连接 Java REST/SSE。

- [ ] **Step 2: Run the complete available verification**

```powershell
powershell -ExecutionPolicy Bypass -File integration/verify.ps1 `
    -PythonCommand 'C:\Users\16085\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
git diff --check
```

Expected: repository, protocol, Java structure, Python and desktop checks PASS。Java Maven 测试在 JDK 21 配置后通过 `-IncludeJava` 执行；未执行时必须在交付说明中明确标记。

- [ ] **Step 3: Verify tracked scope**

```powershell
git status --short
```

Expected: `artwork/`、`generalDesign/` 保持未跟踪；不得暂存 `.idea/`、`.venv/`、生成代码或设计图片。

- [ ] **Step 4: Commit**

```powershell
git add docs/development.md core/README.md agent/README.md protocol/README.md integration
git commit -m "docs: align layered backend development guide"
```

- [ ] **Step 5: Final branch summary**

```powershell
git log --oneline --decorate -10
git status --short
```

交付时报告测试数量、Java Maven 是否执行、分支名、提交列表和下一阶段真实联调范围。
