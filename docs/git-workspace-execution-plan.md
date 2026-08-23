# Git Workspace 一次性交付记录

> 状态：共享 Local、用户显式 Worktree、Git 标题栏和统一 Changes 已完成实现；本文记录本次
> 一次性交付的真实边界与验收方式，不再把工作拆成可单独上线的阶段。

## 1. 最终产品规则

- 新任务默认使用 `LOCAL`，同一项目开启第二个任务不会自动创建 Worktree。
- 只有用户在新任务环境选择器或任务标题栏明确选择时，才创建或采用 Worktree。
- Agent、子 Agent、Supervisor、DAG 节点和工具只能继承 `effectiveWorkspacePath`，无权决定或
  切换 Workspace。
- Workspace 与 Branch 是两个独立控件，均位于标题栏或新任务的项目上下文区；聊天输入框结构
  保持不变。
- Worktree 的“无冲突时自动应用”默认关闭，只能由用户主动开启。
- 本次不实现语义冲突 Resolver、自动 commit/push/rebase、任意历史轮次撤回、风险驱动的
  Worktree 自动选择或非 Git 虚拟 Worktree。

## 2. 最终调用流程

```text
普通任务
  → task workspace = LOCAL
  → 多个 Run 可并发推理与读取
  → 精确文件工具：workspace READ + target file WRITE
  → Shell/无法证明副作用边界的工具：workspace WRITE
  → 文件版本/hash 或 workspace revision 过期
      ├── stale：拒绝旧写入，要求 Agent 重读并重新生成
      └── current：原子发布文件
  → Python 记录本进程 revision 与变更路径
  → Core 按 toolCallId 持久化文件归属并推进 authoritative revision
  → 其他活动 Run 在下一模型步骤前收到紧凑变更通知

显式 Worktree 任务
  → 用户选择 NEW_WORKTREE 或 EXISTING_WORKTREE
  → 整个 Run/Agent 树固定使用该 effectiveWorkspacePath
  → 终态捕获 baseTree..resultTree
  → Lumora 临时 Worktree：默认 WAITING_REVIEW
  → 用户选择应用到 Local / 创建分支 / 放弃
      └── 仅显式开启时尝试无冲突自动应用
  → 用户已有 Worktree：保持正式分支与物理目录，用户可 Handoff 回 Local
```

## 3. 已交付：数据与权威状态

- V33 数据迁移为 `task_worktree` 增加自动应用设置与乐观 revision。
- `workspace_revision` 按物理 Workspace 保存 Core 权威 revision；Local 与 linked Worktree
  使用不同 revision 域。
- `workspace_run_attribution` 保存 Run 的 revision 区间、完整性和禁用撤回原因。
- `workspace_change_event` 以文件行为单位保存 task/run/toolCall/agent、路径、操作、前后 hash、
  有界 patch、增删行和 Core revision。
- 工具事件先投影到上述 ledger，再把大 patch 从耐久 Run SSE 事件中移除，只保留路径摘要，避免
  聊天事件表重复保存大对象。
- 超过文件/目录捕获上限、ignored 副作用或无法证明完整性的工具会把 Run 标为 incomplete；界面
  仍展示可确认的部分，但自动撤回必须 fail closed。

## 4. 已交付：共享 Local 协作协议

- `ResourceLockManager`、`ResourceObservationStore` 与 `WriteIntentManager` 在顶层 Run、子 Agent
  和 Registry 视图之间共享。
- 精确文件读写只锁 Workspace 读域和目标文件；不同文件可以短暂并行，同一文件仍串行并做
  version/hash 校验。Shell 和未知副作用工具使用 Workspace 写域，阻挡同时发生的文件操作。
- `write_file` 覆盖前验证观察版本，`apply_patch` 在锁内重读并验证唯一旧文本，最终写入使用原子
  发布；陈旧结果返回结构化 stale 错误，不盲目重放。
- 前台 Shell 获得 Workspace 写域后再次核对 foreign revision；等待期间有其他 Run 发布修改时，
  命令不会执行。无法跟踪租约生命周期的后台 Shell 在共享 Workspace 中直接拒绝。
