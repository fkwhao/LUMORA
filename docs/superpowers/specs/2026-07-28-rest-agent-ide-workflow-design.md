# LUMORA REST Agent 与 IDE 独立启动设计

## 1. 目标

将 Java Core 与 Python Agent 之间的通信从 gRPC + Protobuf 改为本机
REST/JSON，并取消当前阶段的一键启动器。开发者分别在 PyCharm、IntelliJ IDEA
和 WebStorm/IntelliJ IDEA 中启动 Python Agent、Java Core 和 Electron
Desktop。

本次调整优先降低开发环境复杂度，同时继续保持清晰的语言边界、分层结构、安全
认证和可测试性。正式打包阶段的进程托管不在本次范围内，后续仍可由 Electron
Main 启动 Java、Java 再启动 Python。

## 2. 选型结论

采用普通 REST/JSON，不采用 JSON-RPC，也不保留 gRPC 双栈。

- REST 可以直接通过浏览器、IDE HTTP Client、PowerShell 和 MockWebServer
  调试。
- 当前 Agent 接口只有健康检查和一次请求一次响应的任务规划，不需要 gRPC
  双向流、流控或高吞吐能力。
- 以后出现持续输出需求时，在具体接口上增加 SSE；不提前引入 WebSocket。
- OpenAPI 只作为人工可读的共享契约，不生成 Java 或 Python 源码，避免重新
  引入生成链。

## 3. 总体架构

```text
Electron Renderer
    -> Preload 白名单 IPC
    -> Electron Main
    -> Java Core REST / SSE
    -> Java Service
    -> Python Agent REST / JSON
    -> Python Service
```

开发时三个运行时由各自 IDE 启动：

```text
PyCharm        -> Python Agent，127.0.0.1:45101
IntelliJ IDEA  -> Java Core，127.0.0.1:45102
WebStorm/IDEA  -> Electron Desktop
```

启动顺序为 Python、Java、Electron。IDE 调试使用同一个仅限本机开发的启动
令牌。Java 将真实开发令牌写入被 Git 忽略的
`application-dev-local.yml`；Python 和 Electron 分别在 IDE Run
Configuration 中配置同一个值。仓库只提交不含真实值的 Java 示例文件。真实
令牌不得写入可跟踪配置、日志或 Git。

## 4. 仓库边界

### 4.1 Desktop

`desktop/` 继续是独立 pnpm 工程，保留自己的 `pnpm-lock.yaml` 和
`pnpm-workspace.yaml`。删除未使用的 `@grpc/grpc-js` 依赖。Renderer 不能读取
端口、令牌或 Node API，只有 Electron Main 调用 Java REST/SSE。

### 4.2 Java Core

Java 继续采用传统分层和普通 class：

```text
controller/                  REST 入口
service/ + service/impl/     业务与状态流转
mapper/                      MyBatis-Plus 数据访问
entity/                      数据库实体
dto/request/                 Electron -> Java 请求
dto/response/                Java -> Electron 响应
agent/client/                Java -> Python 稳定 Client 接口及 HTTP 实现
agent/dto/request/           Java -> Python JSON 请求
agent/dto/response/          Python -> Java JSON 响应
agent/model/                 Java 内部 Agent 领域值对象
```

删除 gRPC、Protobuf、OS classifier 和 protobuf Maven Plugin。HTTP 实现使用
Spring Boot 已有 `RestClient`，不引入 WebFlux。`TaskServiceImpl` 仍依赖
`AgentRuntimeClient` 接口，不直接依赖 HTTP DTO。

### 4.3 Python Agent

Python 继续使用 `requirements.txt` 和 `requirements-dev.txt`，以 FastAPI 和
Uvicorn 提供本机 HTTP 服务：

```text
app/controller/http/         路由与 HTTP 状态码映射
app/dto/request/             请求模型
app/dto/response/            响应模型
app/security/                Bearer Token 和协议版本校验
app/service/                 规划业务
app/model/                   内部模型
app/config/                  环境配置
```

Controller 只负责认证、协议校验、DTO 转换和 HTTP 错误映射。规划逻辑继续留在
`PlannerService`，不得把业务逻辑写入路由函数。

### 4.4 共享契约

删除 `protocol/` 中的 Protobuf、Buf 配置、生成脚本和生成代码，新增：

```text
contracts/
└── agent-api.yaml
```

OpenAPI 文件记录 Python Agent 的 HTTP 路径、Header、请求、响应和错误结构。
它不属于任何语言工程，不生成源码，也不参与正常启动。

