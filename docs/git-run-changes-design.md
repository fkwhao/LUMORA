# Run 级 Git 变更、撤回与 Worktree 路线

> 实施状态：Phase A 至 Phase E 的首版主链均已完成。A/B 提供 Local Run Diff 与最新一轮
> 撤回，C/D/E 提供并发任务隔离、显式结果处理和安全清理恢复。

## 1. 目标与边界

Phase A/B 给每个会修改 Git 工作区的 `ConversationRun` 建立可审阅、可验证的文件变更边界，
并支持安全撤回该 Run 的文件和会话消息。Phase C/D/E 处理并行任务隔离、结果应用、冲突和
临时 Worktree 生命周期。

系统不自动提交或推送用户代码，也不执行 rebase/cherry-pick。只有用户明确点击“应用到
Local”时才会在内部构造临时 commit 执行 tree 级三方合并；写回过程不修改用户真实 Git index。
非 Git 工作区继续正常执行，只是不提供 Git Diff、自动撤回和并发 Worktree 隔离。

## 2. 所属架构

```text
ConversationRunCoordinator
  ├── Run 获得执行槽位 → GitRunChangeService.begin
  ├── Run 暂停          → 保留同一 before 基线
  └── Run 到达终态      → GitRunChangeService.captureTerminal
                              ├── 临时 GIT_INDEX_FILE
                              ├── refs/lumora/runs/<runId>/before|after
                              └── conversation_run_change_set

Desktop Changes
  → Preload 白名单 IPC
  → Electron Main REST Gateway
  → Java Run Changes API
```

Java Core 是 Run、ChangeSet、撤回条件和消息归属的最终权威。Python Agent 和子 Agent
不感知 Git 快照；它们继续在 Java 授权的同一工作区内使用现有文件与 Shell 工具。

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

Phase A/B 的权威 ChangeSet 粒度仍是“单个 Run”，用于回答摘要、最新一轮撤回和 Local 审阅。
Phase D 另外从 Worktree 的 `baseTree..resultTree` 生成完整任务 ChangeSet；当任务处于待审阅、
冲突、延迟清理或已转正式分支状态时，右侧面板优先展示该累计结果。旧消息和单次文件工具仍
只有既有工具事件的有界局部预览；“每次文件工具的独立 Git Checkpoint”尚未实现。

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
| `COLLIDED` | 同仓库出现并发 Run；相关 Run 的追踪均已失效 |
| `CAPTURED` | 已捕获 after，可展示最终 Diff |
| `REVERTED` | 文件和该 Run 的活动消息已经撤回 |
| `UNAVAILABLE` | 非 Git、快照失败、并发碰撞结束或其他不可追踪情况 |

Run 租约现在按“物理工作区”而不是共享仓库根目录判定碰撞。正常调度会在第二个同仓库任务
启动前先分配 Worktree，因此 Local 与各 Worktree 的 Run 可以分别追踪；只有异常情况下两个
Run 落到同一个物理目录时才标为 `COLLIDED` 并禁用自动撤回。

## 6. API 与界面

```text
GET  /api/v1/tasks/{taskId}/runs/{runId}/changes
POST /api/v1/tasks/{taskId}/runs/{runId}/revert
GET  /api/v1/tasks/{taskId}/worktree
GET  /api/v1/tasks/{taskId}/worktree/changes
POST /api/v1/tasks/{taskId}/worktree/apply
POST /api/v1/tasks/{taskId}/worktree/branch
POST /api/v1/tasks/{taskId}/worktree/discard
```

查询接口在 `TRACKING` 时返回实时 `before..current` Diff，在终态返回 `before..after` Diff。
每个文件最多返回 500,000 个 patch 字符，每个 Run 最多投影 500 个文件；超出部分只影响界面
预览，不改变快照和撤回校验。

## 7. Phase C：任务级 Worktree（已实现）

目标是在同一 Git 仓库出现并行写入任务时自动隔离，同时保持单任务路径没有额外开销。

