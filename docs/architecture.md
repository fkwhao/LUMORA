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
  → RoutingModelProvider
      ├── Chat Completions
      ├── OpenAI Responses
      └── Anthropic Messages
```

### Electron Desktop

- Renderer 负责任务、对话、计划、Changes、Hosted Web Search、上下文/Token 统计和设置界面。
- 多步骤任务的最近一次 `update_plan` 快照显示在对话区域右上角；清单收起后为紧凑
  胶囊，全部步骤完成后自动隐藏。计划仅用于透明展示，不增加等待用户确认的阶段。
- Preload 只暴露按业务领域划分的白名单能力。
- Main 负责窗口生命周期、Java REST Client、SSE 重连和协议校验。
- Renderer 不启用 Node.js 集成，也不持有后端地址和启动令牌。

### Java Local Core

- 使用传统的 `Controller → Service → Mapper` 分层。
- 使用 MyBatis-Plus 管理基础数据库访问，复杂查询再使用明确 SQL。
- SQLite 保存任务、会话、消息、计划步骤、审批、模型/MCP 配置、Memory、上下文摘要、Artifact 索引和详细 TokenUsage 等本地状态。
- Java 是任务、审批、工具调用和审计状态的最终权威。
- 对 Electron 和 Python 分别使用独立 DTO，不暴露数据库实体。

### Python Agent Runtime

- FastAPI 提供版本化 REST/SSE 接口。
- 负责三种模型协议的路由与适配、流式响应解析、Agent Harness、动态编排、远程 MCP 和 Hosted Web Search 事件转换。
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

Python HTTP 层按资源拆分为 `chat_routes.py`、`artifact_routes.py`、`model_routes.py`、
`memory_routes.py`、`mcp_routes.py`、`approval_routes.py` 和 `system_routes.py`。`AgentHttpController` 只聚合
版本化子路由；`HttpRequestGuard` 统一认证与协议错误映射，`AgentHttpError` 位于独立错误模块，
`ChatStreamEventMapper` 独占内部 `RunEvent` 到公开 SSE DTO 的转换。公开路径与 HTTP 方法由
OpenAPI 路由集合契约测试锁定。

## 3. Agent Harness

当前 Python Runtime 已将运行时按以下依赖方向拆分：

```text
transport/http
  → ChatService（请求用例、REST/SSE 边界）
  → AgentHarness（一次 Agent 运行生命周期）
      ├── AgentLoopRunner（模型—工具循环与运行事件）
      ├── ToolCallExecutor（校验、审批与单次工具生命周期）
      ├── ContextPlanner（预算与 Compact）
      ├── ToolResultProcessor（Artifact 与模型输出保护）
      ├── ToolRegistry / PermissionEngine
      └── ModelProviderPort
              ↑
          RoutingModelProvider
              ├── OpenAICompatibleProvider
              ├── ResponsesProvider
              └── AnthropicProvider
