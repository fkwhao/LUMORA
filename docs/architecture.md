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
- 当前文件与命令工具由 Python Tool Registry 在 Java 授权的工作区和工具白名单内
  执行；未来浏览器、系统级能力仍应通过单独的受控 Capability 接入。
- Python 不获得任意磁盘或系统凭据权限。文件路径必须位于工作区内，Shell 只允许
  非交互命令，并在执行前经过参数与危险模式校验。

## 2. 通信原则

- Renderer 与 Main：受控 IPC。
- Main 与 Java：REST 处理命令和查询，SSE 推送任务事件。
- Java 与 Python：REST 处理短请求，真实运行阶段使用异步 Run + SSE。
- 所有本机 HTTP 服务只绑定 `127.0.0.1`，使用本机开发令牌认证。
- 跨进程契约使用版本号、关联 ID、稳定错误码和独立 DTO。
- Agent OpenAPI 的关键枚举和 PromptContext 字段由契约一致性测试校验，防止 Python
  DTO 与公开契约静默漂移。

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

统一执行过程逐步收敛到 `RunEvent`。当前会话链路已经实现模型文本、进度消息和
工具调用事件，后续 Agent/Artifact 等事件继续沿用同一结构扩展：

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
记忆提取等专用任务使用 `prompt/templates` 下的独立模板并由 `PromptLoader` 读取，
Service 不再内嵌另一套长提示词。

工具定义不复制到 System Prompt，也不注册尚未实现的“虚拟工具”。每个实际能力由
Python Harness 的 Tool Registry 提供名称、用途、输入 JSON Schema、风险属性、
并发策略和执行入口，模型请求只携带 Java 为当前工作区授权且注册中心真实存在的
工具。注册中心是工具 Schema 的唯一事实来源；Java 只传工具名称白名单，不再维护
重复 Schema。

当前实现包含 `list_files`、`search_in_file`、`read_file`、`apply_patch`、
`write_file` 和 `shell_command`。大文件默认先搜索定位、再按行分段读取，现有文件的
局部修改通过唯一文本匹配的原子补丁完成。注册中心
统一执行 Schema 校验、业务校验、工作区约束、并发锁和 UI metadata 装配。工具返回
的 `content` 会反馈给模型，`metadata` 只沿 SSE 事件发送给 UI，不进入模型上下文。
破坏性属性目前用于审计和界面表达；真正的执行前审批闸门尚未接入，因此新增高风险
工具前必须先补齐审批调度，不能只依赖 Prompt 或 `isDestructive` 标记。

Java 发给 Python 的 PromptContext 只包含 `workspacePath`、`projectInstructions`、
`availableTools` 和 `memorySummary`。稳定行为规则只存在于 Python 静态 Prompt；工具
Schema 只由 Python Tool Registry 生成。跨进程接口不再提供 `systemReminders` 或
`toolDefinitions` 这类可注入稳定规则、复制 Schema 的旁路。

Provider 只负责供应商请求和响应适配；最多二十轮的模型—工具循环由独立
`AgentLoopRunner` 编排。这样新增 Provider 不需要复制工具生命周期逻辑，工具开始、
完成、失败、阶段说明和累计 TokenUsage 仍通过同一事件协议输出。

完整设计与扩展方式见
[工具调用运行时设计](tool-calling-runtime-design.md)。

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

模型最终消息和 TokenUsage 写入 Java；模型 token 增量只用于实时展示。隐藏推理不
写入数据库，也不返回 Renderer。工具事件持久化前会移除整文件写入正文；局部补丁仅
保存有界的前后片段供右侧 Diff 审阅，同时截断其他参数、输出与错误，并限制单次回答
的工作记录数量。

当前 Python 尚未实现持久化 Checkpoint，因此进程重启后不能恢复执行中的模型调用；
后续恢复能力应以 Java Run Snapshot 和 Python Checkpoint 共同实现。本文不把目标能力
描述为当前已经具备的行为。

### 模型供应商配置