- 同一仓库只有一个活动写入任务时继续使用 Local 主工作区，不创建 Worktree。
- 第二个及后续并行写入任务自动创建临时 Worktree；一个任务对应一个 Worktree，而不是一个
  Run、子 Agent 或 DAG 节点对应一个 Worktree。
- Worktree 使用 detached HEAD，不自动创建正式分支。该任务的 Supervisor、子 Agent、可续接
  Session 和 DAG 节点共享同一个 `effectiveWorkspacePath`。
- Java Core 持有 Worktree 分配与租约的最终权威，并至少保存：
  `workspaceMode`、`sourceWorkspacePath`、`effectiveWorkspacePath`、`baseCommit`、`baseTree`、
  `worktreeState`、租约时间和关联任务。
- Agent Runtime 继续使用现有 `workspacePath` 协议；Core 在启动 Run 时传入
  `effectiveWorkspacePath`，Python 不自行创建或选择 Worktree。
- Worktree 的基线必须包含任务启动时 Local 的完整可见状态。Core 先从原始 `baseCommit` 创建
  detached Worktree，再把 Phase A 捕获的 `baseTree` 物化到隔离目录；若 Local 存在未提交或
  已暂存修改，这些内容也会出现在隔离工作区，但不会改写 Local 的真实 index。
- 内部可以为 Git 三方合并和 detached Worktree 临时构造由 Lumora 私有 ref 持有的 commit，
  但该 commit 不能成为用户正式分支历史的一部分。没有初始 commit 的 unborn 仓库会从完整
  `baseTree` 创建内部合成基线，因此第二个任务仍可并行隔离；Local 的 `HEAD`、分支和真实 index
  始终保持 unborn 状态。
- unborn 仓库的 Worktree 结果应用到 Local 后仍不创建提交；选择“创建正式分支”时，Core 会把
  隔离目录转换为真正的 orphan/unborn 分支并清空其真实 index，所有可见文件继续作为未提交修改
  保留，内部合成基线不会泄漏到用户历史。
- Worktree 中的每个 Run 继续复用 Phase A/B 的 Checkpoint、Diff 和撤回机制。

持久化状态包含 `PROVISIONING`、`ACTIVE`、`WAITING_REVIEW`、`APPLYING`、`CONFLICTED`、
`CLEANUP_PENDING`、`BRANCHED`、`RELEASED`、`REMOVED` 和 `FAILED`。

完成标准：

- 两个并行任务的文件修改互不可见。
- 子 Agent 不会额外创建 Worktree，并始终继承所属任务的有效工作区。
- 单任务仍直接在 Local 执行；并行任务继续获得准确的 Run Diff 和最新一轮撤回。
- Worktree 建立失败时任务不会悄悄退回同一 Local 并发写入，而是排队或明确失败。

## 8. Phase D：结果应用与冲突处理（已实现）

目标是把临时 Worktree 的结果安全带回 Local，且不静默覆盖 Local 在任务期间产生的新修改。

- Worktree 任务完成后生成完整任务 ChangeSet，并进入 `WAITING_REVIEW`，不会自动写回 Local。
- 完整任务 ChangeSet 由 `baseTree..resultTree` 生成，和最后一轮 Run Diff 分开保存与读取；
  Changes 面板在 Worktree 审阅期间展示累计文件、增删行、补丁和冲突标记。
- 用户选择“应用到 Local”后，Core 等待 Local 活动写入进入安全状态，再使用共同 Base、当前
  Local 和 Worktree 结果执行三方合并。
- 用户明确触发应用后，无冲突修改可以自动落入 Local；任务完成本身不得触发静默应用。
- 冲突文件在 Changes 面板中明确标记，同时保留完整 Worktree、Base tree、Local 当前状态和
  Git 冲突详情；首版不生成可编辑的三栏冲突解决器，也绝不直接覆盖。
