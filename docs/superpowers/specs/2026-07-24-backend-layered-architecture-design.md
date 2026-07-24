# LUMORA 后端分层重构设计

## 1. 目标

本次重构只调整初始工程的组织方式和进程通信边界，不扩展业务功能。

- Java 改为传统的 `Controller → Service → Mapper` 分层。
- Java 实体、DTO 和 Service 实现使用普通 `class`，不使用 `record`。
- Electron Main 通过 localhost REST 调用 Java，并通过 SSE 接收任务事件。
- Java 与 Python 继续通过 gRPC + Protobuf 通信。
- Python 使用 `requirements.txt` 管理依赖，并按职责拆分模块。
- 关键边界、状态规则和安全校验使用中文注释，避免无意义的逐行注释。

## 2. 进程与协议

```text
React Renderer
  → Preload 白名单 IPC
  → Electron Main REST Client / SSE Client
  → Java REST Controller
  → Java Service
  → Java Mapper
  → SQLite

Java Service
  → Java gRPC Client
  → Python gRPC Controller
  → Python Service / Graph / Agent

Python Tool Client
  → Java gRPC Tool Server
  → Java Service
```

REST 只用于 Electron Main 与 Java Local Core。Renderer 不直接访问 Java，也不持有端口和启动令牌。gRPC 用于 Java 与 Python 的强类型内部通信；Java 同时承担 Agent gRPC Client 和受控工具 gRPC Server 两种角色。

## 3. Java 工程结构

```text
core/src/main/java/com/lumora/core/
├── controller/
├── dto/
│   ├── request/
│   └── response/
├── entity/
├── service/
│   └── impl/
├── mapper/
├── grpc/
│   ├── client/
│   └── server/
├── config/
├── exception/
├── security/
├── common/
└── CoreApplication.java
```

各层职责：

- `controller`：接收 REST/SSE 请求，校验输入并转换 DTO，不写业务规则。
- `service`：定义业务能力；`service.impl` 负责状态转换、事务和跨服务编排。
- `mapper`：只定义 MyBatis 数据访问，不判断任务能否转换状态。
- `entity`：与 SQLite 表字段对应的普通 Java `class`。
- `dto`：REST 请求和响应模型，不直接暴露数据库实体。
- `grpc.client`：Java 调用 Python Agent Runtime。
- `grpc.server`：向 Python 暴露经过权限控制的本地工具。
- `config`、`security`、`exception`：分别管理配置、启动令牌认证和统一异常映射。

初始任务链路采用 `TaskController → TaskService → TaskServiceImpl → TaskMapper`。`AgentTask` 改为普通类，提供明确字段、构造方法、getter 和 setter。MyBatis SQL 放在 `core/src/main/resources/mapper/`，便于从 Mapper 接口快速定位到查询语句。

## 4. REST 与 SSE 约定

- API 前缀固定为 `/api/v1`。
- 创建任务：`POST /api/v1/tasks`。
- 查询任务：`GET /api/v1/tasks/{taskId}`。
- 审批任务：`POST /api/v1/tasks/{taskId}/approvals/{approvalId}`。
- 任务事件：`GET /api/v1/tasks/{taskId}/events`，响应类型为 SSE。
- Electron Main 设置请求超时，并负责 SSE 断线重连。
- 每个请求携带 `Authorization: Bearer <session-token>`。
- Java 只监听 `127.0.0.1` 随机端口，不允许绑定 `0.0.0.0`。

REST DTO、数据库 Entity 和 Protobuf Message 必须分别定义，禁止跨层复用。

## 5. Python 工程结构

```text
agent/
├── requirements.txt
├── requirements-dev.txt
├── app/
│   ├── controller/grpc/
│   ├── service/
│   ├── model/
│   ├── config/
│   ├── exception/
│   ├── graph/
│   ├── agents/
│   ├── providers/
│   ├── tool_clients/
│   ├── guardrails/
│   ├── evaluation/
│   └── tracing/
└── tests/
```

`requirements.txt` 只保存运行依赖。`requirements-dev.txt` 首行使用 `-r requirements.txt`，随后声明测试、格式化和类型检查工具。现有 `pyproject.toml` 不再承担依赖安装职责，并在完成工具配置迁移后删除。

Python gRPC Controller 只负责身份校验、Protobuf 转换和 gRPC 状态码映射。规划逻辑进入 `service`，Pydantic 模型进入 `model`，环境配置进入 `config`。生产环境只启动 `grpc.aio` Server，不引入 FastAPI。

## 6. 注释与编码规范

- 对进程边界、认证、状态机、事务和资源释放写中文注释，解释设计原因。
- Controller、Service、Mapper 和 gRPC 适配器使用类级注释说明职责。
- 公共方法在名称不足以表达约束时补充简短注释。
- getter、setter、普通赋值和显而易见的分支不写注释。
- 单个文件只承担一种主要职责，不在 Controller 中写 SQL，不在 Mapper 中写业务规则。
- Java 使用 4 空格缩进；Python 遵循 PEP 8；TypeScript 遵循现有格式。

## 7. 错误处理与安全

- Java 使用统一异常处理器将参数错误、资源不存在、非法状态转换映射为稳定的 HTTP 状态码和错误 DTO。
- Python 将认证失败、协议不兼容和参数错误映射为明确的 gRPC Status。
- 启动令牌不得写入日志、数据库、Renderer 状态或异常详情。
- Java 到 Python 的 RPC 必须设置 deadline，并支持取消传播。
- Mapper 写操作由 Service 事务统一管理。

## 8. 测试与验收

- Java Service 单元测试覆盖创建任务、合法状态转换和非法状态转换。
- Java Mapper 测试覆盖 SQLite 持久化和读取。
- Java Controller 测试覆盖 REST 参数、状态码和认证。
- Python 测试覆盖配置、身份校验、规划 Service 和 gRPC Controller 转换。
- Desktop 测试覆盖 IPC 到 REST Gateway 的参数传递和事件转发。
- 统一验证脚本检查目录边界、`requirements.txt`、Java 分层结构和现有前端测试。
- JDK 21 和 Python 虚拟环境仍由用户在 IDE 中配置，框架不创建或修改虚拟环境。

## 9. 文档同步范围

本规格确认后，需要同步：

- `generalDesign/windows-ai-assistant-architecture.md`
- `docs/development.md`
- `core/README.md`
- `agent/README.md`
- `protocol/README.md`
- `integration/verify.ps1` 及其结构检查说明

历史实施计划保留为当时决策记录，不回写成新的实现结果；本次重构另建实施计划。