桌面设置页把模型来源分成两类：“套餐”是未来 LUMORA Managed Provider 的展示入口；
“自定义供应商”是当前可用的 BYOK 配置。Java SQLite 的
`model_configuration` 可保存多行供应商记录，每行包含供应商 ID、名称、Base URL、
默认模型指针、兼容旧接口的默认上下文缓存、API 格式、DPAPI Key 密文和启用状态。模型 ID 及其上下文窗口、最大
输出 Token 位于 `model_configuration_model` 子表。V12 迁移为旧单配置行补充
`api_format=chat-completions` 与 `is_active=1`；V13 再把原模型字段迁移为首条模型
配置，因此升级不会丢失原有连接。

供应商的创建、修改、删除、启用和模型目录查询通过以下 Java API 暴露给 Electron
Main，Renderer 仍只经过白名单 Preload IPC：

```text
GET    /api/v1/model/settings/providers
POST   /api/v1/model/settings/providers
PUT    /api/v1/model/settings/providers/{providerId}
DELETE /api/v1/model/settings/providers/{providerId}
POST   /api/v1/model/settings/providers/{providerId}/activate
POST   /api/v1/model/settings/providers/{providerId}/disable
POST   /api/v1/model/settings/providers/{providerId}/models
POST   /api/v1/model/settings/providers/{providerId}/model-configurations
PUT    /api/v1/model/settings/providers/{providerId}/model-configurations/{modelConfigurationId}
DELETE /api/v1/model/settings/providers/{providerId}/model-configurations/{modelConfigurationId}
POST   /api/v1/model/settings/providers/{providerId}/model-configurations/{modelConfigurationId}/test
```

首条自定义供应商自动启用；切换供应商时 Java 在同一事务内取消其他启用项；用户也可
显式禁用当前供应商，使本地暂时没有启用连接。删除当前启用项时按创建时间启用剩余的
第一项；删除供应商最后一个模型时自动禁用该供应商。模型连接测试会对指定模型发起
最小非流式请求。现有 `GET/PUT /api/v1/model/settings` 继续映射
当前启用项，保证对话与记忆提取链路向后兼容。`api_format` 当前允许
`anthropic`、`chat-completions`、`responses`，但仅完成选择和持久化；实际模型请求
仍由现有 Chat Completions Provider 执行。模型级最大输出 Token 会映射为
Chat Completions 请求的 `max_tokens`；会话上下文占比按当前选中模型的上下文窗口计算。

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

Controller 不直接调用 Entity 的静态映射方法：任务和会话响应由独立 Converter
完成；SSE 连接表属于 `controller/support`，持久化裁剪则由 conversation support
下的 Projector 完成，避免 Web、DTO、Entity 与持久化策略互相渗透。
记忆输入的规范化、JSON 校验与稳定哈希集中在 `MemoryValueNormalizer`，业务 Service
只负责记忆选择、版本更新和持久化流程。

Desktop 的 Zustand Store 负责动作和状态生命周期；聊天流事件处理、任务事件归并和
历史/实时工作记录映射分别位于独立模块，避免网关与 Store 各自维护一套事件投影。

重新生成仅允许编辑最后一条用户消息。Java 在事务中更新目标消息并删除它之后的旧
Assistant 回答，然后使用更新后的上下文重新调用模型。服务端会再次检查任务归属、
消息角色和消息顺序，前端的“仅最后一条可编辑”不作为安全边界。

停止生成会同时中断 Electron 到 Java 的流，并调用 Java 取消端点。Java 保存每个任务
的活动 `FutureTask`，取消后中断其 Python SSE 读取；Python Shell 工具在协程取消时
终止子进程，避免界面停止后后台继续生成或写入结果。

界面始终显示消息时间，复制与编辑操作只在气泡悬停或键盘聚焦时出现。旧数据库记录
没有耗时值时只显示“已处理”，不会用客户端估算值覆盖历史数据。

## 7. 安全边界

- API Key 不进入 LocalStorage、日志或 Git。
- Java 使用当前 Windows 用户的 DPAPI 加密 API Key，SQLite 只保存密文。
- Python 仅在已认证的 localhost 模型请求中临时使用明文 Key，不持久化。
- 工具执行采用工作区限制、风险分级和有界输出；高风险审批仍是待完成安全边界。
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