- 提供三个明确操作：“应用到 Local”“创建正式分支”“放弃修改”。
- “创建正式分支”从原始 `baseCommit` 创建用户分支，并把现有 Worktree 附着到该分支；任务结果
  继续作为未提交修改保留。unborn 仓库使用真正的 orphan 分支，不继承内部合成基线。第一版不
  自动 commit、push 或 rebase，也不把内部合并 commit 暴露到用户历史。
- 应用成功前保留原 Worktree、内部基线 ref 和结果 ChangeSet；失败或冲突必须可重试或改选
  “创建正式分支”，不能只留下部分写入的 Local。
- 实现时应通过预检、临时 index/临时 tree 和最终校验控制写入边界，避免污染用户真实 index。

完成标准：

- Worktree 结果可以完整应用到 Local。
- Local 后续修改不会被静默覆盖，真实 index 不被意外改写。
- 冲突时原 Worktree、Base 和任务修改仍然保留并可审阅。
- 未完成的部分应用不会被描述为成功。

按文件或 hunk 接受、拒绝和继续修改属于细粒度审阅增强，可以建立在 Phase D 的三方结果模型
之上，但不替代本阶段的完整结果应用与冲突安全性。

## 9. Phase E：清理与崩溃恢复（已实现）

目标是让正常任务不遗留临时目录，同时保证崩溃、冲突或待审阅状态不会丢失 Agent 修改。

- 无修改任务结束、结果成功应用或用户明确放弃后，立即执行受控的 `git worktree remove`，
  随后执行 `git worktree prune` 并验证元数据与物理目录一致。
- 有冲突、等待审阅、暂停中或应用失败的 Worktree 继续保留，不得按超时静默删除。
- 应用启动时同时核对持久化租约和托管目录中的 Git Worktree：
  - 干净且无活动任务：自动清理；
  - 有未处理修改：恢复任务关联并提示用户；
  - 清理暂时失败：标记 `CLEANUP_PENDING`，由定时清理任务继续重试。
- 清理操作必须幂等。数据库记录存在但目录丢失、目录存在但记录丢失、Git 元数据残留等情况
  都要进入可审计的修复流程。
- 首版最多保留 5 个未完成临时 Worktree。达到上限时排队或拒绝新的隔离任务，绝不能为了腾出
  空间自动删除带有未处理修改的 Worktree。
- Worktree 结果 ref 以及 unborn 仓库的内部基线 ref 在应用、放弃或无修改清理成功后删除。
  Phase A/B 的历史 Run refs 仍需承担旧回答 Diff，因此首版继续保留；为历史 Run refs 增加独立
  保留期属于后续存储治理，不与临时 Worktree 的即时清理混为一谈。

完成标准：

- 正常完成、应用或放弃的任务不会留下临时目录。
- 应用崩溃不会丢失 Agent 修改，重启后能够恢复待审阅关系。
- Git Worktree 元数据、物理目录和数据库租约最终保持一致。
- 自动清理只处理已验证安全的干净 Worktree。

## 10. 第一版明确不做

- 每个子 Agent 一个 Worktree。
- 撤回任意历史轮次。
- Shell 单工具级撤回。
- 自动 stash 用户修改。
- Codex 式 Handoff 和完整执行快照恢复。
- 自动 commit、push、rebase 或自动解决 Git 冲突。
- 非 Git 项目的虚拟 Worktree。

推荐实施顺序：

```text
Phase A：Git Checkpoint
→ Phase B：Run Diff 与最新一轮回退
→ Phase C：并行任务 Worktree
→ Phase D：结果应用与冲突处理
→ Phase E：自动清理与崩溃恢复
```

Phase A/B 不创建项目副本或 Worktree 目录；只有同仓库出现第二个并发任务时才分配托管目录。
无修改、成功应用或明确放弃后会立即清理，失败则进入 `CLEANUP_PENDING` 定时重试；待审阅、
冲突、暂停和已转正式分支的目录会保留。不要手工删除仍需 Diff、撤回或恢复的
`refs/lumora/**`。
