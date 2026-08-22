# Run 级 Git 变更与撤回设计

> 实施状态：Phase A、Phase B 已完成；Git worktree 隔离属于后续 Phase C。

## 1. 目标与边界

本阶段给每个会修改 Git 工作区的 `ConversationRun` 建立可审阅、可验证的文件变更边界，
并支持安全撤回该 Run 的文件和会话消息。它解决的是“这一轮改了什么”和“这一轮能否撤回”，
不是并行工作区隔离。

当前不创建分支、不提交用户代码、不修改真实 Git index，也不执行 merge、rebase 或
cherry-pick。非 Git 工作区继续正常执行，只是不提供 Git Diff 和自动撤回。

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

同一仓库在没有 worktree 时不能可靠区分两个并发写入者。第二个 Run 到达时，Core 会把
同仓库仍持有追踪租约的所有 Run 标为 `COLLIDED`，这些 Run 继续正常执行，但都不允许自动撤回。
这比把第二个 Run 的修改错误归到第一个 Run 更安全。

## 6. API 与界面

```text
GET  /api/v1/tasks/{taskId}/runs/{runId}/changes
POST /api/v1/tasks/{taskId}/runs/{runId}/revert
```

查询接口在 `TRACKING` 时返回实时 `before..current` Diff，在终态返回 `before..after` Diff。
每个文件最多返回 500,000 个 patch 字符，每个 Run 最多投影 500 个文件；超出部分只影响界面
预览，不改变快照和撤回校验。

## 7. 后续阶段

### Phase C：按需 worktree 隔离

- 单任务或同仓库只有一个活动 Run 时继续直接使用主工作区，不创建 worktree。
- 第二个会并发写入同一仓库的 Run 才创建临时 worktree，并把该 Run 的实际 `workspacePath`
  切到隔离目录。
- 记录 worktree 租约、基线 commit、运行状态和清理状态；应用重启后可恢复或回收孤儿目录。
- Run 完成后先用本阶段的 Git tree 生成 Diff，再由明确的应用/合并流程把变更带回主工作区。
- 合并成功、取消且无需保留、或超过保留期后自动执行 `git worktree remove` 和 `git worktree prune`；
  有未应用变更或冲突时不得静默删除。

### Phase D：细粒度审阅

- 按文件或 hunk 接受、拒绝与继续修改。
- worktree 变更的冲突预览和显式合并。
- Run refs 与历史 ChangeSet 的可配置保留期、空间统计和安全清理。

Phase A/B 不创建项目副本或 worktree 目录，因此不会产生 worktree 目录的空间占用；当前新增
空间主要是 Git 对象和两个 Run refs，内容相同的 blob 会复用。历史 refs 的有界清理由 Phase D
统一实现，在此之前不应手工删除仍需 Diff 或撤回的 `refs/lumora/runs/**`。