```

`ChatService` 依赖完整 `ModelProviderPort`，`MemoryExtractionService` 只依赖最小的
`CompletionProviderPort`，`AgentHarness` 只依赖 `AgentTurnProviderPort`。`main.py` 在组合根
实例化 `RoutingModelProvider`，再按模型配置中的 `apiFormat` 选择 Chat Completions、Responses
或 Anthropic 适配器；本地模型和测试 Fake Provider 仍可通过同一 Port 替换。具体 Provider
不再创建或拥有 Agent Loop；它只实现模型发现、完成、
流式完成、单回合工具调用增量流和摘要能力。Provider 回合结构与回调契约集中在
`app/harness/contracts.py`，Port 集中在 `app/harness/ports/model_provider.py`，从而避免 Provider
反向依赖具体 `AgentLoopRunner`。`AgentHarness` 为每次运行创建独立 Runner，避免并发任务共享
可变 Prompt 或中途摘要状态。Provider、ChatService、Harness 与 ToolCallExecutor 统一输出内部
`RunEvent`；只有 HTTP Controller 的 `ChatStreamEventMapper` 可以将其映射为公开
`ChatStreamEventResponse`，因此核心运行层不再依赖 SSE DTO。

三种远程模型适配器都在首次请求时懒创建进程级 `httpx.AsyncClient`，同一 Agent
进程内的模型发现、正常回合、工具续跑、上下文压缩和智能审批可复用 DNS、TCP/TLS 与
HTTP keep-alive 连接。池最多保留 20 条空闲连接，空闲 120 秒后淘汰，总并发连接上限为
100；每类请求仍保留原有 30/60/120 秒超时。连接池不缓存模型响应，也不增加自动重试；
`RoutingModelProvider` 在 FastAPI 退出时统一关闭各适配器的连接池。

所有流式聊天请求都从 `ChatService` 进入 `AgentHarness`，不再由 Service 在 Provider 原生流和
Agent Loop 之间分支。Harness 保留两种内部策略：没有可用工具时透传 Provider 原生增量流；
存在工具且已建立工作区 ToolContext 时进入 `AgentLoopRunner`，由 Runner 实时转发最终正文
增量并累计流式工具调用参数。统一入口不会牺牲普通聊天或项目任务的
逐段输出，同时为两种策略提供共同的取消、Tracing、上下文守卫和后续多 Agent 扩展点。

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

Python 会话执行过程已经统一使用 transport-neutral 的简化 `RunEvent`，覆盖模型文本、推理、
进度、工具、审批、上下文压缩、用量和生命周期事件。HTTP 边界负责 camelCase 字段与 SSE
序列化，公开事件枚举、内部事件枚举和 OpenAPI 由契约测试保持一致。当前公开类型主要包括：

```text
text_delta / text_reset / reasoning_delta / progress_message
tool_started / tool_completed / tool_failed
tool_approval_requested / tool_approval_resolved
approval_review_started / approval_review_completed
web_search_started / web_search_progress
web_search_completed / web_search_failed
context_compaction_started / context_compaction_progress
context_compacted / context_compaction_failed
usage / paused / completed / failed
```

完整 Run Runtime 后续仍沿用同一抽象扩展 Agent、Plan 和 Artifact 生命周期，并升级为：

```text
RunEvent
├── RunLifecycleEvent
├── PlanLifecycleEvent
├── AgentLifecycleEvent
├── ModelStreamEvent
├── ToolExecutionEvent
├── ApprovalEvent
└── ArtifactEvent
```

工具、审批、Compact 和完成状态由结构化事件推导；模型生成的 `progress_message` 只作为
用户可见的语义阶段标题，不作为任务权威状态。普通多步骤任务通常只在目标明显切换时生成
2～4 个概括阶段，连续工具调用沿用当前阶段，具体发现和测试数字留到最终回答。

高频文本增量实时转发但不逐 token 落库，最终消息、工作记录、用量、工具审批和 Artifact
索引由 Java 持久化。会话执行已经由 Java 的耐久 `ConversationRun` 外壳承载；事件以同一
`run_id` 内单调递增的 `sequence` 写入 `conversation_run_event`，Electron 可按序重放。
运行中事件先进入 Core 的单写入日志，默认以 20ms 短窗口按 Run 合并；批次仍逐条
保留公开事件和序号，但只查询一次 Run、开启一次事务并更新一次最终序号。
事件在事务提交后才向 SSE 发布；完成、失败、暂停、取消和运行状态边界会强制刷盘，
因此断线重放和重启恢复不依赖计时器。不同 Run 的 SSE 订阅只在各自锁域内回放和推送。
完整的多 Agent Snapshot/Checkpoint 仍是目标设计，但暂停与进程重启不再依赖保留 Python
调用栈：Java 会封存当前 Turn 的中间轨迹，并在同一 Run 中创建新的内部续接 Turn。

### Run、Turn 与暂停恢复

`Run` 是一次用户目标的耐久执行外壳，`Turn` 是 Run 内一次实际的模型—工具循环。暂停不会
在内存中冻结 Python 协程，也不会让模型继续在后台生成；它会在安全边界结束当前 Turn，
持久化已经产生的文本、工作记录、用量和工具结果，然后释放模型连接、SSE 与运行栈。状态机为：

```text
QUEUED ──获得槽位──→ RUNNING ──完成/失败/取消──→ 终态
  │                    │
  │ 暂停               ├── 等待审批 → WAITING_APPROVAL → RUNNING
  ↓                    └── 暂停 ───────────────┐