### 4.5 Integration

`integration/` 只保留仓库边界检查、统一测试脚本和联调说明。删除
`integration/dev/`、`integration/dev.mjs` 和对应 launcher tests。

删除根 `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`，恢复 Desktop
独立 lock 所有权。正常开发不再提供根 `pnpm dev`。

## 5. Python Agent REST 契约

### 5.1 通用 Header

受保护接口必须携带：

```http
Authorization: Bearer <startup-token>
X-Lumora-Protocol-Version: 1
X-Correlation-Id: <correlation-id>
```

认证使用常量时间比较。错误响应、异常和日志不得包含启动令牌。

### 5.2 健康检查

```http
GET /api/v1/health
```

响应：

```json
{
  "serviceName": "lumora-agent",
  "serviceVersion": "0.1.0",
  "protocolVersion": "1"
}
```

健康接口也必须认证，确保 Java 的 IDE 配置和协议版本在真正调用业务前可验证。

### 5.3 任务规划

```http
POST /api/v1/tasks/plan
Content-Type: application/json
```

请求：

```json
{
  "taskId": "task-123",
  "goal": "整理本地文档"
}
```

成功响应：

```json
{
  "taskId": "task-123",
  "steps": [
    {
      "stepId": "understand-goal",
      "title": "理解目标",
      "description": "分析任务目标：整理本地文档",
      "requiresApproval": false
    }
  ]
}
```

错误映射：

- 缺少或错误 Token：`401 Unauthorized`
- 协议版本不匹配：`412 Precondition Failed`
- 请求字段不合法或目标为空：`400 Bad Request`
- 未预期服务错误：`500 Internal Server Error`

错误 JSON 只包含稳定错误码、用户信息、是否可重试和 correlation ID，不返回
堆栈、令牌或完整内部异常。

## 6. Java HTTP Client

保留业务层使用的稳定接口：

```java
public interface AgentRuntimeClient {
    List<AgentPlanStep> planTask(
            String taskId,
            String goal,
            String correlationId
    );
}
```

将其移动到 `com.lumora.core.agent.client`。HTTP 实现
`HttpAgentRuntimeClient`：

- 只允许 `http://127.0.0.1:<port>`。
- 从 `CoreProperties` 读取 Agent URL、Token 和协议版本。
- 每次请求写入三个通用 Header。
- 使用 30 秒请求超时。
- 将 HTTP DTO 转为 `AgentPlanStep`，业务层不接触 HTTP 类型。
- 将 401、412、4xx、5xx 和连接失败转换为明确的本地异常，异常信息不得包含
  Token。

Java 配置改为：

```yaml
lumora:
  agent-url: ${LUMORA_AGENT_URL:http://127.0.0.1:45101}
  agent-startup-token: ${LUMORA_AGENT_STARTUP_TOKEN:${LUMORA_STARTUP_TOKEN:}}
```

被 Git 跟踪的 `application.yml` 只保存环境变量占位和 loopback 默认地址，
不保存真实 Token。

Java 本机调试可以额外创建不提交 Git 的：

```text
core/src/main/resources/application-dev-local.yml
```

```yaml
lumora:
  startup-token: lumora-local-debug-token-change-me
  agent-startup-token: lumora-local-debug-token-change-me
```

仓库提交 `application-dev-local.example.yml`，并通过 `.gitignore` 排除
`application-dev-local.yml`。Python 和 Electron 在各自 IDE Run
Configuration 中设置相同的 `LUMORA_STARTUP_TOKEN`，三处开发 Token 必须
一致；正式打包后改为每次启动随机生成并通过子进程环境变量传递。

## 7. IDE 启动

### 7.1 Python

- Interpreter：`agent/.venv/Scripts/python.exe`
- Module：`app.main`
- Working directory：`agent/`
- IDE 环境变量：Agent 端口、启动 Token、协议版本

### 7.2 Java

- Main class：`com.lumora.core.CoreApplication`
- JDK：21
- Working directory：`core/`
- Profile：`dev-local`
- `application-dev-local.yml`：Core 端口、Agent URL、同一个 Agent Token、
  协议版本、SQLite 路径

### 7.3 Electron

- package：`desktop/package.json`
- script：`start`
- Working directory：`desktop/`
- IDE 环境变量：Java Core URL、Java 启动 Token

IDE Compound Configuration 不作为标准入口，因为它不能保证三个服务的就绪
顺序。开发者依次点击三个 Run/Debug Configuration。

