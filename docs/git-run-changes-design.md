# Run 级 Git 变更、撤回与 Workspace 路线

> 实施状态：Local Run Diff、最新一轮撤回、共享 Local 协作、用户显式 Worktree、统一 Git
> 审阅与清理恢复均已完成。实际交付边界和验收项见
> [Git Workspace 一次性交付记录](git-workspace-execution-plan.md)。

## 1. 目标与边界

Phase A/B 给每个会修改 Git 工作区的 `ConversationRun` 建立可审阅、可验证的文件变更边界，
并支持安全撤回该 Run 的文件和会话消息。后续阶段在此基础上增加共享 Local 的并发协调、
用户显式 Worktree、结果应用和临时目录生命周期。

普通多会话的默认语义是共享同一个 Local 物理工作区。系统不会因为出现第二个任务、并发数量、
改动规模或风险等级而自动切换到 Worktree。只有用户通过标题栏的 Workspace 控件显式创建或
选择 Worktree，任务才在隔离目录中执行；Agent、子 Agent、工具和 Supervisor 都无权自主改变
Workspace 模式。

系统不自动提交或推送用户代码，也不执行 rebase/cherry-pick。只有用户明确点击“应用到
Local”，或事先为该 Worktree 显式开启“无冲突时自动应用”时，才会在内部构造临时 commit 执行
tree 级三方合并；写回过程不修改用户真实 Git index。
非 Git 工作区继续正常执行，并复用 Local 写入锁、文件版本检查和逐工具变更归属；只是不提供
依赖 Git 对象数据库的提交、分支比较、Git Run Diff、Git 撤回和 Worktree。

## 2. 所属架构

```text
ConversationRunCoordinator
  ├── 解析用户已选择的 Workspace → Local | explicit Worktree
  ├── Run 获得执行槽位           → GitRunChangeService.begin
  ├── Run 暂停                   → 保留同一 before 基线
  └── Run 到达终态               → GitRunChangeService.captureTerminal
                              ├── 临时 GIT_INDEX_FILE
                              ├── refs/lumora/runs/<runId>/before|after
                              └── conversation_run_change_set

WorkspaceMutationCoordinator（Local）
  ├── Workspace 读写域 + 精确文件读写域
  ├── fileVersion/contentHash + workspaceRevision
  ├── 每次成功修改 → 逐工具文件归属
  └── Runtime 安全边界通知 + Core 耐久投影

Desktop Changes
  → Preload 白名单 IPC
  → Electron Main REST Gateway
  → Java Run Changes API
```

Java Core 是 Workspace 选择、Run、ChangeSet、撤回条件、revision 和消息归属的最终权威。
Python Agent 和子 Agent 不感知 Git 快照，也不能创建、选择、切换或删除 Worktree；它们只在
Java 为当前任务下发的固定 `effectiveWorkspacePath` 内使用文件与 Shell 工具。

## 3. Phase A：Git 基线与真实 Diff

- [x] Run 真正获得执行槽位时只建立一次 `before` 基线。
- [x] 暂停和继续沿用同一个 `runId` 与 `before`，不会把续接误拆为新变更集。
- [x] 完成、失败或取消时捕获 `after`；暂停不是终态，不捕获 `after`。
- [x] 使用临时 index 生成 Git tree，不执行 `git add` 到用户的真实 index。
- [x] 同时保存 Run 前后的 `HEAD` 和真实 index tree，用于判断 Git 元数据是否被修改。
- [x] 通过 `before..after` 生成新增、修改、删除、重命名、复制、二进制标记、行数统计和
  有界 unified patch。
- [x] Desktop 在每轮回答底部展示文件数、增删行统计和默认 3 个文件的可折叠摘要；点击审核或
  单个文件会打开右侧 Changes 的真实 Run Diff。旧消息仍可回退到工具事件中的局部预览。

快照过程先读取真实 index 的 tree，再在临时 `GIT_INDEX_FILE` 中执行 `read-tree` 和
`add -A`。因此初始未提交修改、已暂存文件、已跟踪文件和未忽略的未跟踪文件都会进入
Run 基线；未跟踪且被 Git ignore 的文件不进入快照。临时 tree 通过
`refs/lumora/runs/<runId>/before|after` 保持可达，避免普通 Git GC 提前删除历史 Diff 所需对象。

