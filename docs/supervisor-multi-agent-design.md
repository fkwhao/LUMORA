# Supervisor 多 Agent 设计

## 1. 目标与当前状态

LUMORA 的主 Agent 在运行时扮演 Supervisor，根据任务动态决定是否委派，不预设固定的
“搜索 Agent”或“代码 Agent”。当前已交付一次性与可续接两种独立上下文、完整工具能力的
协作 Agent Session，并支持在受控深度内递归委派。复杂长期任务还可以选择显式 DAG；所有路径
共享请求级预算、安全重试和多写者冲突规划，简单任务不承担 DAG 建模成本。

Phase 3C 已完成两项增量：第一，在不改变 Supervisor 唯一管理权的前提下，为同一根任务下的
continuable Agent 增加仅传递信息的 Team Message Plane；第二，把 Desktop 的 Agent 页签从
“扁平步骤 + 单个最终回答”升级为按 Activation 组织、复用主聊天阶段与工具展示语法的只读会话视图。
两项增量都不改变现有 Agent Loop、父子 Session 身份、独立上下文压缩或 Token 汇总边界。

```text
父 Run / Supervisor（唯一全局管理者）
  ├── delegate_task(description, prompt, mode, writeScopes?)
        └── Agent Session · Depth 1
              ├── 独立消息历史
              ├── 继承本请求可见工具与权限
              ├── 实时可见执行事件
              ├── one_shot：前台等待最终报告
              ├── continuable：FIFO Inbox → 单一 Activation → Checkpoint
              ├── send / list / interrupt / report
              ├── delegate_task(...)
              │     └── Agent Session · Depth 2/3
              └── 最终报告返回父 Agent
  ├── Team Message Plane（已实现）
        ├── Agent A -- send_peer_message --> Agent B
        ├── 只追加耐久消息，不创建、不唤醒、不追加任务
        └── 不能中止、关闭、改权限或读取目标 Transcript
  └── create_workflow(nodes[])
        └── ready nodes → 无写冲突的并行 wave → 依赖后继
```

运行时采用“扁平优先、递归保留”：Supervisor 默认直接创建职责清晰的同级 Agent；只有任务确实
需要进一步拆解时，子 Agent 才在深度上限内创建下级 Agent。管理关系始终是一棵树，而通信范围是
同一 `teamId` 上的受限网络，因此平级与跨层级 Agent 都能交换信息，但不能借通信获得管理权。

一次模型回合可以产生多个 `delegate_task`。它们是并发安全的控制面调用，因此复用现有有界
工具调度器并行执行；具有依赖关系的委派由当前 Agent 等待结果后在下一回合启动。

### 1.1 DeepSeek Harness 对照结论

本设计以 DeepSeek Harness 的 Subagent seam 作为参考，但不把尚未实现的生命周期写进当前能力：

- Subagent 是可选的模型工具，不是 Agent Loop 内置的复杂度分类器。工具可见时，专属 System
  Prompt 用定性规则引导模型判断是否委派；深度、并发和权限由 Runtime 硬限制。
- `one-shot` 是一次委派一次结果；`continuable` 则以耐久 Child Session 为身份，用 FIFO Inbox
  接收多轮消息，并在进程内创建至多一个可重建的 `Activation` 执行当前活跃期。
- `Activation` 是 Session 的临时驻留执行体，不是预创建的通用 Worker Pool；Provider 可以决定
  子 Agent 在进程内、其他 Harness 或外部进程中执行。
- Subagent 层继续表达父子 Session 树、并行 sibling 和深度上限；显式 DAG 作为其上的可选计划层，
  只在任务确有依赖、多个 wave、deadline、节点级重试或写入冲突规划时使用，不是兼容前提。

因此当前 LUMORA 同时对齐前台 one-shot 和后台 continuable 路径：`delegate_task` 的提示段只在
工具实际可见时注入，触发采用“收益高于协调成本”的定性判断。continuable 路径不创建常驻
Worker，而是保存稳定 Session 身份、FIFO Inbox 与 Checkpoint，仅在有工作时按需创建 Activation。

