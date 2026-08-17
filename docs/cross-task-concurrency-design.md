# 任务并发与资源感知设计

## 1. 范围

本阶段实现不同任务之间的 Run 并发、同一模型步骤内的安全工具并发，以及这些调用访问同一工作区时的资源冲突保护。同一任务仍只有一个活动 Run，后续问题继续由现有耐久问题队列串行推进；多 Agent 编排不在本阶段范围内。

## 2. DeepSeek Harness 对照

DeepSeek Harness 的并发边界由三层组成：

1. 每个 Session 拥有独立 Agent Driver；一个 Session 同时只运行一个 Driver，不同 Session 可以并发，取消其中一个不会影响其他 Session。
2. `followup` 只负责进入 Session Inbox。当前活动达到 quiescence 后，Driver 再领取下一条输入；保留 Inbox 的取消不会提前并发启动同一 Session 的替代 Turn。
3. 文件系统对写操作按目标路径串行，并通过读取版本和原子条件写入拒绝陈旧修改。文件读取可以并发；单步骤工具并行采用显式安全声明和独占屏障。

LUMORA 采用相同边界，同时保留 Core 的全局有界 Run 池，并在 Agent Loop 中加入单步骤工具滚动并发池。

参考实现：

- [DeepSeek Harness ReactLoopAgent](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/agent.ts)
- [DeepSeek Harness 单步骤工具并发设计](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.md)
- [DeepSeek Harness 多 Session 隔离测试](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/acp/acp/tests/multi-session.spec.ts)
- [DeepSeek Harness 文件观察策略](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/fs/fs-observation-policy/src/index.ts)
- [DeepSeek Harness 本地文件原子写与目标锁](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/fs/fs-local/src/index.ts)

## 3. Run 调度

`ConversationRunCoordinator` 继续作为唯一调度入口：

- `lumora.runs.max-concurrent` 默认是 `3`，可通过 `LUMORA_MAX_CONCURRENT_RUNS` 覆盖。
- 全局队列按 FIFO 领取 Run，执行集合达到上限后，其他 Run 保持 `QUEUED`。
- `ConversationRunStore.findActiveForTask(taskId)` 保证同一任务最多一个活动 Run。因此跨任务可以并发，同任务的问题队列、Steer、暂停和继续仍然串行。
- Run 的 SSE、事件序列、暂停控制和完成回调都以 `run_id` 或 Runtime Turn ID 隔离。
- 一个 Run 暂停、完成、失败或取消并达到安全收敛后才释放槽位；释放后调度下一个 Run。

SQLite 仍然只有一个写入者。Core 的 Hikari 池固定为单连接，让不同 Run 的消息、事件和
状态事务在连接获取处短暂排队；模型推理、工具调用和 SSE 推送不持有数据库连接，因此仍可
并发。每个连接同时启用 10 秒 `busy_timeout`，吸收进程外的瞬时文件锁。WAL 负责持久日志
模式，单连接池负责进程内写入仲裁，两者共同避免把正常写竞争暴露成 `SQLITE_BUSY`。

Desktop 切换任务只断开当前页面的 SSE，不取消 Core 中的 Run。每个已打开任务会缓存消息、
活动 Run、最后消费的事件序列、运行开始时间、工作步骤和审批状态。重新打开同一个仍在运行的
Run 时，界面先原样恢复缓存快照，以 Core 返回的 `startedAt`（排队阶段回退到 `createdAt`）
作为计时基准，并由本地时钟持续刷新可见秒数，再从本地最后消费序列之后补放缺失事件；后端只
校准时间基准，不承担界面的逐秒刷新，因此不会把切换时间误当成 Run 开始时间，
也不会先清空步骤再重建。如果 Core 表明该 Run 已暂停、失败或完成，则放弃运行中快照并以
持久化消息为准。

## 4. 资源访问模型

Python `ToolRegistry` 持有进程级 `ResourceLockManager`。请求级 Registry 副本和 MCP 动态 Registry 选择视图复用同一管理器，避免锁只在一个 HTTP 请求内生效。

资源采用写优先的异步读写锁。一个工具可以声明多个 `ResourceAccess(key, mode)`；获取顺序稳定，写模式覆盖同 key 的读模式。当前内置工具声明如下：

| 工具 | 工作区资源 | 文件资源 |
|---|---|---|
| `list_files` | READ | — |
| `read_file` / `search_in_file` | READ | READ |
| `apply_patch` / `write_file` | READ | WRITE |
| `shell_command` | WRITE | — |
| `shell_process status` | READ | — |
| `shell_process stop` | WRITE | — |

由此得到以下行为：

- 同一文件的多个读取可以并发。
- 不同文件的修改可以并发。
- 同一文件的写入互斥，读写不会交叉。
- Shell 无法可靠静态判断具体文件，因此在执行期间占用工作区写锁，作为所有内置文件操作的保守屏障。
- 未声明资源且标记为非并发安全的旧工具继续使用稳定 key 的独占锁，默认失败关闭。

锁等待时间、是否真实发生竞争、发生竞争的资源 key，以及实际资源声明都会写入
Tool Result metadata（`resourceWaitMs`、`resourceContended`、
`resourceContendedKeys`、`resourceAccess`），便于后续诊断资源竞争；metadata 不进入
模型上下文。竞争状态由锁在原子获取点记录，不依赖毫秒阈值推测，因此即使等待时间因取整
显示为 `0ms`，也不会漏掉实际冲突。