## 4. Phase B：安全撤回

- [x] `conversation_message.run_id` 记录用户消息、Assistant 消息、Steer 和用量记录所属 Run。
- [x] 只允许撤回已结束、仍为最新可见回答且状态为 `CAPTURED` 的 Run。
- [x] 撤回前重新捕获当前工作区，并要求当前 tree、`HEAD` 和真实 index 与 `after` 完全一致。
- [x] 如果 Run 内修改过 `HEAD` 或真实 index，自动撤回永久禁用，但 Diff 仍可查看。
- [x] 同一仓库仍有其他活动 Run 时拒绝撤回，避免和正在发生的写入竞争。
- [x] 如果 Run 结束后又有文件变化，拒绝自动撤回，避免覆盖后续修改。
- [x] 先恢复文件并验证 tree 等于 `before`，成功后再把该 Run 的活动消息移出当前会话路径。
- [x] Desktop 在回答摘要卡和右侧 Changes 都提供整轮撤销入口，并展示二次确认、处理进度、
  失败原因和已撤回状态。

Run Checkpoint 继续用于 Git 基线校验，逐工具文件归属用于共享 Local 的回答摘要、审阅和安全
撤回。Worktree 另外从 `baseTree..resultTree` 生成完整任务 ChangeSet；处于待审阅、冲突、延迟
清理或已转正式分支状态时，右侧面板优先展示该累计结果。每个工具不再创建独立 Git Checkpoint，
而是记录前后 hash、Git blob（仅非 ignored 内容）、有界 patch 和 Core revision，避免把其他 Run
的修改误算进当前回答。

撤回不是 `git reset --hard`。Core 用临时 index 从 `before` tree 恢复原有文件，显式删除
本轮新增或重命名后的路径，并保留用户的真实 index。对已经被重新占用的删除路径会直接拒绝，
不会覆盖未知文件。

文件系统与 SQLite 无法组成同一个原子事务，因此顺序固定为“完整预检 → 文件恢复与校验 →
消息状态事务”。若消息事务在文件已恢复后发生罕见失败，接口返回失败并保留审计记录，不会把
文件再次改回 `after`。

## 5. 状态与持久化

`conversation_run_change_set` 以 `run_id` 为主键，保存仓库根目录、前后 tree、前后
`HEAD`、前后真实 index tree、原因和时间。状态含义如下：

| 状态 | 含义 |
| --- | --- |
| `TRACKING` | 已捕获 before，Run 尚未到达终态 |
| `COLLIDED` | 旧版本或异常绕过 Workspace 协调器，导致同一物理目录的追踪无法归属 |
| `CAPTURED` | 已捕获 after，可展示最终 Diff |
| `REVERTED` | 文件和该 Run 的活动消息已经撤回 |
| `UNAVAILABLE` | 非 Git、快照失败、异常归属失败或其他不可追踪情况 |

新设计允许多个 Local Run 合法共享同一物理工作区，因此不能再把“同目录存在并发 Run”直接
视为 `COLLIDED`。每次修改必须在对应的 Workspace/文件资源域内产生逐工具归属，Run 的最终
ChangeSet 再按这些归属记录和 Run Checkpoint 聚合。只有旧调用绕过协调器、revision 链断裂或
无法可靠判断变更归属时才进入 `COLLIDED` 并禁用自动撤回。

## 6. API 与界面

```text
GET  /api/v1/tasks/{taskId}/runs/{runId}/changes
POST /api/v1/tasks/{taskId}/runs/{runId}/revert
GET  /api/v1/tasks/{taskId}/changes?scope=...
GET  /api/v1/tasks/{taskId}/worktree
GET  /api/v1/tasks/{taskId}/worktree/changes
POST /api/v1/tasks/{taskId}/worktree/apply
POST /api/v1/tasks/{taskId}/worktree/branch
POST /api/v1/tasks/{taskId}/worktree/discard
```

