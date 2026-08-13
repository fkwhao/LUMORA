# LUMORA 上下文管理设计

## 1. 目标

上下文管理同时解决两类增长：工具一次返回超大文本，以及长会话持续累积历史消息。实现采用
“Artifact 外置 + Auto-Compact 摘要”的两层压缩，并保证原始聊天记录仍可审计、前端现有消息
功能不因压缩而删除数据。

## 2. 第一层：Artifact 外置

处理顺序固定为：工具执行 → 结果大小检查 → 必要时持久化 Artifact → 生成预览 → 写入事件与
下一轮模型上下文。阈值为单结果 50,000 字符、同一模型回合内联结果累计 200,000 字符。

Artifact 按 taskId 分目录保存 UTF-8 文本，使用不可推导路径的 `art_<uuid>` 标识。元数据包含
MIME、字节数、字符数、估算 Token、SHA-256 和来源 toolCallId。Java 记录任务归属，读取时同时
校验 ID 格式、数据库归属和存储路径。模型与 Desktop 都使用有界读取；完整查看器通过 offset
分页追加，不允许把 Artifact 内容直接拼回普通聊天历史。

## 3. 第二层：Auto-Compact

输入预算按下式保守计算：

```text
触发线 = min(
  contextWindow - normalOutput - growthReserve - estimationReserve,
  contextWindow - summaryOutput - estimationReserve
)
```

其中 growthReserve 限制在 4,000–20,000 Token，summaryOutput 限制在 4,000–20,000 Token，
estimationReserve 至少 1,024 Token。回合前尚无可对应的 Provider usage，使用 UTF-8 字节数
估算完整请求；Agent Loop 中途则以最近一次 Provider 返回的 promptTokens 为锚点，只估算该次
请求后新增的工具消息。供应商不返回 usage 时，自动退回完整本地估算，不把历史累计 usage
误当成当前上下文大小。

上下文占用与模型用量采用两个独立指标：`activeContextTokens` 表示最近一次模型请求携带的
输入上下文规模，供压缩判断和界面圆环使用；`TokenUsage` 记录一次 Agent 运行内所有模型调用的
累计用量，持久化后用于本机使用统计、成本核算和后续云端计费。两者不得互相回退或替代。

`activeContextTokens` 优先采用供应商返回的 `promptTokens` / `input_tokens`。供应商未返回 usage
时，Provider 会使用包含消息与工具定义的本地估算值写入同一字段，保证上下文占用和压缩判断仍
可用。当前公开事件尚未携带独立的“该值是否估算”标志，因此历史记录只有该数值、无法在恢复后
可靠区分来源；增加来源标志属于后续契约增强。在完全没有活动上下文值时，Renderer 才会根据
本地可见会话文本退回更粗略的估算。

统一 `TokenUsage` 当前包含：

```text
promptTokens / completionTokens / totalTokens
inputTokens / outputTokens / reasoningTokens
cacheReadTokens / cacheWriteTokens / cacheMetricsAvailable
```

协议适配器把 Chat Completions、Responses 与 Anthropic 的不同 usage 字段归一化。输入、输出与
总量兼容性最高；推理和缓存明细仅在供应商返回时可用。缓存指标缺失时通过
`cacheMetricsAvailable=false` 表达，界面显示“协议未返回”，不把缺失误解为真实的零缓存。

压缩从历史尾部向前选择保留区：至少保留最近 5 条原文，并尽量覆盖最近 10,000 Token；其余
较早消息交给模型生成结构化 Markdown 摘要。摘要要求保留用户目标、约束、决策、完成工作、
未完成项、关键路径、错误与恢复信息，不保存隐藏推理。Java 使用独立摘要版本表保存 summary、
throughSequence 与 retainedFromSequence，原始 message 表不删除。

## 4. 触发与事件

自动压缩既发生在正常流式回答开始前，也会在每批工具结果写入模型历史后重新检查。中途达到
阈值时，对已经完成的旧消息/工具调用生成摘要，保留近期结构完整的原文组，然后继续 Agent
Loop；assistant tool_call 与对应 tool output 始终作为同组保留，避免产生孤立工具消息。手动压缩
使用同一 Provider 摘要方法和 Java 持久化逻辑，但属于强制操作：只保留最低要求的最近 5 条
原文，不再要求较早消息先超过自动模式的 10,000 Token 近期保留预算。
手动 Compact 在会话时间线中创建独立的纯处理记录，不附着到上一条助手回答，也不创建用户
气泡或回答气泡；每次触发使用唯一 itemId，避免再次压缩时复用旧记录。该记录只展示
“处理中 → 已压缩上下文”，持久化后会从后续模型上下文中过滤。
输入框仅在首部命令精确等于 `/compact` 时执行，不把它作为用户消息发送。`+` 菜单中的“压缩”
负责填入该命令，便于发现。

运行事件为：

```text
context_compaction_started
  → context_compacted
  → 正常 progress/tool/text/usage/completed
```

失败不会覆盖既有摘要；接口返回失败，工作步骤标记为 failed，用户可继续使用未压缩历史。

每次 Compact 完成后都重新调用 PromptBuilder 注入当前运行上下文、项目指令、可用工具和最新
摘要，再替换模型可见历史。中途压缩不改变公开 SSE 字段，也不删除 Java 保存的原始消息。

## 5. 模型可见工具输出保护

Artifact 判断前仍保留单结果 50,000 字符和单回合累计 200,000 字符规则。对不满足 Artifact
条件、Artifact 不可用或错误结果的文本，再施加 40,000 字符模型输入上限：保留头尾并在中间
写入省略提示，同时记录 `modelOutputTruncated` 与 `originalCharacterCount`。该保护与 read_file
分页上限、Artifact 阈值职责独立；正常的 40,000 字符 read_file 结果不会被二次缩短。

## 6. 数据归属与恢复

- Python：`ChatService` 管理回合前压缩，`AgentHarness` 管理工具循环中的中途压缩，
  `ContextPlanner` 负责统一预算决策，`ToolResultProcessor` 负责 Artifact 外置与模型可见截断，
  Provider 只生成摘要和模型回合。将两个自动压缩入口统一到 Harness 属于后续运行路径重构。
- Java：消息、摘要版本、Artifact 索引、任务归属、REST/SSE 契约。
- Desktop：`/compact` 识别、处理步骤、Token 占比与 Artifact 分块查看。

Java 将每条 Assistant 消息的详细 TokenUsage 和 `activeContextTokens` 写入 SQLite，并通过
`GET /api/v1/usage/statistics` 聚合本机总量、每日用量、请求/会话数、峰值和连续活跃天数。
Desktop 的个人资料页展示这些持久化统计；任务页右侧上下文面板展示最近请求的上下文总量、
会话累计用量和原始消息。上下文面板中的“用户 / 助手 / 工具调用 / 其他”比例根据本地消息正文
和工作记录估算，其中“其他”吸收系统 Prompt、工具 Schema、Memory、摘要及无法本地拆分的内容，
只作为快速观察构成的参考。

进程重启后 Java 从最新有效摘要恢复 `conversationSummary`，仅查询并发送其边界之后的原始消息。
Artifact 由稳定 ID 重新定位，不依赖 Renderer 状态。

## 7. 当前限制与后续工作

当前尚未实现模型专用 tokenizer、活动上下文值的精确/估算来源标志、精确的上下文分类计数、
压缩连续失败熔断、摘要因历史重写而自动失效、Artifact 配额与过期清理、二进制 Artifact 预览。
上述能力应在不改变公开 Artifact ID 和摘要边界协议的前提下增量加入。
