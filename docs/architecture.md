# LUMORA 公开架构说明

本文只描述适合公开仓库的技术边界。内部产品草稿、运营后台和本机配置不属于本仓库。

## 1. 运行架构

```text
Electron Renderer
  → 白名单 Preload IPC
Electron Main
  → localhost REST + SSE
Java Local Core
  → localhost REST + SSE
Python Agent Runtime
  → OpenAI 兼容模型接口
```

### Electron Desktop

- Renderer 负责任务、对话、计划、Changes 和设置界面。
- Preload 只暴露按业务领域划分的白名单能力。
- Main 负责窗口生命周期、Java REST Client、SSE 重连和协议校验。
- Renderer 不启用 Node.js 集成，也不持有后端地址和启动令牌。

### Java Local Core

- 使用传统的 `Controller → Service → Mapper` 分层。
- 使用 MyBatis-Plus 管理基础数据库访问，复杂查询再使用明确 SQL。
- SQLite 保存任务、会话、消息、计划步骤和审批等本地状态。
- Java 是任务、审批、工具调用和审计状态的最终权威。
- 对 Electron 和 Python 分别使用独立 DTO，不暴露数据库实体。

### Python Agent Runtime

- FastAPI 提供版本化 REST/SSE 接口。
- 负责模型 Provider、流式响应解析、Agent Harness 和动态编排。
- 文件、命令和浏览器等本机操作通过 Java 的受控能力执行。
- 不直接获得无限制 Shell、任意磁盘或系统凭据权限。

## 2. 通信原则

- Renderer 与 Main：受控 IPC。
- Main 与 Java：REST 处理命令和查询，SSE 推送任务事件。
- Java 与 Python：REST 处理短请求，真实运行阶段使用异步 Run + SSE。
- 所有本机 HTTP 服务只绑定 `127.0.0.1`，使用本机开发令牌认证。
- 跨进程契约使用版本号、关联 ID、稳定错误码和独立 DTO。

## 3. Agent Harness

目标架构采用 Supervisor、动态 Worker、有界并发和队列调度：

```text
用户目标
  → Supervisor 拆分任务和依赖
  → 动态创建 Worker Agent
  → 有界并发调度
  → 调用模型与受控工具
  → 收集 Evidence 和 Artifact
  → Supervisor 汇总与验证
```

Agent 名称、职责和数量根据当前任务动态产生。文件、代码、浏览器和电脑控制属于
Capability，不是固定 Agent 类型。首版本机调度使用 `asyncio.Queue`、
`asyncio.Semaphore` 和任务 DAG；只有出现多实例或跨节点需求后才考虑 Redis 或
外部消息队列。

## 4. 统一运行事件

下一阶段使用统一 `RunEvent` 表达实时执行过程：

```text
RunEvent
├── RunLifecycleEvent
├── AgentLifecycleEvent
├── ModelStreamEvent
├── ToolExecutionEvent
├── ApprovalEvent
└── ArtifactEvent
```

典型事件包括：

```text
RUN_STARTED
PLAN_CREATED
AGENT_STARTED
MODEL_CALL_STARTED
REASONING_DELTA
TEXT_DELTA
TOOL_CALL_STARTED
TOOL_CALL_COMPLETED
APPROVAL_REQUIRED
DIFF_CREATED
RUN_COMPLETED
```

“正在思考”“正在编辑文件”等界面状态由结构化事件推导，不解析模型自然语言。
高频文本增量实时转发但不逐 token 落库；Run、Agent、工具、审批和 Artifact 的关键
状态由 Java 持久化。事件使用 `event_id` 去重，并通过 Run 内单调递增的 `sequence`
支持 SSE 重连和状态恢复。

## 5. System Prompt 与工具注册

LUMORA 采用与现代 Agent Harness 一致的分层装配方式，而不是把一份超长 Prompt
写死在模型 Provider 中：

```text
稳定规则片段
  + 当前工作区和项目规则
  + 本次运行实际可用的能力
  → PromptBuilder
  → Provider 请求
```

稳定规则按身份、协作、执行、工具安全和回复要求拆分，并保持供应商无关，因此
DeepSeek、OpenAI 兼容模型和后续 Managed Provider 可以共用。当前工作区、项目
指令和能力列表在请求时动态注入；API Key、启动令牌和其他凭据永远不进入 Prompt。