Run 查询接口在 `TRACKING` 时返回实时 `before..current` Diff，在终态返回 `before..after` Diff。
统一 Changes 查询按 scope 支持本轮、全部未提交、未暂存、已暂存、指定提交和分支比较；所有
scope 复用同一个文件 Diff DTO 和有界补丁规则，而不是在 Renderer 中拼 Git 命令。
每个文件最多返回 500,000 个 patch 字符，每个 Run 最多投影 500 个文件；超出部分只影响界面
预览，不改变快照和撤回校验。

## 7. Phase C：共享 Local 并发协议（已实现）

目标是在不复制项目、不要求用户处理任务间 Git 合并的前提下，让多个普通会话安全共享 Local。
Worktree 不再是并发调度器的自动分支；Local 才是默认并发路径。

- 同一物理 Local 维护单调递增的 `workspaceRevision`。每次成功产生文件副作用的工具调用只增加
  一次 revision，并记录 `beforeRevision` 与 `afterRevision`。
- Local 使用 Workspace 与文件两级读写域：精确文件工具取得 Workspace READ 与目标文件 WRITE，
  因而不同文件可短暂并行；前台 Shell 和无法证明副作用边界的工具取得 Workspace WRITE，作为
  全工作区屏障。
- 文件读取记录规范路径、文件系统版本和内容 hash。覆盖或补丁发布前必须验证预期版本；陈旧时
  返回可恢复的 `STALE_FILE_VERSION`，要求 Agent 基于最新内容重新读取并重新生成修改，不能覆盖。
- `workspaceRevision` 变化本身不直接拒绝一个目标文件仍未变化的局部补丁；它用于事件排序、上下文
  失效提示和 ChangeSet 归属。文件版本/hash 才是目标文件写入的最终比较条件。
- 每个成功修改工具形成逐工具文件归属，至少保存 task/run/toolCall、revision、文件路径、
  操作类型、前后 hash、增删行与有界 patch。Shell 在全局锁内以执行前后 Workspace 快照生成
  ChangeSet，不能只相信命令声明。
- Python Runtime 在同进程共享 ledger 中发布变更。其他活动任务在下一个安全步骤边界收到紧凑的
  revision 和变更路径通知；Core 同时从耐久 Run 事件投影权威 revision 与逐文件归属。事件不会把
  整份 Diff 强行插入正在进行的模型请求。
- 收到事件后，命中已观察文件的 Session 必须使其观察版本失效并重新读取；未命中的任务可以继续。
- Run 级 `before..after` Checkpoint 继续负责基线校验，逐工具文件归属负责回答摘要、
  审阅与诊断。两者互相校验，而不是建立第二套聊天状态机。

完成标准：

- 多个 Local 会话可以同时推理和读取，但所有写入拥有唯一的 revision 顺序。
- 一个任务下一次读取能看到其他任务已经安全发布的修改。
- 陈旧写入被拒绝并可重试，不出现静默覆盖。
- 每次文件副作用都能归属到唯一工具调用和 Run。

## 8. Phase D：用户显式 Worktree 与结果处理（已实现）

Worktree 只是一种由用户选择的隔离 Workspace，不是系统根据并发数量或风险自动作出的决定。

- 标题栏提供独立的 Workspace 控件，默认值为 `Local`；用户可以显式创建或选择 Worktree。
- Workspace 选择一旦用于启动 Run，该 Run 的 Supervisor、子 Agent、可续接 Session、DAG 节点
  和工具都共享同一个固定 `effectiveWorkspacePath`。任何 Agent 侧能力都不能中途切换。
- Worktree 可继续使用 detached HEAD、完整 `baseTree` 物化和 unborn 仓库合成基线等现有底座；
  这些内部对象不得污染用户分支、`HEAD` 或真实 index。
- 标题栏另设独立 Branch 控件。Workspace 与 Branch 是两个概念：前者选择物理目录，后者显示或
  切换该目录的 Git 分支。Local 存在活动写入时禁止切换分支；切换不能由 Agent 发起。
- Shell 对直接 Git mutation、Git 元数据路径、常见包装器与脚本入口执行 fail-closed，并在命令
  结束后复核 Git 控制状态；这属于宿主权限下的应用层产品边界，不等同于操作系统沙箱。恶意
  构建脚本的不可绕过隔离仍由总体架构中的 Capability Broker 负责。