PAUSED ←──────────── PAUSING ←─────────────────┤
  │                         WAITING_APPROVAL ──暂停──┘
  └── 继续 → QUEUED
```

继续时复用原 `run_id`，推进 `replayFromSequence`，通过内部 `continueMessage` 创建续接 Turn；
不会向会话表插入一条伪造的“继续上一次任务”用户消息。运行时只在稳定历史前缀之后追加一条
瞬时续接指令。每个完整模型回合会额外产生不可见的 `protocol_message`，原样保存 Assistant 的
`tool_calls` 和对应 Tool Result；下一 Turn 直接把这些结构化消息交回 Provider，不再把展示层
工作日志改写成自然语言让模型重新解释。流式响应若在完整 Assistant 消息形成前被取消，已显示的
半段正文只保留给 UI，不进入后续模型历史。

暂停采用协作式安全边界：正在等待的模型请求、上下文压缩、自动审批 Reviewer 或人工审批会
响应暂停并结束；尚未开始的工具不再执行；已经开始的工具不被强行杀死，而是先收敛结果再暂停。
暂停控制信号即使早于 Python 流注册也会先锁存并立即确认；模型或 Reviewer 取消后的正常资源
清理只等待一个 200ms 的有界窗口，异常 Provider 不能无限拖住 `PAUSED`。因此正常生成和审批
可以近即时暂停，只有已经发出 `tool_started` 的实际工具仍可能因安全收敛短暂停留在 `PAUSING`。
暂停发生在同一 Assistant 已声明多个工具、但部分工具尚未派发时，Harness 会为未派发调用补齐
`ABORTED_BEFORE_DISPATCH` Tool Result，使历史始终满足 Assistant tool call 与 Tool Result 成对
约束；已经完成的工具保存真实结果，不会被重新执行。项目尚处开发阶段，不读取旧版文本恢复记录，
结构化 Assistant/Tool 轨迹是唯一续接来源。暂停/继续本身不会生成摘要；上下文压缩仍只在正常
Token 阈值触发时执行。

继续入口的会话读取和上下文装配在 Run Worker 内执行，HTTP/IPC 不再同步等待整套准备流程；Run
会先发布“正在恢复执行现场”，随后进入模型或工具阶段。远程 MCP 连接按任务和完整 Server 配置
进入带引用计数的有界会话池，同一任务的续接 Turn 直接复用既有 Session 与工具定义；不同 Server
并行准备，配置变化自动使用新会话，空闲项才允许淘汰，应用退出时统一关闭。因此暂停恢复不会再
为每个 MCP Server 串行重复 initialize/list_tools，同时仍可安全扩展到多个会话并发。

逻辑 `run_id` 在续接时保持不变，但每个内部 Turn 使用 `run_id + replayFromSequence` 派生独立的
Runtime Turn ID，用于 Python 暂停控制和中断封存幂等键。重复的 `paused` 或 `completed` 终态只
处理一次。`conversation_message.sequence` 不在模型请求开始时预留，而是在 Assistant、暂停片段、
异步用量记录实际写入的事务中读取当前最大值并分配；所有消息写入经过同一持久化边界串行提交，
避免上一 Turn 的异步记忆用量占用旧预留序号。若显式暂停期间封存仍发生异常，Java 会从该 Turn
已落库的 RunEvent 尝试重建中间轨迹并保持 Run 为 `PAUSED`，不能把暂停意图降级为 `FAILED`。
应用启动时还会修复历史版本已经产生的同类失败，但必须同时满足消息序号唯一约束错误和当前
Turn 存在 `PAUSING` 耐久事件；普通模型或工具失败不会被自动改写为暂停。

应用重启后，Java 将遗留的 `QUEUED`、`RUNNING`、`PAUSING` 和 `WAITING_APPROVAL` Run 恢复为
`PAUSED`；已经开始的 Turn 会先从事件记录重建并封存中间轨迹，未开始的排队 Run 保留原触发
输入。当前 `lumora.runs.max-concurrent` 默认为 `3`，不同任务在有界槽位内并发；Run 存储、
事件流和调度器按 `run_id` 隔离。同一任务仍只保留一个活动 Run，其问题队列严格串行。
Python 工具层在跨 Run 共享的资源域中协调工作区和文件访问，并对完整文件覆盖执行陈旧
版本检查；同一模型步骤内的显式安全工具通过有界滚动池并发，独占工具形成顺序屏障。
完整边界见[任务并发与资源感知设计](cross-task-concurrency-design.md)。

### 问题队列与运行中引导

Desktop 只保留一个发送入口：没有活动 Run 时直接开始 Turn；存在活动或暂停 Run 时默认创建
耐久 `ConversationInput(NEXT_TURN)`。输入保存在 SQLite 的 `conversation_input`，当前 Run 结束后
由 `ConversationRunCoordinator` 按位置自动领取并创建新 Run。队列支持编辑、删除和排序，不依赖
Renderer 或 Python 进程内存。

队列中的问题可通过“调整方向”转换为绑定当前 `run_id` 的 `NEXT_STEP`。Python Runtime 只在
下一个安全步骤边界认领 Steer，并发出 `steer_claimed`；Java 随后把它保存为正常可见的 User
消息并推进最终 Assistant 的父消息。暂停、暂停中或尚未获得槽位的 Run 不立即接收 Steer，输入
保持 `PENDING`，继续 Run 后再投递。该机制不是强制停止当前模型或工具，也不会丢弃已经形成的
Assistant Tool Call / Tool Result 协议轨迹。

完整状态、接口、失败处理和 Composer 视觉规范见
[对话问题队列与 Steer 设计](conversation-input-queue-design.md)。

### 常驻任务 Runtime 的阶段决策

当前不把每个任务的 `AgentLoopRunner` 或 Python 协程长期驻留在内存中。Agent 进程、
`ChatService`、`AgentHarness`、模型 Provider 和连接池已经常驻；单次 Turn 结束后释放 Runner，
任务队列、Steer、暂停意图、协议轨迹和恢复位置由 Java Core 的耐久 Run 数据维护。现有暂停、继续
和问题队列因此不依赖常驻 Python 调用栈，Runtime 崩溃或应用重启后仍可以按持久化状态恢复。

常驻的任务级 Runtime 暂缓到多 Agent 阶段一并实现。届时它不作为单纯的启动耗时优化，而作为
每任务 `SessionActor`/长期 Driver：持有任务 Inbox、Supervisor/Worker 生命周期、运行中 Steer
路由、租约和内存态快照，并通过 Run Snapshot 与 Agent Checkpoint 和 Core 的耐久状态对齐。
开始该阶段前必须同时设计空闲 TTL、内存预算、任务隔离、进程重启恢复以及 Runtime 与数据库的
单一事实来源，避免当前已稳定的暂停和队列机制出现第二套状态机。

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

当前实现包含 `update_plan`、`list_files`、`search_in_file`、`read_file`、
`apply_patch`、`write_file`、`shell_command`、`artifact_read` 和
`artifact_search`。`update_plan` 发布无副作用的完整计划快照；大文件默认先搜索定位、
再按行分段读取，现有文件的局部修改通过唯一文本匹配的原子补丁完成。注册中心
统一执行 Schema 校验、业务校验、工作区约束、并发锁和 UI metadata 装配。工具返回
的 `content` 会反馈给模型，`metadata` 只沿 SSE 事件发送给 UI，不进入模型上下文。
内置工具按 `planning_tools.py`、`artifact_tools.py`、`filesystem_tools.py` 和
`shell_tools.py` 分能力维护，
`default_registry.py` 只按稳定顺序装配；`tool_runtime.py` 保留旧导入兼容入口。破坏性属性
同时用于审计、界面表达和执行前权限审批，不能只依赖 Prompt 或标记本身阻止危险操作。

Java 发给 Python 的 PromptContext 只包含 `workspacePath`、`projectInstructions`、
`availableTools`、兼容旧调用的 `memorySummary`、结构化 `memoryCandidates`、任务 ID、
会话摘要和权限事实。稳定行为规则只存在于 Python 静态 Prompt；工具
Schema 只由 Python Tool Registry 生成。跨进程接口不再提供 `systemReminders` 或
`toolDefinitions` 这类可注入稳定规则、复制 Schema 的旁路。

Provider 只负责供应商请求和响应适配；最多二十轮的模型—工具循环位于
`app/harness/agent_loop.py`，由 `AgentHarness` 创建和驱动。单次工具调用的参数校验、权限审批、
执行与事件投影位于 `app/execution/tool_call_executor.py`；工具结果的 Artifact 外置及 40,000
字符模型输入保护位于 `app/execution/tool_result_processor.py`。这样新增 Provider 不需要复制
工具生命周期、权限或上下文逻辑，工具开始、完成、失败、阶段说明和累计 TokenUsage 仍通过
同一事件协议输出。

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

模型最终消息和 TokenUsage 写入 Java；模型文本增量只用于实时展示。TokenUsage 在协议边界
统一为 `promptTokens`、`completionTokens`、`totalTokens`、未缓存输入、普通输出、推理、缓存
读取、缓存写入及缓存指标可用性。供应商未返回的推理或缓存明细保持为 0，并通过
`cacheMetricsAvailable` 区分“真实为零”和“协议未提供缓存指标”。隐藏推理正文不
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
配置，因此升级不会丢失原有连接。模型目录同步后，父表仍只保留一条供应商记录，
多个模型应在 `model_configuration_model` 中分别查询；设置页模型连接测试成功时使用绿色确认态。

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
`anthropic`、`chat-completions`、`responses`，Python 的 `RoutingModelProvider` 会据此发送到
`/messages`、`/chat/completions` 或 `/responses`。模型级最大输出 Token 分别映射到协议对应的
请求字段；会话上下文占比按当前选中模型的上下文窗口计算。Hosted Web Search 是模型级显式
能力，仅 Responses 与 Anthropic 适配器当前提供，Chat Completions 暂不启用。

### MCP 与 Hosted Web Search

远程 MCP Server 配置由 Desktop 设置页经白名单 IPC 写入 Java Core。Core 以
`application_setting` 保存 Server 配置，使用 DPAPI 加密 Bearer/API Key/自定义 Header 凭据，
并只在当前模型请求中把临时运行配置交给 Python。Python 按请求相关性发现远程 Streamable HTTP
MCP 的 Tools、Resources、Resource Templates 与 Prompts；工具统一进入当前请求的 Tool Registry，
继续接受 Schema 校验、权限判断、自动 Reviewer/HITL、事件投影和结果保护。远程内容一律视为
不可信上下文。任务内的远程 Session 和工具目录会跨模型 Turn 复用，并以引用计数保护并发使用；
Server 配置改变时使用新的缓存键，应用退出时关闭全部 Session。当前不支持本地 stdio MCP、OAuth、
订阅和能力变更通知，完整边界见
[MCP 远程能力接入](mcp-runtime-design.md)。

Hosted Web Search 由模型供应商执行，不经过本地 Shell。Responses 使用原生 `web_search`，Anthropic
使用原生 Web Search Tool；适配器把搜索状态、错误、引用和来源统一投影为 RunEvent 与工作记录。
搜索能力按模型显式开启，普通连接测试、上下文压缩和后台专用模型调用不会携带搜索工具。完整
支持矩阵见 [Hosted Web Search](hosted-web-search.md)。

### 会话消息生命周期

当前会话链路使用以下 Java API：

```text
GET  /api/v1/tasks/{taskId}/messages
POST /api/v1/tasks/{taskId}/messages/stream
POST /api/v1/tasks/{taskId}/messages/{messageId}/regenerate
```

`ConversationMessage` 持久化消息顺序、角色、正文、模型、TokenUsage、最近请求的
`activeContextTokens`、发送时间和 `duration_ms`。详细用量包括输入、输出、推理、缓存读写与
缓存指标可用性；Java 的 `GET /api/v1/usage/statistics` 按本机已保存的 Assistant 消息聚合总量、
每日用量、请求数、会话数、峰值和连续活跃天数。用户消息发送时间与 Assistant 回答耗时均由 Java 返回，Electron
只维护流式生成期间的临时投影，因此应用重启后仍可恢复。

任务页右侧上下文面板同时展示最近请求的上下文总量、会话累计用量和原始消息。用户、助手、
工具调用与其他的上下文占比由 Renderer 根据本地消息和工作记录估算，只用于快速观察构成；
个人资料页展示 Java 聚合的本机 Token 总量、每日热力图和缓存指标。两者都不上传到云端。

Controller 不直接调用 Entity 的静态映射方法：任务和会话响应由独立 Converter
完成；SSE 连接表属于 `controller/support`，持久化裁剪则由 conversation support
下的 Projector 完成，避免 Web、DTO、Entity 与持久化策略互相渗透。
记忆输入的规范化、JSON 校验与稳定哈希集中在 `MemoryValueNormalizer`，业务 Service
只负责记忆选择、版本更新和持久化流程。

### Memory 分层

Memory 保持 Java 持久化、Python 检索与提取的既有边界，并明确分为 User、Project 和
Conversation 三个动态范围；Project Instructions 是工作区中的 `AGENTS.md`、`CLAUDE.md`
或 `.lumora/` 下同名文件，不进入动态记忆表。Java 每个范围只发送有界候选，Python 按当前请求
综合相关性、重要度、置信度、更新时间和实际使用频率选取少量条目。会话 Auto-Compact 摘要仍由
独立表维护，不与长期 Memory 合并。

提取协议使用 `UPSERT`、`ARCHIVE` 表达动态记忆生命周期。归档前 Java 必须确认目标 ID 来自
本轮活动记忆提取上下文，并重新校验数据库作用域，避免模型越权失效其他记忆；类型和语义键不是
稳定身份，允许在规则分类升级时变化。明确的长期项目规则由 Python 分类为
`PROJECT_INSTRUCTIONS`，Java 只维护 `.lumora/AGENTS.md` 中带边界标记的受控区块；同键更新、
撤销删除，受控区块以外的用户手写内容不被覆盖。
跨轮次重新确认已归档的动态事实时，Java 在处理 `UPSERT` 时按语义槽恢复最近的 `ARCHIVED`
记录，不依赖自然语言内容哈希完全一致。归档历史不进入聊天检索，仅以每作用域最多 8 条的有界
集合进入 Python 记忆提取上下文，帮助提取器复用稳定语义键和目标 ID。

动态内容继续集中在 `memory_item` 一张表，`scope_type` 表达层级。Desktop“个性化”页通过
Java Core 的 `GET/PUT /api/v1/memory/settings` 控制全局记忆开关，通过 `DELETE /api/v1/memory`
重置全部动态记忆；开关值存入通用 `application_setting`，关闭时同时停止检索注入和自动提取，
但不删除已有内容。重置操作不触碰聊天、Auto-Compact 摘要或项目指令文件。

完整数据字段、提取规则、注入优先级和兼容策略见
[Memory 系统设计](memory-system-design.md)。

Desktop 的 Zustand Store 负责动作和状态生命周期；聊天流事件处理、任务事件归并和
历史/实时工作记录映射分别位于独立模块，避免网关与 Store 各自维护一套事件投影。

重新生成仅允许编辑最后一条用户消息。Java 在事务中更新目标消息并删除它之后的旧
Assistant 回答，然后使用更新后的上下文重新调用模型。服务端会再次检查任务归属、
消息角色和消息顺序，前端的“仅最后一条可编辑”不作为安全边界。

续接 Turn 的 Assistant 消息以被暂停的 Assistant 片段为父节点，用消息树保留同一 Run 内的
执行轨迹，因此一条回答的直接父节点不保证是 User。Desktop 触发重新生成时必须沿活动消息链
向上回溯最近的 User 祖先，并同时识别持久化 `messageId` 与 Renderer 临时 `runtimeId`；不能把
Assistant 的直接 `parentMessageId` 当作原始问题。Java 仍以回溯得到的最后一条用户消息作为
重新生成边界，并在服务端执行归属、角色和顺序校验。

停止生成会同时中断 Electron 到 Java 的流，并调用 Java 取消端点。Java 保存每个任务
的活动 `FutureTask`，取消后中断其 Python SSE 读取；Python Shell 工具在协程取消时
终止子进程，避免界面停止后后台继续生成或写入结果。

界面始终显示消息时间，复制与编辑操作只在气泡悬停或键盘聚焦时出现。旧数据库记录
没有耗时值时只显示“已处理”，不会用客户端估算值覆盖历史数据。

## 7. 安全边界

- API Key 不进入 LocalStorage、日志或 Git。
- Java 使用当前 Windows 用户的 DPAPI 加密 API Key，SQLite 只保存密文。
- Python 仅在已认证的 localhost 模型请求中临时使用明文 Key，不持久化。
- 工具执行采用工作区限制、风险分级和有界输出；高风险调用已经接入分层规则、权限模式与 HITL 审批。
- 当前文件与 Shell 工具仍运行在宿主用户权限下，应用层策略不能替代操作系统级隔离。
- 文件路径、命令参数和工具结果进入事件前必须脱敏。
- 平台 Provider Key 只存在于独立部署的云端服务，不下发到桌面端。

## 8. 高级本地能力目标设计

> 状态：渐进实现。8.1 的两层上下文压缩已经落地；浏览器、插件、多 Agent 与操作系统
> 沙箱仍是目标设计，不能作为当前产品已经具备这些能力的声明。

这些能力继续复用现有 `ToolRegistry`、`RunEvent`、权限引擎和 Java 持久化边界。
不为浏览器、插件或 Worker 另建一套不可审计的执行通道。

### 8.1 上下文编排（已实现）

当前采用两层压缩，详细协议见 `docs/context-management-design.md`：

1. Python Agent 在工具结果进入下一轮模型上下文之前执行 Artifact 外置。单个成功结果超过
   50,000 字符，或同一模型回合内联结果累计超过 200,000 字符时，将完整 UTF-8 文本写入
   按任务隔离的本地 Artifact 存储；事件和模型上下文仅保留预览、不透明 Artifact ID、哈希与
   大小。模型只能通过有界的 `artifact_read` / `artifact_search` 工具再次读取。
2. `ContextPlanner` 根据模型 `contextWindow`、最大输出、下一轮增长和估算误差预留计算触发线。
   到达触发线后，将较早消息生成结构化会话摘要，同时至少保留最近 5 条原文，并尽量保留最近
   10,000 Token。Java 将摘要版本和覆盖到的消息序号独立持久化，后续请求不再重复发送已覆盖原文。

自动与手动压缩共用同一条链路。自动压缩通过 `context_compaction_started`、
`context_compacted` 事件进入工作过程；Desktop 在处理步骤中显示扫光。用户也可在输入框首部
输入 `/compact`，或从 `+` 菜单选择“压缩”后触发。Artifact 通过任务归属校验后按块展示，
不会把完整大结果重新注入聊天消息。

供应商返回的 TokenUsage 仍是已发生请求的事实值；发起请求前的预算使用本地保守估算。后续可
继续增强模型专用 tokenizer、压缩失败熔断、Artifact 生命周期清理和摘要失效重建。

### 8.2 浏览器 Capability

浏览器能力由独立 Browser Worker 承载，首版使用 Playwright。模型只看到注册中心暴露的
受控工具，例如导航、读取页面快照、点击、输入、截图和下载；不直接获得 CDP 地址、浏览器
进程句柄或任意 JavaScript 执行入口。

浏览器会话按任务隔离并由 `BrowserSessionManager` 管理。页面文本、可访问性树、截图和下载
作为 Artifact 进入统一事件链；大页面仍受上下文预算约束。跨域导航、文件上传、下载、登录态
使用和外部网络访问进入现有权限引擎。Cookie 与凭据保存在本地受保护存储中，模型只能引用
凭据槽位，不能读取明文。

### 8.3 插件系统

插件以声明式 `plugin.json` 作为入口，至少包含插件 ID、版本、兼容的 LUMORA 版本、工具
Schema、所需权限、入口进程和发布者信息。插件安装、启用、升级与卸载由 Desktop 发起，
Java 保存状态和授权，Python 只接收本次运行允许注册的能力。

第三方插件不能注入 Renderer、不能在主 Python 进程中任意 `import`，也不能绕过 Tool
Registry 直接执行。插件代码运行在独立 Plugin Host 中，通过版本化 IPC 调用；文件、网络、
Shell、凭据和浏览器能力仍由 Capability Broker 授权。首版只支持随应用发布或用户明确安装的
本地官方插件，完成签名、撤销、兼容性和隔离后再开放第三方市场。

### 8.4 多 Agent 调度

现有 Supervisor/Worker 目标模型继续沿用统一 Run。Supervisor 把目标拆成带依赖关系的 DAG，
Worker 只获得任务所需的上下文切片、工具白名单、预算和截止时间，不复制完整会话。所有 Worker
事件携带 `runId`、`agentId`、`parentAgentId` 和单调序号，由 Supervisor 汇总证据后生成最终回答。

首版只并行执行只读研究任务。涉及写文件时使用工作区写入租约：同一目标文件只能由一个 Worker
持有写租约，其他 Worker 必须等待或重新规划；提交补丁前再次校验基线哈希。调度器同时限制
Worker 数量、模型并发、Token 预算和工具并发，单个 Worker 失败不会直接取消已有证据，
但必须由 Supervisor 决定重试、降级或结束。

多 Agent 稳定版依赖 ContextPlanner、Artifact 引用、Run Snapshot 和 Agent Checkpoint，避免
进程重启后丢失 DAG、租约或已完成结果。

多 Agent 开始实现时，再引入上述任务级常驻 `SessionActor`/Driver。它负责同一任务内的长期
Inbox 和 Worker 协作，但耐久状态仍以 Core 的 Run、事件日志和 Checkpoint 为准；常驻对象只是
可重建的执行加速层，不能成为暂停、队列或任务完成状态的唯一来源。

### 8.5 Windows OS 权限隔离

应用层权限继续负责“用户是否允许”，操作系统隔离负责“即使代码出错也不能越界”。目标结构为：

```text
Electron / Java Core
  → Capability Broker
  → 受限 Agent / Browser / Plugin Worker
       ├── Restricted Token 或 AppContainer
       ├── Job Object 进程树与资源上限
       ├── 工作区 ACL / 显式 Capability 授权
       └── 受控网络、文件和子进程入口