- Shell 的产品控制面只允许 Git 只读查询子命令；分支、Worktree、index、commit、merge、rebase、
  reset 等状态写入必须走用户可见的 Core/UI 能力。执行前同时拒绝直接 Git 元数据路径、常见
  命令包装器和脚本入口，执行后复核 HEAD、index、refs、Worktree 拓扑及仓库本地配置。
- 上述 Shell 限制是宿主权限下的应用层防护，不冒充操作系统沙箱。明确的构建包装器仍会执行
  项目代码；若需要抵御恶意构建脚本或任意二进制主动绕过，必须由 Windows Capability Broker、
  Restricted Token 与文件 ACL 提供操作系统级隔离，这属于仓库既有安全架构而非 Git Workspace
  状态机的一部分。
- 未声明资源的扩展工具按副作用属性降级：明确只读取得 Workspace READ，其他情况取得
  Workspace WRITE，并通过前后快照核对真实副作用。
- Git Workspace 的 Shell 捕获 Git tree 及有界 ignored 物理状态；非 Git Workspace 使用有界文件
  inventory。捕获不完整时不会伪装成完整 ChangeSet。
- ignored 文件内容不会写入用户 Git object database；只记录必要的路径/hash 并禁用自动撤回，
  避免 `.env` 等本地秘密被持久化进仓库对象。

## 5. 已交付：变化感知与 Run 归属

- Python Runtime 维护进程内 `WorkspaceChangeLedger`。成功副作用发布后，同一 Runtime 中其他
  活动 Run 在下一次模型请求前收到最多 20 条路径摘要，不会中断正在生成的模型请求，也不会注入
  完整 Diff。
- Shell 若在等待 Workspace 写锁期间发现 foreign revision，返回 `stale_workspace_version`；文件
  工具继续以目标文件 version/hash 作为最终写入条件。
- Core 从 `TOOL_COMPLETED`/`TOOL_FAILED` 事件投影持久化归属。失败但已经产生副作用的工具仍记账，
  并以“部分副作用需审阅”结束，不能伪装为零修改失败。
- Run Diff 优先按本 Run 的逐工具文件事件聚合，不再用共享 Local 的全局 before..after 直接冒领
  其他任务修改。
- 对 A→B→A 修改同一路径的交错情况，A 的预览只累计 A 自己的片段；该路径因存在 foreign
  dependency 不允许直接整轮撤回。
- 当前跨任务即时通知是单 Python Runtime 进程内能力；Core ledger 提供重启后的审计、Diff 与
  撤回依据，但没有新增独立的“仓库级 Renderer SSE”接口。Changes 在当前任务事件到达、重新打开
  或切换 scope 时读取最新权威状态。

## 6. 已交付：标题栏 Git / Workspace 控件

- 新任务的项目上下文条提供 `Local / 新 Worktree / 可用 Worktree` 选择，默认 Local；该控件在
  Composer 外部。
- 任务标题栏提供 Workspace Handoff、Worktree 管理和显式自动应用开关。
- 独立 Branch 控件支持读取本地/远程分支、切换分支、创建并检出新分支和最近提交图。
- Branch 与 Workspace mutation 都携带 expected HEAD/revision；Run 入队、Run 绑定、终态捕获、
  Handoff、撤回和 Git mutation 共用短时 `GitWorkspaceMutationGate`，关闭“查到空闲后另一个 Run
  又进入”的 TOCTOU 窗口。
- 活动、排队、暂停或待审批 Run 仍绑定该物理 Workspace 时，分支切换和 Handoff 由 Core 拒绝；
  Renderer 的 disabled 状态只负责交互提示，不作为安全边界。
- Renderer 只调用白名单 Preload IPC；任意 Git CLI、任意路径删除和 Shell 拼接都没有暴露给前端。

## 7. 已交付：统一 Changes

统一查询支持六种只读 scope：

| Scope | 比较内容 |
| --- | --- |
| `LAST_RUN` | 本 Run 归属的变更或隔离 Run 快照 |
| `UNCOMMITTED` | `HEAD` 对 index + 工作树 |
| `UNSTAGED` | index 对工作树 |
| `STAGED` | `HEAD` 对 index |
| `COMMIT` | 指定 commit 对父提交或指定 base |
| `BRANCH_COMPARE` | 明确 base ref 与 head ref |