### 1.2 Codex 与 DeepSeek Harness 的平级通信结论

Codex Multi-agent 在层级 Agent 树上提供通用 `send_message` 与 `followup_task`：前者只向现有
Agent 投递消息，不启动新 Turn；后者才负责追加工作并启动或恢复目标。子 Agent 同样拥有协作动作，
消息以明确的 author/recipient 记录，因此通信关系不局限于直接父子。参考：
[OpenAI Multi-agent](https://developers.openai.com/api/docs/guides/responses-multi-agent)。

DeepSeek Harness 则把普通 direct-child Subagent 控制与实验性 Agent Team 明确拆开：Team 使用
扁平 Lead/Teammate roster、耐久 peer mailbox 和共享任务视图。其设计拒绝直接放宽父子控制工具，
因为父子管理权与 Team 成员通信权属于不同权限域。参考：
[DeepSeek Agent Teams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md)
和 [Agent Teams 决策记录](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-08-05-agent-teams.md)。

LUMORA 采用相同的权限分离原则：保留现有 Supervisor/父子树作为创建、任务追加、中止、关闭和权限
管理平面；另建只负责信息投递的 Team Message Plane。Team 消息不是隐式委派，也不能借消息工具改变
目标 Agent 的生命周期。

## 2. Session、身份与上下文边界

每次委派生成新的 `agentId` 和 `sessionId`。one-shot 子 Session 的消息历史只包含一条自包含任务；
continuable 子 Session 首次也不继承父会话正文，但之后会从 Core Checkpoint 恢复自身 Transcript，
并按 Inbox 顺序追加后续任务。其上下文达到阈值后会独立生成摘要、保留近期结构完整的 Transcript，
并立即写入 Checkpoint；恢复前也会先检查容量，避免把未经整理的长期 Transcript 直接发送给模型。
父 Agent 必须在首次委派中写清目标、范围、必要背景和预期输出。

身份字段和审批关联分离：

- `correlationId` 始终保留父 Run ID，用于人工审批、暂停/取消和统一审计。
- `sessionId` 标识独立模型 Session；递归委派时从父 Session 派生。
- `agentId` 标识当前执行者，`parentAgentId` 构成父子树。
- `teamId` 标识可通信范围，固定取根任务的稳定 `taskId`（本地无任务时退化为根 Run 身份），不替代
  `parentAgentId`。
- `delegationDepth` 从 Supervisor 的 0 开始递增。

这种分离避免子 Agent 请求写文件或 Shell 审批时，被审批接口误判为“不属于当前会话”。

### 2.1 Supervisor 管理面与 Team 通信面（已实现）

Supervisor 继续是唯一的全局管理者，负责创建顶层 Agent、跨分支追加或重新分配任务、启动/恢复
Activation、中止或关闭 Session、修改工具和权限边界、读取全量 Session 状态。递归委派中的直接
父级只保留现有的局部子 Session 控制，不能管理其他分支；平级 Agent 不获得任何管理能力。

Team 通信面只向同一 `teamId` 的 continuable Agent 暴露有限目录和消息投递：

- `list_team_agents` 只返回稳定 Agent 身份、公开标签和是否可接收消息，不返回 Transcript、摘要、
  权限、工具表或内部 Checkpoint；
- `send_peer_message(targetAgentId, content)` 只把带发送者身份的消息加入目标 Peer Inbox；
- 发送者不能给自己发消息，不能跨根任务、跨 Team 或向已关闭/one-shot Session 投递；
- Team 消息采用 quiet 语义：目标运行中或空闲时都保持待处理，在下一次由 Supervisor/直接父级启动
  的 Activation 消费；消息本身不能启动、冷恢复或中止目标；
- 消息正文和最小发送者身份进入目标上下文，发送者的完整 Transcript、摘要和工具结果不会复制；
- 消息只有在目标模型实际消费时才增加目标上下文和模型 Token，投递记录本身不进入 Supervisor 的
  活动模型上下文。

耐久投递复用 Core 已有的 Run Event Journal 与 Session Inbox 投影：`agent_peer_message_queued` 和
同身份的 `agent_inbox_enqueued` 把稳定 `messageId`、发送者、消息种类和目标 FIFO 顺序投影进
`agent_inbox_message`，随后记录 delivered；恢复请求从 Core Snapshot 还原 `messageKind=peer` 与
`senderLabel`，因此 quiet 消息不会在重启后退化成会主动调度的任务消息。目标实际读入上下文时记录
consumed，并由 `messageId` 在前端合并三个阶段；该实现提供 Inbox 主键去重，不声称跨服务 exactly-once。

当前限制为单目标最多 100 条待处理 Peer Message、单消息最多 20,000 字符、单次 Activation 最多
消费 32 条 Inbox 消息。Team 消息不
增加 `delegationDepth`，但目标处理消息产生的模型请求仍共享根 `ExecutionBudgetLedger`。消息只能
协调信息，不能作为文件锁、写权限或任务所有权凭证；实际写入仍由 `writeScopes`、WriteIntentClaim
和权限链路决定。

## 3. 工具与权限继承

子 Agent 继承的是父请求实际暴露给模型的工具表，而不是进程中所有已注册工具。该工具表会综合
工作区、`availableTools`、附件、Skill 和本次连接成功的 MCP 能力，因此子 Agent 可以按当前请求
权限使用完整的实际工具表，而不是被固定为“搜索”“写代码”或其他角色能力清单。例如当前工具表
可能包含：

- 文件搜索、读取、`apply_patch`、完整写入与 Shell；
- PDF、Artifact、计划与 Skill 工具；
- 本次请求已连接的 MCP Tools、Resources、Resource Templates 和 Prompts；
- 在深度上限内继续调用 `delegate_task`。

没有工作区的请求不会因创建子 Agent 而重新获得本地文件或 Shell 工具。MCP Session Lease 由父
Run 持有到所有子 Agent 完成后再释放，子 Agent 不另建不可审计的连接通道。

子 Agent 与父 Run 使用同一个 `PermissionPolicy`、`PermissionEngine`、`ApprovalBroker` 和权限
配置目录。写入、Shell、外部路径和网络工具按各自真实调用逐项评估；请求审批模式继续弹出人工
审批，替我审批模式继续走 Reviewer，完全访问模式仍保留危险命令硬拒绝与工作区外路径防护。

`delegate_task` 本身标记为只读、并发安全，因为它只建立 Session，不直接写文件或改变外部状态。
它不是对子 Agent 后续副作用的提前授权；真正产生副作用的工具仍会独立进入权限链路。

Team 工具与现有管理工具分开注册。`send_agent_message`、`interrupt_agent` 和
`delegate_task` 继续遵循 Supervisor/直接父级权限；不能为了支持 sibling 而放宽它们的
`_can_manage` 判断。`list_team_agents` 与 `send_peer_message` 随 Session 控制工具注册，Runtime 在
每次调用时校验发送者确实属于当前 `teamId`；one-shot 或跨 Team 调用者即使看见工具也不能投递。
二者只读外部世界，但消息投递具有耐久内部状态，不标记为并发安全重试；调用方通过稳定
`messageId` 去重，而不是在未知结果后自动重放。

## 4. 递归委派、预算与写入边界

默认最大委派深度为 3：Depth 1 和 Depth 2 的 Agent 可以继续委派，Depth 3 的工具表不再暴露
`delegate_task`；即使模型提交了越界调用，Runtime 仍会返回 `delegation_depth_exceeded`。

每个父 Run 建立一个由 Supervisor 与全部后代共享的 `ExecutionBudgetLedger`。默认限制为模型请求
256、工具尝试 1,024、墙钟时间 2 小时和活动子 Agent 10；调用方可通过
`promptContext.executionBudget` 按请求收紧。模型请求、上下文压缩、工具重试和递归委派都在真正
执行前原子预留对应预算，超限返回 `budget_exhausted`，后代不能通过新 Session 绕过根预算。
Token 用量继续汇总并上报，但不参与执行准入或终止判断；上下文容量仍由独立的自动压缩机制管理。

活动 Agent 使用非等待式配额：达到上限的新委派明确返回 `agent_concurrency_limit`，并标记为
`retryable=true`、`toolExecutionState=not_started`。这避免父 Agent 占据配额并等待后代时形成
递归死锁，也为 DAG 的安全重试提供可判定状态。

`writeScopes` 在 Agent 或 DAG 节点整个执行期建立进程内 `WriteIntentClaim`；未预声明的文件写工具
还会根据真实参数动态声明短期范围，然后进入同一个 `ResourceLockManager`。声明范围支持精确路径
和目录 `/**`，精确文件同时记录基线哈希。范围重叠时立即返回 `writer_conflict`、冲突写者和建议
动作，由 Supervisor 缩小范围、调整依赖或等待前序完成；不进行死等或盲目补丁合并。完整文件覆盖
继续校验“执行者最近读取版本”，兄弟 Agent 不再共享同一份观察身份。

模型流和只读工具的瞬态失败采用指数退避与 jitter；每次工具调用携带稳定 `effectId`/
`idempotencyKey`。只有只读工具且失败明确可重试时才自动重放；写工具出现异常后状态记为
`unknown`，不会自动重试。

父 Run 的暂停/取消信号向所有后代传播。子 Agent 不消费父 Run 的 Steer Inbox，防止任一子
Session 抢走本应由 Supervisor 处理的用户引导。

## 5. 事件、用量与持久化

公开事件包括：

| 事件 | 语义 |
| --- | --- |
| `agent_started` | 子 Session 已创建并开始执行 |
| `agent_event` | 当前 Agent 的一个可见进度、工具、搜索或上下文步骤 |
| `agent_completed` | Agent 已返回最终报告 |
| `agent_failed` | Agent 失败、取消或触发容量边界 |
| `agent_session_created` | 已建立可续接 Session 身份 |
| `agent_inbox_enqueued` | 父 Agent 已向 FIFO Inbox 追加消息 |
| `agent_activation_started` | Session 已按需启动一个 Activation |
| `agent_activation_interrupted` | 当前 Activation 已中止，Session 与 Checkpoint 保留 |
| `agent_reported` | 子 Agent 已向父 Agent 提交耐久报告 |
| `agent_checkpointed` | 已保存消费游标和公开 Transcript，不保存隐藏推理或调用栈 |

普通子工具事件包装为 `agent_event`，并带当前 Agent 身份和 `childSequence`。后代 Agent 的四类
生命周期事件不再包装成父 Agent 的普通步骤，而是保留自己的 `agentId`、`parentAgentId` 和
`delegationDepth` 直接向上转发，因此 Desktop 可以恢复真实树结构。隐藏推理不会投影到界面。

每个 Agent 的累计模型用量作为一次 `usageDelta` 合入父 Run；后代用量先进入父 Agent 的累计值，
再向上归并，避免根 Run 重复计费。完成事件同时记录输入、输出、总 Token、活动上下文和最终回答。

Core 将原始事件写入 `conversation_run_event`，并在同一事务中投影到 `agent_session`、
`agent_inbox_message`、`agent_activation` 和 `agent_checkpoint`。Core 是耐久状态的单一事实来源，
下一 Turn 将 Session 快照回灌给 Python；若进程退出时 Activation 仍为 running，会先纠正为
interrupted，再由 Supervisor 决定是否发送新消息重新激活。WorkLog 只保存有界状态字段，不复制
Checkpoint Transcript；Checkpoint 保存公开消息、工具调用/结果和 Inbox 游标，不保存 Python
调用栈或隐藏思维链。

可续接 Session 的创建、Inbox 与后台 Activation 事件必须进入同一 FIFO，再由根 Run 统一输出，
保证 `agent_session_created` 不会被首个 Checkpoint 超越。Core 投影同时保持重放幂等和乱序容错：
若旧 Runtime 或断线边界先送达 Checkpoint/Activation，Core 会从事件身份补建 Session；迟到的 Inbox
若已落在 `consumedInboxSequence` 内，直接投影为 consumed，不能让一个依赖事件永久阻塞 Run Journal。

Team Message Plane 已新增以下耐久事件：

| 事件 | 语义 |
| --- | --- |
| `agent_peer_message_queued` | Core Run Journal 已接受 Team 消息并投影目标 Inbox |
| `agent_peer_message_delivered` | 目标 Session 已耐久保存同一消息身份 |
| `agent_peer_message_consumed` | 消息已进入目标 Agent 的公开 Transcript |

事件元数据至少包含 `teamId`、`messageId`、`senderAgentId`、`targetAgentId` 和目标顺序号。目标 Inbox
保存完整正文；Run Journal/WorkLog 对三阶段事件只保留有界预览，避免同一内容在父 Run 消息中重复
放大。Desktop 可以从这些事件恢复“A → B”的通信轨迹，但 Supervisor 模型只有显式调用 Team 查询
工具或收到 Agent 报告时才看见对应内容。三类事件已加入 Python、Java、OpenAPI 和 Desktop 的共享
契约。

显式 DAG 通过 `create_workflow`、`list_workflows`、`run_workflow` 和 `retry_workflow_node` 操作。
节点包含依赖、优先级、deadline、安全重试策略、写入范围和 Evidence/Artifact 引用；调度器每个
wave 选择 ready 且写范围互不重叠的节点并行执行。每次工具结果都携带完整最新快照，Core 同时将
DAG、节点、checkpoint 和 Effect 投影到专用表。后续 Turn 优先从 Core 耐久快照恢复，公开工具消息
仅作兼容来源，因此已完成节点不会在正常跨 Turn 续接时重复执行。

## 6. Desktop 交互

Supervisor 主执行日志隐藏底层 `delegate_task` 行和 Agent 内部工具步骤，只显示直属 Agent 的
状态头像。Desktop 的右侧区域是统一的可调宽页签宿主，不为上下文、审阅或 Agent 分别创建互斥
侧栏。点击上下文入口、审阅入口或 Agent 头像时，分别打开或激活一个页签；已打开的页签继续保留，
多个 Agent 也各自拥有独立页签。页签可切换、单独关闭，关闭当前页签后选中相邻页签；拖拽收起右栏
只隐藏宿主，不清空已打开页签。

每个 Agent 页签展示：

- Session、父 Agent、委派深度、模型和状态；
- 输入、输出、总 Token 与活动上下文；
- 按 Activation 与 `childSequence` 排序的任务输入、阶段更新和可见执行轨迹；
- 当前 Agent 进一步委派的 Agent 头像与独立 Session；
- 每轮返回父 Agent 的 Markdown 报告和独立用量；
- continuable Session 的 Activation、待处理 Inbox、Checkpoint 序号与重启恢复状态。

点击后代头像会为该后代打开或激活自己的 Agent 页签，内容区保留返回父 Agent 页签的入口。这样
父子 Session 可以并排保留和快速切换，孙级 Agent 也不会伪装成 Supervisor 的直属调用。运行中的
Agent 页签实时更新，完成后仍可从历史 WorkLog 恢复。上下文、审阅和 Agent 页签共享同一套紧凑
页签栏、宽度记忆和拖拽行为，但各自保留独立的内容状态。

Desktop 对 continuable Session 只提供只读状态和报告展示，不提供“继续/中止”按钮。续接、追加
消息和中止 Activation 均由 Supervisor 通过模型工具判断并执行；用户仍可使用任务级全局停止。

### 6.1 Agent 页签向主聊天布局靠齐（已实现）

旧版 `SubagentSessionPane` 把全部 `agent_event` 放进一个扁平步骤列表，并只保留一个最新回答；这会
把 continuable Session 的多次 Activation 混在一起。当前前端投影已调整为：

```text
Agent Session
  ├── Activation 1
  │     ├── 父级派发的任务消息
  │     ├── 阶段更新 / 工具 / 搜索 / 压缩 / Agent 通信
  │     └── 本轮 Markdown 回答与用量
  ├── Activation 2
  │     ├── 后续任务消息
  │     ├── 本轮执行过程
  │     └── 本轮回答与用量
  └── 委派的下级 Agent
```

实现原则如下：

- 每个 continuable `agent_event`、报告和用量事件都携带稳定 `activationId`；one-shot 使用稳定
  Activation，使两种模式共享前端数据结构；
- `subagentSessionsFromMessages` 投影 `Session -> Activation[]`，每个 Activation 独立保存输入、
  WorkLog、回答、状态、起止时间和用量，不再用单一 `events[]/answer` 覆盖历史；
- Agent 页签直接复用主聊天 `AgentRunSummary` 的阶段分组和工具渲染，主聊天与 Agent 页签使用
  同一套阶段标题、工具卡、搜索、上下文压缩和嵌套 Agent 展示，不复制第二套判断逻辑；
- Agent 页签在窄侧栏内沿用主聊天的信息语法，而不是完整复制主线程外壳：任务消息、运行摘要和回答
  纵向排列，最新 Activation 自动展开，历史 Activation 默认折叠且可逐轮查看；
- 阶段更新和工具事件继续实时刷新，最终回答使用现有 Markdown、复制和耗时交互；子 Agent 正文
  `text_delta/text_reset` 的逐字流式转发作为后续增量，不阻塞本阶段布局与事件归组；
- Team 消息作为运行摘要中的一类通信步骤展示，明确标注发送者、目标和 queued/delivered/
  consumed 状态，不把消息误画成父子委派或管理动作；
- Desktop 仍不提供对子 Agent 的人工管理按钮，也不为平级 Agent 提供中止、唤醒、关闭或改权限入口。

该调整只改变事件投影和展示，不把子 Agent Transcript 合入主聊天消息。Agent 页签读取的是 Core
耐久事件与 Checkpoint 的只读投影，因此不会改变 Supervisor 活动上下文占用或 Token 统计。

## 7. 当前安全边界与限制

- 每个子 Session 最多向 WorkLog 投影 160 个当前 Agent 可见步骤；Core WorkLog 最多保留 400 项，
  原始 Run 事件日志仍是权威审计来源。
- 单个 Agent 失败不会抹除兄弟 Agent 的结果；父 Agent 从结构化工具结果决定降级、重试或结束。
- 子输出继续受 ToolResultProcessor、Artifact 外置和 Core 工作记录长度限制。
- 文件与 Shell 当前仍在主 Python 进程中以宿主用户权限执行。应用层权限、路径检查和危险命令
  硬拒绝不是 Windows OS 沙箱，不能抵御运行时自身被完全攻破。
- Checkpoint 恢复公开 Transcript、Inbox 游标、工具结果，以及维持后续 API 工具回合合法所必需的
  隐藏 Provider 协议状态（例如 Anthropic 原生 content blocks 与 thinking signature）；该状态只随
  对应 Agent Session 保存，并绑定原请求连接与模型，不向 UI 或摘要正文投影，也不跨 Agent 复制或
  混用。旧 Checkpoint 缺少该状态时只恢复已经有完整结果的工具交互，不自动重放可能有副作用的
  工具。Python 调用栈和执行到一半的工具仍不恢复；重启中的 Activation 会标记为 interrupted，
  由 Supervisor 重新激活。
- continuable 是耐久 Session 加按需 Activation，不是永远驻留的后台进程。当前没有空闲 TTL、
  自动关闭策略或跨设备远程调度。
- `report` 会耐久写回父任务，并可在当前或后续 Turn 由 `list` 读取；它不会在父模型已经结束回答后
  强行插入新的隐藏模型回合。
- `send_agent_message` 仍只允许 Supervisor 或直接父级访问目标 continuable Session；同 Team Agent
  通过 `send_peer_message` 进行 quiet 通信，二者权限与调度语义不能混用。
- 主 Agent 与子 Agent 继承同一请求的 `reasoningEffort`，但各自维护独立模型历史。当前各 Provider
  对推理强度的字段映射仍不完整，后续修正必须对每个 Session 一致生效，不能通过共享隐藏推理来
  规避协议差异；完整欠账见[公开架构说明](architecture.md)。
- 写入意图由进程内快速索引与 OS 文件锁保护的跨进程租约共同约束；TTL 清理崩溃持有者，FIFO
  ticket 避免持续插队，每次节点派发使用独立 writer 身份和 fencing token，工具在实际写入前
  必须校验并续期当前 token，迟到 worker 会被拒绝。Core 同时保存租约审计，但不把数据库投影
  当作实时互斥锁。
- DAG 在 wave 派发前把 running/prepared 状态作为同一 RunEvent 事务原子写入 Core；工具 Effect 的
  started/committed/unknown 状态随后进入提交记录。重启时，无已观察 Effect 的节点可安全重排，
  已开始但未确认的副作用会进入 `workflow_recovery_requires_verification`，不会声称实现无法证明的
  外部系统 exactly-once。

## 8. 后续路线图

### Phase 2：可续接 Session 与控制面（已完成）

- 已增加显式的前台 one-shot 与后台 continuable 两种路由；后台启动在 Inbox 接受首条消息后返回
  稳定 `agentId/sessionId`，完成通过独立 settlement notice 通知父 Agent。
- 已增加 `send`、`list`、`interrupt`、`report`，允许 Supervisor 追问、追加上下文、中止或接收
  子 Agent 主动报告；同一 Session 的消息进入 FIFO Inbox。
- Core 已增加 AgentSession、AgentCheckpoint、父子关系和未读状态查询，不再只依赖父 Run 嵌套
  投影；子 Session 的可恢复上下文由最新摘要和近期 Transcript 共同组成，原始 Run 事件日志继续
  作为审计来源。
- 每个 continuable Session 同时最多一个 Activation。Activation 可空闲卸载和冷恢复，不能成为
  状态唯一来源；父 Session 结束前应先处理仍存活的后代 Activation。
- Desktop 增加 Session 树、未读/Inbox、Activation、Checkpoint 和跨 Turn 恢复状态；不增加人工
  继续/中止入口，控制权保留给 Supervisor。
- Core 已作为 Session Inbox、Checkpoint 和 Activation 状态的单一事实来源；不预创建通用
  Worker Pool，容量按需分配给活跃 Session。continuable Session 已在 Activation 前和工具循环中
  自动压缩长期 Transcript，并把摘要、近期 Transcript 和压缩用量耐久化；空闲 TTL 和更细预算
  进入后续增量。

### Phase 3A：显式 DAG、预算与多写者冲突规划（已完成）

- DAG 是 LUMORA 面向复杂长期任务的可选计划层，不替代普通模型驱动委派；简单父子协作继续只
  使用 Session 树，避免为每次委派引入节点建模成本。
- 已把依赖、优先级、deadline、重试策略、写入范围和 Evidence/Artifact 引用建模为显式 DAG；
  独立 ready 节点按 wave 并行，重叠写范围自动错峰。
- 已增加根 Run 共享的模型请求、工具尝试、墙钟时间和活动 Agent 预算，预算耗尽结构化失败并
  保留已完成结果；Token 用量只做统计，不作为终止条件。
- 已增加稳定 Effect ID、失败分类和只读瞬态安全重试；未知副作用不自动重放。
- 已在资源锁之上增加路径级写入意图、基线哈希、冲突写者诊断和重规划提示。
- 已通过公开工具消息跨 Turn 恢复 DAG 最新快照，运行中节点只在状态可安全判定时自动重试。

### Phase 3B：耐久 DAG 与高级协作（已完成）

- 已增加专用 Core DAG、节点、checkpoint、Effect Commit 与租约审计表；checkpoint 与公开运行事件
  在一个事务提交，Core 快照优先于聊天工具消息恢复。
- 已增加跨进程 TTL 租约、FIFO ticket、fencing token 和基于历史 dispatch count 的公平 DAG 调度。
- 已增加跨回合累计的 wave、节点尝试和运行时长配额，耗尽后保留结果并将工作流置为 paused。
- 已增加基于最近读取基线的保守三方文本合并；独立修改自动合并，重叠修改返回结构化冲突片段和
  人工处理动作。

### Phase 3C：Team 通信与 Activation 会话视图（已完成）

- 保留 Supervisor/直接父级对创建、任务追加、唤醒、中止、关闭和权限的独占管理，不放宽现有
  `delegate_task`、`send_agent_message` 与 `interrupt_agent` 的管理判断。
- 以根任务身份建立 `teamId` 和有限公开 roster，新增 `list_team_agents` 与 quiet-only
  `send_peer_message`；只允许同 Team 的 continuable Agent 交换信息。
- 在 Core Run Event Journal 和目标 Session Inbox 建立 queued/delivered/consumed 三阶段耐久 mailbox，
  使用稳定消息身份、目标 FIFO 顺序和 Inbox 主键去重完成进程恢复；Team 消息不自行启动或冷恢复目标。
- 增加消息大小、单目标待处理数量和单 Activation 消费数量限制；消息不授予管理权、写权限、任务
  所有权或文件锁，目标消费产生的模型请求继续计入根执行预算。
- 为全部子 Agent 可见事件补齐 `activationId`，把 Desktop 投影升级为 `Session -> Activation[]`；
  one-shot 使用合成 Activation，continuable 保留每轮输入、过程、回答和用量。
- 在 Agent 页签复用主聊天阶段/工具展示组件，覆盖阶段更新、工具、搜索、压缩、嵌套
  Agent 和 Peer Message 样式；最新 Activation 展开、历史 Activation 可折叠回看。
- 本阶段保留完成后提交 Markdown 回答；子 Agent 正文逐字流式转发在事件归组稳定后单独增量实现。

### Phase 4：Windows 受限 Worker 与 Capability Broker

- 这里的 Worker 指承载文件、Shell、网络和凭据副作用的受限 OS 执行进程，不等同于子 Agent
  Session 或 Activation；两者通过 Capability Broker 解耦。
- 将文件、Shell、网络和凭据副作用逐步迁移到 Restricted Token/AppContainer Worker。
- Shell 子进程进入 Job Object，取消、超时或父进程退出时终止完整进程树。
- 应用层 PermissionPolicy 负责“是否允许”，OS 隔离负责“即使代码出错也不能越界”。
- 精确 Capability 授权替代全局外部路径开关，无法落实 deny 时 fail closed。

### Phase 5：远程 Provider 与生态

- 抽象本机与远程 Subagent Provider，保持相同 Session、Event、Approval 和 Checkpoint 契约。
- 官方插件先复用 Capability Broker；第三方生态必须在签名、撤销、租户隔离和审计完成后开放。
- 只有出现真实多实例或跨节点调度需求后才引入外部队列与 Outbox，本机单实例不依赖消息中间件。