## 8. 保留与删除

保留：

- Maven Wrapper
- Liquibase 自动 SQLite 迁移
- Java Core 认证健康接口
- Java Controller/Service/Mapper/MyBatis-Plus 分层
- Electron -> Java REST/SSE
- Python PlannerService 与内部 Pydantic 模型
- 统一验证脚本

删除：

- 所有 gRPC 和 Protobuf 运行时代码与依赖
- Buf 和协议生成步骤
- 根 pnpm workspace
- 一键启动器、端口分配器、日志聚合器和进程 supervisor
- Python gRPC ready 行

历史设计和计划保留为决策记录，但在文件开头标记“已由 REST Agent 设计取代”，
避免后续开发者继续执行旧方案。同步更新 README、开发文档和未跟踪的总体设计
文档；`generalDesign/` 仍不得加入 Git。

## 9. 注释与代码规范

- Java 使用普通 class，不使用 record。
- Java 保持 Controller、Service、Mapper 分层；跨服务 Client 独立放入
  `agent/client`。
- Python Controller、DTO、Security、Service、Model、Config 分目录。
- 认证、协议校验、HTTP 错误映射、事务、迁移和生命周期边界必须写中文注释。
- 普通 getter/setter、显而易见的赋值和测试准备代码不写无意义注释。
- 不允许 Java 导入 Python 源码，也不允许 Python 依赖 Java 源码。
- OpenAPI DTO、Java HTTP DTO、Python Pydantic DTO 和业务模型相互独立。

## 10. 测试与验收

Python：

- FastAPI TestClient 覆盖健康检查、规划成功、401、412、400。
- Controller 测试使用真实路由、认证依赖和 PlannerService；不测试 mock 本身。
- PlannerService 原有单元测试继续通过。

Java：

- 使用本机 mock HTTP server 验证路径、Header、JSON、响应转换和错误映射。
- `TaskServiceImpl` 测试继续只依赖 `AgentRuntimeClient` 接口。
- Maven 构建不得再生成 Protobuf 代码或下载 protoc。
- Liquibase 和现有 Controller/Service/Mapper 测试继续通过。

Desktop：

- 现有 REST/SSE、IPC、Renderer 测试继续通过。
- dependency/lock 中不再包含直接的 `@grpc/grpc-js`。

仓库：

- 不存在 `protocol/`、`integration/dev/`、根 pnpm workspace 或
  `agent/generated/`。
- 不存在业务源码中的 gRPC、Protobuf、Buf 引用。
- 三个工程可分别通过各自 IDE 入口启动。
- 完整验证通过后，`git status --short` 仍只将 `artwork/` 和
  `generalDesign/` 显示为未跟踪目录。

## 11. 非目标

- 本次不实现 Electron 正式版子进程托管。
- 本次不提供新的根级一键启动命令。
- 本次不实现用户注册、登录、Access Token、Refresh Token 或用户表。
- 本次不实现套餐、订单、支付、云端余额或权威计费。
- 本次不引入 Docker、服务发现、反向代理或远程 Agent。
- 本次不引入 WebSocket、消息队列、JSON-RPC 或 OpenAPI 代码生成。
- 本次不改变任务状态机、审批规则、SQLite 表结构或前端界面。

## 12. 后续账户与商业化演进

当前版本是纯本地单用户应用，本地会话、消息、任务和审批记录不关联用户身份。
Windows 用户账户和本地文件权限作为当前用户边界。

Java Core 继续作为状态、数据、审批和权限的唯一权威入口。未来加入账户体系时：

1. 在 Java 中增加 Spring Security、用户会话和设备管理。
2. 通过 Liquibase 为会话、任务和用量记录增加用户归属。
3. Electron 持有用户 Access Token；Python 不处理用户密码或 Refresh Token。
4. Java 与 Python 之间继续使用独立的内部服务启动令牌，不能复用用户 Token。

Python 后续调用模型时可以返回 provider、model、inputTokens、outputTokens 和
cachedTokens 等 usage 数据；Java 负责关联任务、会话、时间和预计成本并写入
本地数据库。本次迁移不提前实现 usage 表或套餐逻辑。

正式套餐、余额和计费必须由未来云端服务作为权威来源，不能只信任可被本机用户
修改的 SQLite。这样可以先完成 Agent 功能与链路，再在不推翻本地核心架构的
前提下增加登录、云同步、用量统计和套餐能力。