- 六种 scope 返回统一的文件状态、增删行、重命名、二进制标记与有界 patch DTO。
- 回答末尾摘要仍默认关联本轮 Run；右栏可以独立切换 scope，不切换真实分支或 index。
- 文件按条目展开，每个文件只渲染变更 hunk；长路径、横向代码与纵向滚动由同一父滚动容器管理。
- mutation 成功后刷新标题栏 Workspace 状态和当前选中的审阅 scope，避免撤回/应用后保留旧统计。

## 8. 已交付：显式 Worktree 生命周期

- 新 Worktree 使用 detached HEAD 和完整 base tree；unborn 仓库在 Local 安全空闲时使用合成基线，
  不再因为“尚无首个提交”直接取消第二个会话的并发能力。
- Worktree 完成后捕获累计结果；无修改立即清理，有修改默认等待用户审阅。
- 应用使用共同 Base 对最新 Local 做三方预检；冲突不写 Local。结果写回前再次核对 revision、活动
  Run、Local untracked/ignored 物理文件碰撞，绝不以 `--force` 覆盖未进入 Git tree 的用户文件。
- 用户创建正式分支后保留 Worktree 和未提交修改，不自动 commit/push。
- Lumora 创建的临时 Worktree 在应用成功或用户放弃后清理；冲突、暂停、待审阅、ignored 副作用
  和清理失败继续保留。
- 采用用户已有的 linked Worktree 会记录为非托管 `BRANCHED` 环境，不进入临时 Worktree 的
  apply/discard/auto-apply/cleanup 状态机；用户通过 Handoff 回到 Local，物理目录、正式分支与其中
  修改始终保留。
- 启动扫描只删除经过验证的干净、无租约、由 Lumora 管理的临时 Worktree；其余进入恢复或
  `CLEANUP_PENDING`，失败可幂等重试。

## 9. 撤回与失败语义

- 只支持最新可见、已安全捕获且归属完整的 Run。
- 撤回在 shared mutation gate 内重新检查活动租约、文件 hash、后续 foreign changes、HEAD 与真实
  index；检查到任何歧义都拒绝覆盖。
- 文件恢复成功后推进物理 Workspace revision，再更新 Run/消息为 `REVERTED`；不会先删除消息。
- ignored、超上限、未知副作用、同路径交错依赖或后续任务已继续修改时，撤回入口明确禁用或返回
  冲突，不会显示“成功但文件未恢复”。
- Run 的终态文件捕获先于终态 SSE 完成；SSE 单订阅发布失败不会把已经持久化的事件重新入队，
  避免 UI 收到重复终态/工具事件。

## 10. 验收清单

- [x] 普通并发任务默认 Local；只由用户显式选择 Worktree。
- [x] 同文件 stale 拒绝、不同文件并发、Shell Workspace 屏障和变化通知。
- [x] Run 归属排除其他任务；交错写入和不完整捕获禁用危险撤回。
- [x] Git clean/unstaged/staged/untracked/rename/delete/binary/unborn 六类基础状态。
- [x] 六种 Changes scope、标题栏 Workspace/Branch、Git 历史和白名单 IPC。
- [x] Worktree 手动应用、建分支、放弃、显式自动应用、冲突保留和重启恢复。
- [x] ignored-only、Local ignored 碰撞、超大 inventory、SSE 发布失败和 mutation/Run 竞态。
- [x] Local 与 linked Worktree revision 隔离；写回 Local 后才推进 Local revision。

## 11. 本次交付验证结果

- Python Agent：`340 passed, 1 skipped`；Shell 安全边界定向测试 `35 passed`；本次改动文件
  Ruff 检查通过（仓库其余旧测试文件仍有 4 条既有 import-order 提示）。
- Java Core（JDK 21）：`164 tests`，`0 failures / 0 errors / 0 skipped`，`BUILD SUCCESS`。
- Electron Desktop：TypeScript 类型检查通过；Vitest `50 files / 180 tests` 全部通过。
- 仓库补丁：`git diff --check` 通过，仅输出 Git 的 LF/CRLF 工作区提示。
