# LUMORA Local Core

Java 21、Spring Boot、MyBatis-Plus 和 SQLite 本地核心。

## 职责

- 管理任务、工作空间、会话、审批、模型、Memory、MCP 和审计。
- 使用 SQLite 持久化消息、计划、摘要、Artifact 索引、详细 TokenUsage 和应用设置。
- 向 Electron Main 提供本机 REST API 和 SSE 任务事件流。
- 通过本机 REST API 调用 Python Agent Runtime。
- 将 Python 返回的任务计划步骤与任务状态写入 SQLite。
- 持久化会话消息和活动上下文 Token，聚合每日及累计 Token 使用统计，并转发模型流式响应。
- 将 Agent 生成建模为持久化 Run；SSE 连接只负责观察，支持暂停、继续、断线事件重放和重启后安全恢复。
- 将模型可见的 Assistant tool call 与 Tool Result 轨迹和 UI 工作日志分开封存，续接时只恢复原生协议消息。
- 保存 Streamable HTTP/stdio MCP Server 配置，并只向当前 Agent 请求提供经解密的临时凭据或环境变量。
- 使用 Windows DPAPI 加密 API Key，并通过 MyBatis-Plus 将密文与模型配置统一保存到 SQLite。

## 边界

- 本工程不得导入 `desktop/` 或 `agent/` 的源码。
- 调用 Python 必须通过独立的 Agent HTTP Client 和 REST DTO。
- 对外 REST DTO、Agent REST DTO 和数据库实体相互分离。
- 当前文件和 Shell 工具由 Python 在 Core 授权的工作区内执行；浏览器 Worker 与 Windows 受限 Worker 仍是目标架构，不属于当前 Core 已实现能力。

## 代码结构

```text
agent/           Java 调用 Python Agent 的 HTTP Client、DTO 与转换
approval/        工具审批用例和 API
conversation/    消息、上下文摘要、Artifact、TokenUsage 与会话流
mcp/             MCP Transport 配置、认证/环境变量密文和连接测试
memory/          动态 Memory、个性化设置和项目指令同步
model/           供应商、多模型配置、连接测试与 API 格式
task/            任务、计划、工作区和任务偏好
shared/          REST 安全、通用异常、数据库配置和共享常量
```

各领域内部继续按 `api`、`application`、`domain`、`infrastructure` 分层。基础 CRUD 由
MyBatis-Plus `BaseMapper` 提供；复杂查询需要手写 SQL 时，再放入
`src/main/resources/mapper/`。SQLite 的 `TEXT` 时间列统一通过
`SqliteInstantTypeHandler` 按 ISO-8601 格式读写。Controller 不写业务规则，
Mapper 不判断状态转换。

## 会话 Run

`ConversationRunCoordinator` 是会话执行的唯一调度入口。当前默认允许 `3` 个不同任务并发，
可通过 `LUMORA_MAX_CONCURRENT_RUNS` 调整；同一任务仍只有一个活动 Run，问题队列严格串行。
队列、运行状态和事件序列均按 `run_id` 隔离。
SQLite 的 JDBC 连接池固定为单连接：Agent Run 和模型请求继续并发，只有消息、Run 事件等
短数据库事务按顺序提交。高频 Run 事件默认在 20ms 窗口内按 Run 合并事务，事件仍按
独立 `sequence` 落库并在提交后发布；暂停、取消和终态边界强制刷盘。连接同时设置
`busy_timeout=10000`，用于容忍防病毒扫描、备份等
进程外短暂占锁；这不会把任务执行重新退化为单任务串行。
关闭或切换 Electron 页面只会断开 SSE，不会取消 Core 中的 Run。应用进程意外退出后，
未结束的 Run 会在下次启动时恢复为 `PAUSED`，由用户显式继续。

手动暂停采用 Run/Turn 分层：Core 先将 Run 标记为 `PAUSING`，Python 在当前模型轮或
已启动工具的安全边界封口 Turn，并返回 `paused` 事件。Core 原子保存部分回答、工作记录和
工具结果后，将 Run 置为 `PAUSED` 并释放调度名额。继续时沿用同一 `runId` 创建新的内部
Turn，从持久化轨迹恢复，不创建可见用户消息，也不依赖进程内被冻结的 Worker。该语义在
正常暂停、断线重放和应用重启后保持一致。

## IDE 配置

使用 IntelliJ IDEA 单独打开 `core/`，将 Project SDK 和 Maven Runner JRE 设置为
JDK 21。复制 `src/main/resources/application-dev-local.example.yml` 为
`application-dev-local.yml`，设置 Java 端口、Python Agent 地址和本机开发令牌；
真实配置文件已被 Git 忽略。启动时启用 `dev-local` Profile。

当前仓库只保存 Maven Wrapper 配置。你在 IDE 中配置 Maven 后可执行：

```powershell
mvn -N wrapper:wrapper
```

该命令会生成完整的 Wrapper 脚本和所需文件。

## 测试

```powershell
mvn test
```

未配置 JDK 21 时，可从仓库根目录运行不编译源码的结构检查：

```powershell
powershell -ExecutionPolicy Bypass -File integration/tests/java-scaffold.ps1
```
