# Supervisor 多 Agent 设计

## 1. 目标与当前状态

LUMORA 的主 Agent 在运行时扮演 Supervisor，根据任务动态决定是否委派，不预设固定的
“搜索 Agent”或“代码 Agent”。当前已经交付第一阶段：一次性、独立上下文、完整工具能力的
协作 Agent Session，并支持在受控深度内递归委派。

```text
父 Run / Supervisor
  └── delegate_task(description, prompt)
        └── Agent Session · Depth 1
              ├── 独立消息历史
              ├── 继承本请求可见工具与权限
              ├── 实时可见执行事件
              ├── delegate_task(...)
              │     └── Agent Session · Depth 2/3
              └── 最终报告返回父 Agent
```

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
- Subagent 层表达父子 Session 树、并行 sibling 和深度上限，没有把任务依赖建模为显式 DAG。
  依赖顺序与兄弟写入冲突仍由模型协调；显式 DAG 是 LUMORA 的后续增强，不是兼容前提。

因此当前 LUMORA 对齐 DeepSeek Harness 的前台 one-shot 路径：`delegate_task` 的提示段只在工具
实际可见时注入，触发采用“收益高于协调成本”的定性判断；多个独立委派同轮并发，结果全部返回
后 Supervisor 再继续。后台 continuable 路径必须等 Session 控制面和耐久状态完成后再暴露。

## 2. Session、身份与上下文边界

每次委派生成新的 `agentId` 和 `sessionId`。子 Session 的消息历史只包含一条自包含任务，不继承
父会话正文或父 Agent 的工具轨迹；父 Agent 必须在委派提示中写清目标、范围、必要背景和预期输出。

身份字段和审批关联分离：

- `correlationId` 始终保留父 Run ID，用于人工审批、暂停/取消和统一审计。
- `sessionId` 标识独立模型 Session；递归委派时从父 Session 派生。
- `agentId` 标识当前执行者，`parentAgentId` 构成父子树。
- `delegationDepth` 从 Supervisor 的 0 开始递增。

这种分离避免子 Agent 请求写文件或 Shell 审批时，被审批接口误判为“不属于当前会话”。

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

## 4. 递归委派与容量边界

默认最大委派深度为 3：Depth 1 和 Depth 2 的 Agent 可以继续委派，Depth 3 的工具表不再暴露
`delegate_task`；即使模型提交了越界调用，Runtime 仍会返回 `delegation_depth_exceeded`。

每个父 Run 还有一个共享的活动子 Agent 上限，默认沿用 `max_parallel_tool_calls`（当前为 10）。
Runtime 使用非等待式配额：达到上限的新委派明确返回 `agent_concurrency_limit`，避免父 Agent
占据配额并等待后代时形成递归死锁，也避免指数级创建 Session。

不同 Agent 的工具继续进入同一个 `ResourceLockManager`：文件读可共享，写入独占，Shell 形成
工作区写屏障，完整覆盖会校验最近读取版本。当前机制可以支持受控写入，但还不是显式的多写者
任务租约或补丁合并协议。

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

普通子工具事件包装为 `agent_event`，并带当前 Agent 身份和 `childSequence`。后代 Agent 的四类
生命周期事件不再包装成父 Agent 的普通步骤，而是保留自己的 `agentId`、`parentAgentId` 和
`delegationDepth` 直接向上转发，因此 Desktop 可以恢复真实树结构。隐藏推理不会投影到界面。

每个 Agent 的累计模型用量作为一次 `usageDelta` 合入父 Run；后代用量先进入父 Agent 的累计值，
再向上归并，避免根 Run 重复计费。完成事件同时记录输入、输出、总 Token、活动上下文和最终回答。

Core 将原始事件写入 `conversation_run_event`，并把有界投影保存到 Assistant 消息 WorkLog。
当前“独立 Session”指独立模型上下文和稳定 Session 身份；轨迹仍嵌套在父 Run 事件日志中，尚无
独立 AgentSession 数据表或可冷恢复 Checkpoint。

## 6. Desktop 交互