```

Shell 子进程必须继承受限令牌并加入同一 Job Object，取消、超时或主进程退出时终止完整进程树。
工作区外路径、敏感目录、网络和凭据不能仅依靠字符串黑名单；应由 Broker 持有宿主权限并按单次
批准执行最小操作。硬拒绝、路径沙箱、分层规则、权限模式与 HITL 仍然保留，形成纵深防御。

该能力不引入 Rust。Python Agent 保留模型循环、`ToolRegistry` 和权限编排，实际文件与 Shell
副作用逐步迁移到独立 Python Tool Worker；Windows 后端通过 `pywin32` 创建 Restricted Token
进程并管理 Job Object/ACL。Java Core 继续负责任务归属、审批路由、持久化与审计。工具先生成
本次 `requiredPermissions`，Resolver 合并为 `PermissionProfile`，Reviewer 只能返回其中的授权
子集，Sandbox Backend 再把 `grantedPermissions` 落实到 Worker。

审批策略、审批者与沙箱模式必须分离：“替我审批”只切换自动 Reviewer，不能关闭工作区边界；
`allowExternalPaths` 一类全局布尔开关应替换为精确路径授权。若后端不能准确实现 deny、只读
carve-out 或网络限制，必须 fail closed。迁移期间的应用层路径检查只能称为逻辑防护，不能称为
操作系统沙箱。

AppContainer、Restricted Token 与文件 ACL 的兼容性需要先做 Windows 技术验证。验证期间不得
把应用层审批描述成系统沙箱，也不得让第三方插件获得与桌面主进程相同的权限。

### 8.6 实施顺序

```text
ContextPlanner 与自动压缩
  → 浏览器只读/交互工具
  → 只读多 Agent
  → Windows Worker 隔离与 Capability Broker
  → 官方插件
  → 可写多 Agent
  → 第三方插件生态
```

浏览器工具在现有权限体系内可以先交付；第三方插件和可写多 Agent 必须等待进程隔离、资源预算、
Checkpoint 和冲突控制完成。该顺序用于避免“功能可以运行”先于“功能可以安全恢复和审计”。

## 9. 仓库边界

本仓库包含完整桌面产品：

```text
desktop + core + agent + contracts
```

云端套餐后台和运营管理端属于独立部署单元，使用单独仓库维护。

## 10. 云端套餐与微服务演进

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
