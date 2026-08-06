# LUMORA Memory 系统设计

## 1. 目标与边界

本设计是在现有 SQLite Memory、语义槽去重和会话摘要上增量增强，不把每条记忆迁移为文件，也不
改变进程职责：Java Local Core 负责持久化、状态与生命周期；Python Agent Runtime 负责提取、
检索排序和 Prompt 装配。Java 与 Python 继续通过版本化 REST DTO 通信。

## 2. 四层信息

| 层 | 内容 | 存储与作用域 |
| --- | --- | --- |
| User Memory | 跨项目稳定的用户偏好、习惯和长期配置 | SQLite，`USER/local-user` |
| Project Memory | 当前项目事实、确认过的技术决策和长期约束 | SQLite，`PROJECT/<规范化工作区路径>` |
| Conversation Memory | 未完成目标、临时约束和恢复信息 | SQLite，`CONVERSATION/<conversationId>`，通常带 TTL |
| Project Instructions | 项目静态规则 | 工作区 `AGENTS.md`、`CLAUDE.md`、`.lumora/` 同名文件，不进入 Memory |

Auto-Compact 产生的 Conversation Summary 继续保存在 `conversation_context_summary`，它是历史消息
的有损恢复视图，不是可跨会话复用的事实，也不参与 `memory_item` 语义槽更新。

动态记忆内容仍统一存放在一张 `memory_item` 表中，三种范围通过 `scope_type` 区分，不为每个范围
重复建表。全局开关属于应用配置，单独保存在通用 `application_setting` 表的
`memory.enabled` 键中，它不是 Memory 内容表。

## 3. 数据与生命周期

`memory_item` 保留现有 `scope_type`、`memory_type`、语义槽、版本、内容哈希、置信度、来源消息、
状态和过期时间，并新增：

- `importance`：未来任务价值，范围 0–1；
- `usage_count`、`last_used_at`：仅在条目实际被 Python 选中并注入时更新；
- `source_type`、`source_reference`：区分自动对话提取和后续其他来源；
- `EXPIRED` 状态：读取到已过 TTL 的活动条目时显式转换，保留审计记录。

同一 `scope + type + dedupe_key` 仍是可更新语义槽。新表达命中旧槽时原位更新并按值变化增加
版本，不追加近义重复行。用户明确撤销已有偏好、决定或约束时，Python 返回 `ARCHIVE` 操作并
携带已有 `targetMemoryId`；Java 校验后将其状态改为 `ARCHIVED`。目标 ID 必须来自本轮由 Java
构造的活动记忆提取上下文，且数据库中的作用域必须
与当前用户/项目/会话匹配；类型和语义键允许模型在分类升级时发生变化，不作为归档身份依据。
`ARCHIVED`、`EXPIRED`、`DELETED` 均不进入检索候选，且保留历史审计信息。
当用户后续重新确认同一事实或偏好时，普通 `UPSERT` 先匹配活动语义槽；若不存在活动槽，则按
`scope + type + dedupe_key` 恢复最近的 `ARCHIVED` 条目，保留原 `memory_id` 和创建时间、将
状态改回 `ACTIVE` 并增加版本。归档条目不进入正常聊天 Prompt；每个作用域只取最近 8 条加入
记忆提取上下文并显式标记 `status=ARCHIVED`，用于识别“重新恢复”而不污染回答内容。

## 4. 生成与检索

回答完成后，Python 提取器只返回最多 8 个候选：稳定的跨项目信息进入 User，项目事实或已确认
决策进入 Project，短期未完成状态进入 Conversation。一次性任务、寒暄、错误日志、失败命令、
临时诊断、未确认的助手建议和认证秘密全部丢弃。用户明确要求当前项目长期遵循的静态规则输出为
`PROJECT_INSTRUCTIONS`，由 Java 写入 `.lumora/AGENTS.md` 的 LUMORA 受控区块，不重复写入
`memory_item`。同一 `dedupe_key` 原位更新；明确撤销时从受控区块移除。文件中受控区块以外的
用户内容保持不变。Java 对所有候选继续执行置信度、秘密模式、作用域和工作区边界校验。

模型请求前，Java 从 User、当前工作区 Project、当前 Conversation 各读取至多 20 个活动候选，
不拼成无差别的全量文本。Python 使用以下确定性信号排序：

```text
score = relevance * 0.50
      + importance * 0.20
      + confidence * 0.15
      + recency * 0.10
      + usage_frequency * 0.05
```

最终最多注入 12 条、8,000 字符，并设置 User 4、Project 6、Conversation 4 的分层上限。无关键词
重叠时，仅允许高重要度内容或稳定用户偏好/约束通过，避免 Memory 污染主上下文。

## 5. Prompt 优先级

Provider 请求中的有效优先级为：

```text
System Rules + Project Instructions（可信 system）
  → User Memory（非权威 user context）
  → Project Memory（非权威 user context）
  → Conversation Memory（非权威 user context）
  → Conversation Summary（非权威恢复上下文）
  → Current User Request
```

Project Instructions 与系统规则处于可信指令层；所有动态 Memory 都明确标记为参考事实，不能覆盖
系统或项目规则。当前用户请求仍位于消息末尾。旧客户端只发送 `memorySummary` 时仍走兼容分支；
存在结构化候选时不再重复注入旧摘要。

## 6. 用户控制

Desktop 设置的“个性化”页面只提供两个明确操作：

- “启用记忆”关闭后，Java Core 不再向 Prompt 注入动态记忆，也不再从新对话自动提取记忆；已有
  `memory_item` 数据保留，因此重新启用后仍可继续使用；
- “重置记忆”经二次确认后删除 `memory_item` 中全部 User、Project 和 Conversation 动态记忆，
  不删除聊天记录、`conversation_context_summary` 或项目指令文件，也不改变开关状态。

对应 Java Core 接口为 `GET/PUT /api/v1/memory/settings` 和 `DELETE /api/v1/memory`，Desktop 通过
Preload IPC 调用，Renderer 不直接访问本地 REST 服务。

## 7. 后续增强

当前相关性使用轻量词项与中文二元组，不依赖向量数据库。候选规模或跨项目数量显著增加后，可在
不改变 Java/Python 边界的前提下加入 FTS 或 embedding 召回。当前不提供逐条编辑、归档、来源
追踪或按状态清理等复杂治理界面；确有用户需求后再增量加入。静态项目规则后续可支持目录级继承，但必须继续保持文件来源和
动态 Memory 隔离。
