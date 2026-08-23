# 对话问题队列与 Steer 设计

本文描述 LUMORA 已实现的问题排队、运行中引导（Steer）和暂停恢复交互。这里的“队列”是
用户输入的耐久业务队列，不是 Python 进程内的临时 `asyncio.Queue`。

## 1. 目标与边界

- 用户只面对一个发送入口，不需要预先选择“现在发送”或“下一轮”。
- 当前任务未运行时，输入直接创建正常对话 Turn。
- 当前任务处于 `QUEUED`、`RUNNING`、`WAITING_APPROVAL`、`PAUSING` 或 `PAUSED`
  时，新输入默认保存为下一轮问题，并在当前 Run 结束后按顺序自动执行。
- 队列中的问题可以改为“调整方向”。Steer 在下一个安全步骤边界进入当前 Run，不会强制
  取消正在进行的模型请求或已经开始的工具。
- 暂停时队列和 Steer 都必须保留。绑定暂停 Run 的 Steer 保持 `PENDING`，继续 Run 后才投递。
- Java Local Core 是 Run、输入队列和可见消息的最终权威；Desktop 只做即时投影，Python
  只持有当前 Runtime Turn 内尚未认领的 Steer。

## 2. 桌面交互

### 2.1 统一发送按钮

运行期间，Composer 右下角保持一个黑色圆形主按钮：

- 输入为空时显示暂停方块，触发协作式安全暂停。点击后立即冻结回答输出并显示“正在保存当前
  进度”；后台等待已启动工具安全收敛，最终 `PAUSED` 后再开放“继续”。
- 输入非空时原位切换为向上箭头，发送后创建 `NEXT_TURN` 输入。
- `Enter` 与点击箭头行为一致，`Shift+Enter` 继续换行。

不存在独立的“下一轮”按钮。这样发送的默认行为由当前 Run 状态决定，而不是让用户理解
内部调度术语。

### 2.2 队列浮层

问题队列位于 Composer 内部、输入框上方，沿用新对话页项目选择条的层叠关系：

- 宽度为输入框宽度减 `34px`，左右各收窄 `17px`。
- 队列居中，底部 `17px` 藏在输入框后方；输入框处于更高层。
- 两层重叠时输入框上移 `1px` 并隐藏顶部边框，避免半透明边框与阴影叠出接缝。
- 队列使用 `22px 22px 12px 12px` 圆角、轻边框和低强度阴影，不模拟第二个输入框。
- 暂停时顶部显示“当前响应已暂停”和“继续”；队列内容仍可编辑、删除、排序或调整方向。

每一行默认展示问题摘要、“调整方向”、删除和更多操作。更多操作中提供编辑、上移和下移。
排序只在相同目标类型中进行，隐藏的 Steer 不参与普通下一轮问题的可见顺序。

## 3. 数据模型

Liquibase V26 创建 `conversation_input`：

```text
ConversationInput
├── inputId / taskId / runId
├── target: NEXT_TURN | NEXT_STEP
├── status: PENDING | DELIVERED | CLAIMED | CANCELLED
├── content / position
├── model / reasoningEffort / workspacePath / permissionMode
└── createdAt / updatedAt / claimedAt
```

目标语义：

- `NEXT_TURN`：不绑定活动 Run。当前 Run 终止并释放执行槽位后，队首输入创建新的
  `ConversationRun`，随后自动执行。
- `NEXT_STEP`：绑定当前 `runId`。Java 尝试投递给 Python Runtime；运行处于暂停、暂停中或
  尚未获得槽位时保持 `PENDING`。

状态语义：

- `PENDING`：只存在于 Java 队列，尚未交给 Runtime。
- `DELIVERED`：Runtime 已接收但 Agent Loop 尚未认领，允许替换或撤回。
- `CLAIMED`：已跨过安全边界并进入模型上下文，不允许再编辑或删除。
- `CANCELLED`：用户删除、任务取消或清理后的终态。

## 4. 调度与 Steer 流程