工具定义不复制到 System Prompt，也不注册尚未实现的“虚拟工具”。每个实际能力由
Harness 的 Tool Registry 提供名称、用途、输入 JSON Schema、风险级别和执行入口，
模型请求只携带当前 Run 被授权的工具。Java 继续强制执行路径范围、权限、审批和
幂等约束，Prompt 只负责指导模型，不能代替安全边界。

设计参考资料：

- [5.6 Sol System Prompt](https://github.com/elder-plinius/CL4R1T4S/blob/main/OPENAI/Codex_Desktop/5.6-Sol_SystemPrompt.md)
- [5.6 Sol Tools](https://github.com/elder-plinius/CL4R1T4S/blob/main/OPENAI/Codex_Desktop/5.6-Sol_Tools.json)

以上链接来自第三方仓库，仅用于研究结构设计，不属于 LUMORA 的运行时依赖或官方
安全规范。

## 6. 数据归属

```text
Electron：临时界面状态和本机显示偏好
Java：任务、会话、消息、审批、工具调用、审计和业务投影
Python：Agent 编排状态、模型适配和 Harness Checkpoint
```

模型最终消息和 TokenUsage 写入 Java；模型 token 增量只用于实时展示。Python
重启时通过 Java Snapshot 与自身 Checkpoint 恢复运行，不依赖内存事件队列。

### 会话消息生命周期

当前会话链路使用以下 Java API：

```text
GET  /api/v1/tasks/{taskId}/messages
POST /api/v1/tasks/{taskId}/messages/stream
POST /api/v1/tasks/{taskId}/messages/{messageId}/regenerate
```

`ConversationMessage` 持久化消息顺序、角色、正文、模型、TokenUsage、发送时间和
`duration_ms`。用户消息发送时间与 Assistant 回答耗时均由 Java 返回，Electron
只维护流式生成期间的临时投影，因此应用重启后仍可恢复。

重新生成仅允许编辑最后一条用户消息。Java 在事务中更新目标消息并删除它之后的旧
Assistant 回答，然后使用更新后的上下文重新调用模型。服务端会再次检查任务归属、
消息角色和消息顺序，前端的“仅最后一条可编辑”不作为安全边界。

界面始终显示消息时间，复制与编辑操作只在气泡悬停或键盘聚焦时出现。旧数据库记录
没有耗时值时只显示“已处理”，不会用客户端估算值覆盖历史数据。

## 7. 安全边界

- API Key 不进入 LocalStorage、日志或 Git。
- Java 使用当前 Windows 用户的 DPAPI 加密 API Key，SQLite 只保存密文。
- Python 仅在已认证的 localhost 模型请求中临时使用明文 Key，不持久化。
- 工具执行采用最小权限、风险分级和审批机制。
- 文件路径、命令参数和工具结果进入事件前必须脱敏。
- 平台 Provider Key 只存在于独立部署的云端服务，不下发到桌面端。

## 8. 仓库边界

本仓库包含完整桌面产品：

```text
desktop + core + agent + contracts
```

云端套餐后台和运营管理端属于独立部署单元，使用单独仓库维护。

## 9. 云端套餐与微服务演进

本地 Electron、Java Local Core 和 Python Agent Runtime 不进行微服务化。云端套餐
后台首版采用 Spring Boot、MyBatis-Plus 和 MySQL 的模块化单体，出现真实并发与独立
扩缩容需求后，按照以下顺序演进：

```text
Cloud API Gateway
  ├── Identity Service
  ├── Account Service
  ├── Model Gateway
  └── Usage Service
       → MySQL + Redis + Message Queue
```

优先拆分的 `Model Gateway` 使用 Spring WebFlux 转发高并发模型请求和 SSE；Redis
负责限流、短期额度快照与幂等键，MySQL 继续作为余额和账本的事实来源。用量结算出现
削峰和可靠重试需求后再引入 Redis Streams 或 RabbitMQ，不因“存在并发”就直接增加
Kafka 或 Kubernetes。

套餐扣费采用额度预占、真实 TokenUsage 结算和多余预占释放。请求与用量事件分别使用
唯一 `request_id` 和 `usage_id`，余额流水使用唯一约束与 Outbox 保证幂等和最终一致性。