Supervisor 主执行日志隐藏底层 `delegate_task` 行和 Agent 内部工具步骤，只显示直属 Agent 的
状态头像。Desktop 的右侧区域是统一的可调宽页签宿主，不为上下文、审阅或 Agent 分别创建互斥
侧栏。点击上下文入口、审阅入口或 Agent 头像时，分别打开或激活一个页签；已打开的页签继续保留，
多个 Agent 也各自拥有独立页签。页签可切换、单独关闭，关闭当前页签后选中相邻页签；拖拽收起右栏
只隐藏宿主，不清空已打开页签。

每个 Agent 页签展示：

- Session、父 Agent、委派深度、模型和状态；
- 输入、输出、总 Token 与活动上下文；
- 按 `childSequence` 排序的可见执行轨迹；
- 当前 Agent 进一步委派的 Agent 头像与独立 Session；
- 返回父 Agent 的最终报告。

点击后代头像会为该后代打开或激活自己的 Agent 页签，内容区保留返回父 Agent 页签的入口。这样
父子 Session 可以并排保留和快速切换，孙级 Agent 也不会伪装成 Supervisor 的直属调用。运行中的
Agent 页签实时更新，完成后仍可从历史 WorkLog 恢复。上下文、审阅和 Agent 页签共享同一套紧凑
页签栏、宽度记忆和拖拽行为，但各自保留独立的内容状态。

## 7. 当前安全边界与限制

- 每个子 Session 最多向 WorkLog 投影 160 个当前 Agent 可见步骤；Core WorkLog 最多保留 400 项，
  原始 Run 事件日志仍是权威审计来源。
- 单个 Agent 失败不会抹除兄弟 Agent 的结果；父 Agent 从结构化工具结果决定降级、重试或结束。
- 子输出继续受 ToolResultProcessor、Artifact 外置和 Core 工作记录长度限制。
- 文件与 Shell 当前仍在主 Python 进程中以宿主用户权限执行。应用层权限、路径检查和危险命令
  硬拒绝不是 Windows OS 沙箱，不能抵御运行时自身被完全攻破。
- Session 目前一次性运行，不能跨 Turn 主动追问、独立暂停后恢复，也不能在进程重启后从 Agent
  级 Checkpoint 继续。
- 当前没有后台 continuable 模式、Session Inbox 或 Activation；`delegate_task` 返回前父 Agent
  会等待，因此提示词不得要求父 Agent 在子 Agent 驻留期间继续新的模型回合。
- 现有资源锁解决执行期互斥和陈旧覆盖，不表达长期任务所有权、补丁合并或业务级冲突决策。

## 8. 后续路线图

### Phase 2：可续接 Session 与控制面

- 增加显式的前台 one-shot 与后台 continuable 两种路由；后台启动在 Inbox 接受首条消息后返回
  稳定 `agentId/sessionId`，完成通过独立 settlement notice 通知父 Agent。
- 增加 `send`、`list`、`interrupt`、`report`，允许 Supervisor 追问、追加上下文、中止或接收
  子 Agent 主动报告；同一 Session 的消息进入 FIFO Inbox。
- Core 增加 AgentSession、AgentCheckpoint、父子关系和未读状态查询，不再只依赖父 Run 嵌套
  投影；子 Session 的完整 Transcript 是详情输出的事实来源。
- 每个 continuable Session 同时最多一个 Activation。Activation 可空闲卸载和冷恢复，不能成为
  状态唯一来源；父 Session 结束前应先处理仍存活的后代 Activation。
- Desktop 增加 Session 树、未读状态、手动中止和跨 Turn 恢复入口。
- 明确 Session Inbox、空闲 TTL、内存预算、最大活跃 Activation 数和 Core 耐久状态的单一事实
  来源。这里不预创建通用 Worker Pool，容量按需分配给活跃 Session。

### Phase 3：显式 DAG、预算与高级多写者协作

- DAG 是 LUMORA 面向复杂长期任务的可选计划层，不替代普通模型驱动委派；简单父子协作继续只
  使用 Session 树，避免为每次委派引入节点建模成本。
- 把依赖、优先级、deadline、重试策略和 Evidence/Artifact 引用建模为显式 DAG。
- 增加 Run、Agent、模型请求和工具四层并发与 Token 预算，支持公平调度和局部降级。
- 在现有资源锁之上增加路径级写入租约、基线哈希、补丁合并和冲突重规划。
- Checkpoint 在进程重启后恢复未完成节点，不重新执行已经确认的副作用或证据。

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