### 4.1 下一轮问题

```text
Desktop 统一发送
  → POST /api/v1/tasks/{taskId}/inputs (NEXT_TURN)
  → Java 持久化 PENDING
  → 当前 Run 完成或取消
  → ConversationRunCoordinator 领取队首输入
  → 创建新 Run，并将输入标记为 CLAIMED
  → 自动开始下一 Turn
```

队列以 `position`、`created_at` 保持稳定顺序。应用重启后，开放输入仍从 SQLite 恢复，不依赖
Renderer 或 Python 内存。

### 4.2 调整方向

```text
Desktop 将 NEXT_TURN 更新为 NEXT_STEP
  → Java 绑定活动 runId
  → POST /api/v1/chat/runs/{runId}/steers/{inputId}
  → Runtime RunControl 保存 Steer
  → Agent Loop 在安全步骤边界 claim
  → SSE steer_claimed(inputId, content)
  → Java 标记 CLAIMED，并持久化一条可见 User 消息
  → Desktop 显示正常用户问题气泡
```

Desktop 在用户点击“调整方向”时先插入乐观问题气泡；`steer_claimed` 和后续持久化消息负责
收敛与刷新恢复。运行中气泡插在尾部 Assistant 占位符之前；暂停后调整方向时，气泡插在已封存
Assistant 之后，避免时间线倒置。

Steer 被认领后，当前未完成的 Assistant 草稿通过 `text_reset` 清空。协议重放只丢弃尾部没有
真实工具调用的 Assistant 草稿；已经形成的 Assistant `tool_calls` 和 Tool Result 继续保留，
保证续接请求满足供应商协议约束。

## 5. 暂停、恢复和失败处理

- `PAUSED`、`PAUSING` 或 `QUEUED` Run 不立即投递 Steer，也不把它降级成 `NEXT_TURN`。
- 用户点击“继续”后，同一 `runId` 创建续接 Turn；Worker 启动后依次投递绑定该 Run 的开放 Steer。
- 暂停期间将队列问题改为“调整方向”会自动继续 Run，使引导能够在新的安全边界生效。
- Runtime 暂时不可用或投递抛错时，输入留在 `PENDING`，不会静默丢失。
- Runtime 明确拒绝一个运行中 Steer 时，Java 才将其改回 `NEXT_TURN`，保证用户输入最终仍会执行。
- Run 失败或结束时，无法再进入该 Run 的开放 Steer 会转回下一轮队列；取消任务则取消全部开放输入。

## 6. 接口与事件

Desktop → Core：

```text
GET    /api/v1/tasks/{taskId}/inputs
POST   /api/v1/tasks/{taskId}/inputs
PUT    /api/v1/tasks/{taskId}/inputs/{inputId}
DELETE /api/v1/tasks/{taskId}/inputs/{inputId}
```

Core → Agent Runtime：

```text
POST   /api/v1/chat/runs/{runId}/steers/{inputId}
PUT    /api/v1/chat/runs/{runId}/steers/{inputId}
DELETE /api/v1/chat/runs/{runId}/steers/{inputId}
```

`steer_claimed` 是唯一表示 Steer 已进入 Agent 上下文的权威事件。`DELIVERED` 只代表 Runtime
接收，不代表模型已经看到。

## 7. 验收要求

- 空闲发送直接开始；运行中发送只排队；当前 Run 完成后队首自动开始。
- 刷新或重启后，开放队列的内容、顺序、模型和权限选项保持不变。
- 编辑、删除、上移、下移只对开放输入生效。
- 调整方向立即产生可见问题气泡，刷新后仍存在，且不会重复。
- 暂停 Run 上的 Steer 在恢复前不投递，恢复后投递到原 Run。
- Steer 不打断已经开始的工具，协议重放不产生孤立 Tool Result。
- 队列浮层比输入框窄 `34px`、无可见接缝；主按钮的箭头和暂停方块在浅色、深色主题下均有足够对比度。