## 5. 单任务工具调用并发

一个模型步骤返回多个兄弟工具调用时，Agent Loop 按模型顺序逐项分类：

- 只有参数校验通过且 `is_concurrency_safe(input) is True` 的调用进入并发组；缺少声明、参数无效或分类异常均按独占处理。
- 连续安全调用使用有界滚动池，`max-parallel-tool-calls` 默认是 `10`；槽位一释放即可启动下一项，而不是等待整批完成。
- 非安全调用是独占屏障。屏障前的安全调用全部收敛后才执行它，屏障后的调用随后重新分类。
- 参数校验、权限判断、智能/人工审批和 `tool_started` 仍按模型顺序推进；只有工具主体重叠执行。
- 完成结果可能乱序到达，但 `tool_completed` / `tool_failed`、模型协议 Tool Message、Artifact 外置预算和后续上下文均按模型原始顺序提交。
- 暂停后立即停止补充新调用，已经启动的调用安全收敛，尚未启动的调用写入 `ABORTED_BEFORE_DISPATCH` 占位结果。
- 同步文件与 Skill 工具主体通过工作线程执行，避免阻塞 Agent 事件循环；原生异步工具继续直接 await。

这与跨任务资源层是两个独立维度：调度器决定哪些兄弟调用可以重叠，资源锁继续验证实际工作区/文件冲突。当前内置并发安全工具均为只读能力；写文件、Shell 和计划更新保持独占。

## 6. 陈旧写入保护

仅有互斥锁不能阻止“任务 A 读取旧内容、任务 B 修改、任务 A 稍后完整覆盖”的逻辑丢失更新。因此 `read_file` 和 `search_in_file` 会按 `task_id + canonical file key` 保存读取版本。`write_file` 覆盖已有文件前必须满足：

1. 当前任务已经观察过该文件；
2. 文件的设备、inode、大小和纳秒级修改/变更时间仍与观察版本一致；
3. 读取期间版本没有变化。

不满足时拒绝覆盖并要求重新读取。成功写入后更新该任务的观察版本。新文件仍可直接创建；若其他任务抢先创建，后来的盲写会被拒绝。

`apply_patch` 在文件写锁内读取当前内容，并以唯一 `oldText` 作为比较条件；目标文本消失或变得不唯一时拒绝修改。最终写入使用同目录的唯一临时文件，完整写入并 `fsync` 后才发布，避免暴露半写文件，也避免另一个 Runtime 或崩溃遗留文件与固定临时文件名碰撞。覆盖已有文件会保留原权限位，并在最终替换前再次核对读取版本；新文件通过同目录硬链接原子执行 create-if-absent，若其他任务或进程已经抢先创建则拒绝覆盖。

文件资源 key 以解析后的规范路径生成。因此同一 Runtime 内，经由现有符号链接访问同一目标
文件会进入相同的锁域；不存在的新文件也会先解析其现有父目录，避免目录符号链接产生两个
逻辑身份。Shell 仍以工作区写锁覆盖重命名、符号链接调整和目录级修改。

## 7. 取消、暂停和队列

资源等待可取消。Run 在等待锁期间收到暂停或取消后，不会在稍后获得锁时继续执行工具。已经开始的工具仍遵循现有安全收敛协议。

暂停只作用于当前 Run。原问题队列保持耐久状态，Run 完成暂停封存后释放执行槽位，其他任务可以继续；恢复操作重新进入全局 Run 队列。当前任务的下一轮问题不会与暂停 Turn 同时运行。

## 8. 已知限制

- 资源锁只协调同一个 Python Agent Runtime 进程；未来若部署多个 Runtime 进程，需要把资源协调提升为跨进程锁或由单一工作区 Worker 承载。
- 新文件发布具备跨进程 create-if-absent 语义；已有文件的最终版本复核与替换在普通文件系统 API 下并不是一个跨进程原子 CAS。若多个 Runtime 会同时写同一工作区，仍需跨进程租约或单工作区 Worker 才能完全关闭这段极短竞争窗口。
- `shell_command background=true` 返回后，后台进程可能继续修改工作区，无法长期持有本次工具调用的工作区锁。完整覆盖仍会由版本检查发现多数外部修改；后台进程的长期资源租约需要独立设计。
- 文件观察记录当前只保存在进程内。Runtime 重启后，覆盖已有文件必须重新读取，这属于安全失败。
- 并发分类是单调用声明，不比较兄弟调用参数；依赖“两个目标不同才安全”的写操作必须继续声明为独占，由资源层提供第二道保护。

## 9. 验证要求

- Core：不同任务在上限内同时 RUNNING，超过上限保持 QUEUED；释放槽位后 FIFO 启动下一项。
- Agent：Registry 副本共享资源锁；读/读重叠；同资源写入互斥；竞争元数据精确记录；符号链接别名落入同一文件锁；不同任务的陈旧完整写被拒绝，重新读取后可成功；新文件抢先创建与最终发布前的外部修改均被拒绝且不遗留临时文件。
- Agent Loop：安全兄弟调用重叠、独占屏障生效、滚动池不超过配置上限、乱序完成按模型顺序提交、暂停不补充新调用。
- 既有回归：问题队列、Steer、暂停/继续、Agent Loop、Desktop Store 和协议测试全部通过。