- Worktree 任务完成后生成 `baseTree..resultTree` 完整任务 ChangeSet，并进入待审阅状态。默认由
  用户选择“应用到 Local”“创建正式分支”或“放弃修改”。
- 用户采用的既有 linked Worktree 被视为非托管正式环境，保持 `BRANCHED` 并通过 Handoff 返回
  Local；Lumora 不对它执行自动应用、放弃删除或自动清理。
- 用户可以为某个 Worktree 显式开启“无冲突时自动应用”。该开关不是全局风险推断；只有 Local
  进入安全状态、三方结果无冲突且最终校验通过时才执行，任一条件失败都回到待审阅。
- 冲突时不写 Local，继续保留 Worktree、Base、Local 当前 tree 和冲突详情。第一版不自动解释或
  解决语义冲突，也不静默选择某一侧。
- “创建正式分支”保留任务修改为未提交状态；第一版仍不自动 commit、push 或 rebase。

持久化状态继续包含 `PROVISIONING`、`ACTIVE`、`WAITING_REVIEW`、`APPLYING`、`CONFLICTED`、
`CLEANUP_PENDING`、`BRANCHED`、`RELEASED`、`REMOVED` 和 `FAILED`，并新增明确的用户选择来源与
`autoApplyWhenClean`。不得再通过“第二任务”或“高风险任务”隐式进入 `PROVISIONING`。

## 9. Phase E：统一 Changes 审阅与清理恢复（已实现）

任务右侧 Changes 面板复用同一个 Diff 组件和查询模型，支持以下范围：

| 范围 | 比较基线 |
| --- | --- |
| 本轮 | 当前 Run 的 `before..current/after` |
| 全部未提交 | `HEAD` 对当前工作树和 index 的综合结果 |
| 未暂存 | index 对工作树 |
| 已暂存 | `HEAD` 对 index |
| 提交 | 指定 commit 对其父提交，或明确选择的两个 commit |
| 分支比较 | 明确选择的 base branch 与 target branch |

回答末尾的文件变更摘要卡继续默认打开“本轮”，汇总和每个文件都固定展示 `+新增 / -删除` 两项统计，数值为零时也显示，避免不同文件行的统计口径和对齐发生变化；右栏的范围切换不改变任务 Workspace，也不触发
Git 写操作。Worktree 待审阅时额外显示应用、建分支、放弃和显式自动应用开关。该阶段不修改
聊天输入框；Workspace 与 Branch 入口只位于任务标题栏。

Worktree 清理沿用安全规则：无修改、成功应用或用户放弃后清理；冲突、待审阅、暂停和应用失败
继续保留；启动时恢复遗留关联，清理失败进入 `CLEANUP_PENDING`。只能自动删除已验证干净且无
活动租约的目录，绝不能为数量上限删除未处理修改。

## 10. 明确不做

- 第二个任务自动创建 Worktree。
- 根据 Agent 判断、文件数量、命令风险或模型建议自动切换 Workspace。
- 允许 Agent、子 Agent 或工具创建、选择、切换、应用或删除 Worktree。
- 每个子 Agent 一个 Worktree。
- 把完整 Workspace Diff 实时注入正在执行的模型请求。
- 撤回任意历史轮次。
- 自动 stash、commit、push、rebase 或自动解决 Git 冲突。
- 非 Git 项目的虚拟 Worktree。
- 为本次架构调整改造聊天输入框。

统一交付顺序：

```text
共享 Local 协议与数据迁移
→ Workspace/文件两级锁、文件版本与逐工具归属
→ workspaceRevision 与安全边界变化通知
→ 显式 Workspace / Branch 标题栏控件
→ 统一 Changes 查询与右栏
→ 显式 Worktree 应用策略、清理恢复与全链路验证
```

具体任务、迁移和验收矩阵见
[Git Workspace 一次性交付记录](git-workspace-execution-plan.md)。不要手工删除仍需 Diff、撤回或
恢复的 `refs/lumora/**` 与托管 Worktree。
