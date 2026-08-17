# LUMORA 工具调用运行时设计

> 文档状态：当前实现，2026-08-09。

## 1. 目标与结论

工具调用采用“基础工具工厂 + 工具注册中心”，避免每个工具重复实现名称、描述、
Schema 导出、校验、并发控制、计时和事件装配。

核心结论：

- `function_tool(...)` 是普通函数工具的创建入口。
- `ToolRegistry` 是工具发现、Schema、校验和执行的唯一入口。
- Python 注册中心是工具定义的唯一事实来源。
- Java 只传当前工作区允许使用的工具名称，不复制工具 Schema。
- `ToolResult.content` 返回给模型；`ToolResult.metadata` 只提供给 UI 和审计链路。
- UI 展示可验证的执行记录，不展示模型隐藏推理。
- 权限决策固定经过危险命令、路径沙箱、分层规则、权限模式和 HITL 五层。
- 每层按“后定义优先”算出的有效 `deny`，都不能被其他层的 `allow` 翻转。

本设计不包含浏览器工具、插件动态加载和跨进程工具执行器。

## 2. 执行链路

```text
Electron 选择工作区并发送消息
  → Java 校验任务并传递 workspacePath + availableTools
  → Python ChatService 准备请求并交给 AgentHarness
  → AgentHarness 使用 ToolRegistry 生成模型 tools
  → 模型返回一个或多个 tool_calls
  → PermissionEngine 按五层策略决策
  → 需要确认时发出 TOOL_APPROVAL_REQUESTED 并暂停 Agent Loop
  → Electron 弹出确认对话框，决定经 Java 归属校验后返回 Python
  → ToolCallExecutor 发出 TOOL_APPROVAL_RESOLVED / TOOL_STARTED
  → ToolRegistry 校验输入、应用并发策略并执行
  → ToolCallExecutor 发出 TOOL_COMPLETED / TOOL_FAILED
  → content 作为 role=tool 的消息返回模型
  → metadata 经 Python SSE → Java → Electron
  → 模型继续调用工具或生成最终回答
```

整个循环最多执行 20 个模型回合，超过限制后失败，防止模型无限调用工具。

## 3. 工具抽象

`Tool` 协议包含：

```text
name
description
input_schema
category
validate_input(input)
is_read_only(input)
is_destructive(input)
is_concurrency_safe(input)
concurrency_key(context, input)
resource_accesses(context, input)
display_title(input)
execute(context, input) -> ToolResult
to_model_definition()
```

风险和并发属性接收本次输入，而不是固定布尔值，因此同一个工具可以根据目标路径或
参数调整策略。`resource_accesses` 返回本次调用的资源 key 与 READ/WRITE 模式。请求级
Registry 副本共享同一资源锁和文件观察域，因此声明会跨 Run 生效；没有声明的非并发
安全工具继续回退到 `concurrency_key` 独占锁。`ToolContext` 当前携带已解析的工作区路径、
任务/关联 ID、文件观察域和取消检测函数。

`ToolContext.allow_external_paths` 只会在路径沙箱审批通过后为本次调用临时开启，不能由
模型输入。`ToolResult`：

```text
content: string
is_error: boolean
metadata: map
```

`content` 必须是适合模型继续工作的有界文本。路径、耗时、退出码、行数、分类和风险
属性等展示信息放入 `metadata`，Provider 不把 metadata 回传给模型。

## 4. 工厂函数

普通工具通过声明式工厂创建：

```python
tool = function_tool(
    name="search_code",
    description="搜索工作区代码",
    input_schema={...},
    category=ToolCategory.FILESYSTEM,
    read_only=True,
    concurrency_safe=True,
    validate=validate_search_input,
    execute=execute_search,
    title=lambda input_data: f"搜索 {input_data['query']}",
)
registry.register(tool)
```

只有需要自定义生命周期或状态的复杂工具才直接实现 `Tool` 协议。

## 5. 注册中心职责

`ToolRegistry` 负责：

1. 注册工具并拒绝空名称、空描述和重复名称。
2. 根据 Java 传入的名称白名单筛选真实可用工具。
3. 从工具对象生成 OpenAI Function Calling 定义。
4. 执行基础 JSON Schema 校验和工具语义校验。
5. Agent Loop 按 `is_concurrency_safe(input)` 将兄弟调用划分为有界并发组和独占屏障。
6. 按资源 READ/WRITE 声明或兼容并发 key 协调同 Run 与跨 Run 的实际冲突。
7. 保存任务读取到的文件版本，拒绝基于陈旧观察执行完整覆盖。
8. 统一统计耗时、资源等待并补充分类、只读、破坏性和标题 metadata。

内置实现按能力拆分：`artifact_tools.py` 维护 Artifact 分段读取与搜索，
`filesystem_tools.py` 维护工作区文件能力，`shell_tools.py` 维护子进程能力；
`default_registry.py` 是唯一默认装配入口并固定工具顺序。`tool_runtime.py` 仅作为旧代码的
兼容导入层，不再承载工具实现。

当前 Schema 校验器覆盖内置工具使用的 object、string、integer、boolean、array、
required、additionalProperties、minimum 和 maximum。引入组合 Schema 或复杂嵌套对象
前，应换成完整 JSON Schema 实现并增加兼容性测试。

## 6. 内置工具

| 工具 | 分类 | 只读 | 并发策略 | 主要边界 |
| --- | --- | --- | --- | --- |
| `update_plan` | planning | 是 | 同一计划串行 | 每次提交完整快照，1～20 步，最多一个 `in_progress` |
| `list_files` | filesystem | 是 | 可并发 | 默认工作区内；外部 glob 需逐次确认，最多展示 300 项 |
| `search_in_file` | filesystem | 是 | 可并发 | 普通文本搜索，默认 40、最多展示 100 个匹配 |
| `read_file` | filesystem | 是 | 可并发 | 默认 200 行，单次最多 400 行或 40,000 字符 |
| `apply_patch` | filesystem | 否 | 同一目标文件串行 | 旧文本必须唯一匹配，原子替换，补丁最多 100,000 字符 |
| `write_file` | filesystem | 否 | 同一目标文件串行 | 用于新建或明确完整覆盖，输入最多 1,000,000 字符 |
| `shell_command` | shell | 否 | 同一工作区串行 | 非交互、默认 120 秒/最长 600 秒、有界输出、灾难性命令硬拒绝 |
| `artifact_read` | filesystem | 是 | 可并发 | 只接受任务所属的不透明 Artifact ID，单次最多 40,000 字符 |
| `artifact_search` | filesystem | 是 | 可并发 | 只接受任务所属的不透明 Artifact ID，最多返回 100 条命中 |

`write_file` 当前统一标记为 destructive，因为输入阶段无法可靠判断目标在执行时是否
仍然存在。当前权限执行器会按照权限模式和分层规则进入审批；后续精确
`grantedPermissions` 与受限 Worker 仍需进一步消除检查与使用之间的竞态。

### 6.1 大文件读取与修改流程

局部修改不得以“完整读取 → 在模型中重建 → 完整覆盖”为默认路径。这条稳定行为规则
定义在 Python `30_tools_and_safety.md` 基础 System Prompt 中，不由 Java DTO 拼接。
Java 只传递工作区、工具白名单等动态运行事实。用户只需描述文件和修改目标，不需要
在普通请求里指定工具名称或调用步骤：

```text
search_in_file 定位符号或文本
  → read_file 从命中行附近分段读取
  → apply_patch 提交带足够上下文的唯一旧文本
  → search_in_file 或 read_file 验证结果
```

`read_file` 的响应 metadata 包含 `totalLineCount`、`startLine`、`endLine`、`hasMore`
以及有后续内容时的 `nextStartLine`。工具受限于行数和返回字符数，即使目标文件较大，
也不会把整个文件自动塞进模型上下文。

`search_in_file` 只进行普通文本匹配，不接受正则表达式，避免复杂表达式造成不可控
计算。默认大小写不敏感；UI 使用 `matchCount`、`resultCount` 和 `truncated` 表达完整
匹配数与实际展示数。

`apply_patch` 使用 `oldText` / `newText` 精确替换。默认只允许唯一匹配；零匹配表示
文件可能已经变化，多匹配则要求模型补充更多上下文。只有调用方明确传入
`replaceAll=true` 时才替换全部匹配。落盘仍采用同目录临时文件替换，工具结果只返回
行数和替换次数，不把修改后的完整文件反馈给模型。补丁会适配并保留目标文件现有的
LF 或 CRLF 换行风格。

`write_file` 不参与普通的局部编辑流程，只用于新建文件或用户明确要求的整体覆盖。
这条约束属于 Python 静态 System Prompt 和工具语义，不额外触发审批；读取分段上限、
补丁唯一匹配和工作区路径限制仍由运行时代码强制执行。

读取、搜索和局部修改可处理的文本文件安全上限为 20,000,000 字符。这个上限限制
Python 进程内存占用，不代表内容会进入模型上下文；真正返回模型的文本仍受单次输出
上限约束。

### 6.2 大结果 Artifact 外置

工具成功返回后、结果加入下一轮模型消息前，运行时执行统一的大结果检查：单个结果超过
50,000 字符，或当前模型回合的内联工具结果累计超过 200,000 字符时，完整结果写入按任务隔离
的 Artifact 存储。`tool_completed` 的 `output` 与模型收到的 tool message 都替换为短预览，
`metadata` 携带 `artifactId`、字节数、字符数、估算 Token、SHA-256 与来源 toolCallId。

Artifact ID 是不透明的 `art_<uuid>`，不能传入路径。`artifact_read` 每次最多读取 40,000
字符，`artifact_search` 最多返回 100 条命中，并再次校验任务归属。`artifact_read` 与
`artifact_search` 自身不会递归外置。Java 保存 Artifact 索引，Desktop 只通过 Java 的任务级
接口分块打开完整内容。

## 7. 工作过程事件与 UI

模型中间文字作为 `progress_message`，工具调用产生：

```text
tool_started
tool_completed
tool_failed
tool_approval_requested
tool_approval_resolved
```

上下文自动压缩使用同一工作过程事件链：`context_compaction_started` 创建运行中步骤，
`context_compacted` 用相同 itemId 更新为完成状态。Renderer 将 `context` 类型步骤与工具步骤
统一渲染，运行时文字使用现有 shimmer 扫光；压缩摘要本身只进入 Java 的摘要表，不作为普通
聊天正文展示。

供应商适配器负责生成单回合增量事件并在流末组装完整回合，`AgentHarness` 管理运行边界，`AgentLoopRunner` 负责
多回合工具编排，`ToolCallExecutor` 负责参数校验、权限审批、执行与事件投影，
`ToolResultProcessor` 负责 Artifact 外置与模型可见截断。职责分离后，工具生命周期、累计
用量和二十轮上限不依赖某个具体模型供应商。Provider 所需的回合数据结构与回调类型统一定义
在 `app/harness/contracts.py`；Service 与 Harness 分别通过 `ModelProviderPort`、
`CompletionProviderPort` 和 `AgentTurnProviderPort` 使用能力，具体 Provider 不依赖 Agent Loop，
核心层也不依赖 `OpenAICompatibleProvider`。

Provider、ChatService、AgentHarness 和 ToolCallExecutor 之间传递 `app/harness/run_event.py`
定义的内部 `RunEvent`，使用 snake_case 字段且不包含 HTTP/SSE 序列化逻辑。仅
`controller/http/chat_stream_event_mapper.py` 将其投影为 `ChatStreamEventResponse` 的 camelCase
公开字段。映射器精确字段测试、SSE 顺序测试以及 OpenAPI/内部事件枚举一致性测试共同保护
Java 与 Desktop 契约。

`ChatService.stream` 始终调用 `AgentHarness.stream`。Harness 根据当前 Prompt 是否包含工具以及
是否存在 ToolContext 选择执行策略：普通聊天继续使用 Provider 原生流式接口，工具聊天使用
最多二十轮的 Agent Loop。工具聊天中的最终正文同样以 `text_delta` 实时转发；工具调用名称和
JSON 参数则在流中累计，回合结束后再交给执行器。该分支属于 Harness 内部策略，不再形成两套
应用层运行入口。

事件包含稳定的 `itemId`、模型 `toolCallId`、工具名称、展示标题、参数、输出、耗时、
退出码和 metadata。模型只在工作目标发生明显切换时输出一句描述新阶段的标题；普通
多步骤任务通常保持 2～4 个概括阶段，同一目标下的连续工具调用不重复生成阶段文字。
Java 持久化消息的工作记录，Electron 将其投影为：

- 默认折叠的“正在处理/已处理”摘要；
- 展开后的动态语义阶段，例如“正在生成测试数据”；
- 语义阶段再次展开后的真实工具步骤；
- 单次工具调用的参数、命令、输出和状态详情；
- “已编辑 文件名.ext”点击后打开右侧局部 Diff 预览；
- 执行中的灰色文字扫光效果。

多步骤实现任务会在探索必要上下文后调用 `update_plan` 发布完整计划，并在步骤状态变化
时更新快照。Electron 从最近一次有效调用中解析步骤，在对话区域右上角显示可折叠 To-do；
收起态为紧凑胶囊，全部步骤完成后不再显示。`update_plan` 工作记录不重复出现在工具活动
列表中，避免计划 UI 和执行详情展示同一信息。

模型隐藏推理不进入这条可验证工作记录；UI 只显示阶段说明和真实工具执行事件。

实时事件和持久化事件使用不同投影：实时 UI 可以展示本次调用详情，落库前由 Java
移除完整文件写入的 `content`，但为 `apply_patch` 保留最多 12,000 字符的 `oldText`
与 `newText` 局部预览；单字段输出最多保留 8,000 字符，单次回答最多保存 200 条工作
记录。Desktop 的实时流与历史恢复共用同一个
`ChatStreamEvent → WorkLogItem` 映射函数。

用户停止生成时，Desktop 除了关闭本地 SSE，还会调用 Java 取消端点。Java 中断活动
生成线程，使 Python 请求被取消；Shell 子进程也会在协程取消时终止。

普通 Java→Python REST 请求保持 90 秒超时；长任务 SSE 不设置固定读取截止时间，持续到任务
完成、用户取消、进程退出或连接真正断开，避免审批等待和跨小时任务被误判为超时。

## 8. 五层权限防御

权限判断发生在输入 Schema 与语义校验之后、任何副作用之前，顺序固定且不可由工具
自行绕过：

```text
用户输入
  → [1] Shell 危险命令黑名单：灾难性命令绝对拒绝
  → [2] 文件路径沙箱：超出工作区在替我审批中阻止，人工模式逐次确认
  → [3] 分层权限规则：Bash(git *) → allow / deny / ask
  → [4] 权限模式：完全访问 / 替我审批 / 请求批准
  → [5] Shell 确定性分级：完整识别的只读、测试、检查和构建命令直接允许
  → [6] 自动 Reviewer：灰区通过则执行，其他结果阻止并要求主 Agent 更换方案
  → [7] HITL：仅“请求审批”模式暂停 Agent Loop 等待用户
  → 工具执行
```

第 1 层只对 `ToolCategory.SHELL` 生效。`read_file`、`write_file`、`apply_patch` 等文件
工具不套用命令字符串黑名单，而是由真实路径解析和第 2 层守护。硬黑名单、路径沙箱
均先于普通规则，因此项目规则和“完全访问”都不能放行 `rm -rf /`，也不能静默访问
工作区外文件。

三种模式的行为：

- `full_access`：工作区内调用默认允许；硬黑名单和外部路径确认仍然生效。
- `auto_approve`：只读工具和工作区内的新文件创建默认允许；单条、可完整解析、路径不越出
  工作区的常见 Shell 只读、版本查询、测试、lint、typecheck 和构建命令也由确定性分级器
  直接允许。复合命令、写入命令、敏感参数和未知命令，以及覆盖已有文件、局部补丁等需要
  判断的调用才交给自动 Reviewer。Reviewer 只能允许当前一次；`deny`、
  `require_human`、超时或异常都阻止本次调用，不创建人工审批。主 Agent 收到不可原样重试
  的结构化结果后改用更安全的方案，或在最终回答中说明未执行项。新文件与覆盖文件按目标
  在调用前是否存在区分，避免项目脚手架被误报成高风险覆盖操作。
- `request_approval`：工作区内只读调用自动允许，写入和 Shell 进入 HITL。

### 8.1 分层规则文件

规则使用 YAML，文件位置为：

```text
~/.lumora/permissions.yaml                    用户全局，最低优先级
{workspace}/.lumora/permissions.yaml          项目共享，可提交版本控制
{workspace}/.lumora/permissions.local.yaml    项目本地，最高优先级
```

示例：

```yaml
version: 1
rules:
  - tool: Bash
    pattern: "git *"
    decision: allow
  - tool: write_file
    pattern: "generated/*"
    decision: ask
```

普通规则的覆盖顺序是项目本地 > 项目共享 > 用户全局；同一层先按定义顺序取最后一条
命中规则作为该层的有效结果。随后对各层有效结果合并 `deny`：只要任意层的有效结果为
deny 就直接拒绝，其他层的 allow 不能覆盖。项目配置因此不能翻转用户全局的安全拒绝。

用户在确认框选择“始终允许”时，运行时把文件工具的当前参数或 Shell 的当前精确命令授权
原子写入 `permissions.local.yaml`，并在同一次 Agent 运行的后续调用前重新加载；
`.lumora/.gitignore` 自动忽略该本地文件。路径沙箱
确认不提供“始终允许”，外部路径每次都必须再次确认。配置只用 `yaml.safe_load`，有
大小、结构、版本和符号链接校验。

### 8.2 自动审批 Reviewer

自动 Reviewer 不是所有 Shell 调用的第一站。运行时先用不消耗 Token 的确定性分级器检查
整条命令；只有命中白名单且没有管道、拼接、重定向、展开和工作区外路径时才直接执行。
任何无法完整理解的调用都 fail closed 到 Reviewer，不能用 `安全命令 && 危险命令` 绕过。
测试和构建命令可能执行仓库脚本，因此快速放行假设当前工作区可信；用户和项目 YAML 规则
仍先于分级器，可把某类命令改为 `ask` 或 `deny`。
工作区内的只读调用、新文件创建和有界且基于唯一 `oldText` 比较条件的原子 `apply_patch`
也由确定性规则直接放行，这些调用不再额外请求模型 Reviewer。覆盖已有文件的完整写入、
超过 16,000 字符或 200 行的大补丁、无法静态理解的 Shell 或其他高影响灰区仍进入
Reviewer；硬黑名单和工作区外路径不会交给模型放行。

分级器的可演进业务数据集中在
`agent/app/permission/default_shell_policy.yaml`：只读命令、版本查询命令、Git 只读子命令、
项目验证任务和禁止参数不再散落在权限引擎中。解析完整命令、拒绝 Shell 组合、识别工作区
外路径和灾难性命令属于安全不变量，继续由代码固定实现；策略文件只能改变快速放行集合，
不能绕过这些边界。

“替我审批”不依赖第三方 Agent SDK。Python 运行时用当前任务已经选择的模型 API 协议、
API Key 和模型额外发起一个无工具的 Reviewer 回合，只提交用户当前请求、主 Agent
上下文、待执行工具及参数、工作区、确定性权限判断和自定义审批策略。Reviewer 必须返回
`allow_once`、`deny` 或 `require_human` 的 JSON。接口或格式错误会自动重试一次，并兼容模型
在简短说明中嵌入 JSON；连续失败、超时和试图调用工具按 `require_human` 分类，但执行器
统一视为“本次未执行”。自动 Reviewer 永远不能生成“始终允许”，也不会打开人工审批。
界面会把调用故障明确显示为“智能审批暂不可用，本次未执行”。
Reviewer 的非通过结果不写入权限规则；为防止循环，同一次 Agent 运行中的完全相同调用
会被直接跳过，后续新任务仍会重新评估。
运行时通过 `approval_review_started` / `approval_review_completed` 公开审批过程。Desktop
按“阶段性回复 → 工具组摘要 → 具体调用”三层展示：默认只显示阶段回复和一行工具组摘要，
点击摘要后才显示橙色、低强调的审批记录与具体命令。审批结果随工作记录持久化用于区分
“审批未通过”和“命令执行失败”，但不会转化为后续权限规则。

Reviewer 只处理权限模式产生的灰区。硬黑名单、工作区外路径以及 YAML 中显式配置的
`deny` / `ask` 都先于 Reviewer 执行，模型不能覆盖。自然语言策略按以下位置加载：

```text
~/.lumora/approval-reviewer.md                    用户全局
{workspace}/.lumora/approval-reviewer.md          项目共享，可提交版本控制
{workspace}/.lumora/approval-reviewer.local.md    项目本地，不应提交版本控制
```

策略文本用于表达团队或个人的业务边界，例如普通非强制 `git push`、项目级依赖安装可以
在用户明确要求且目标清楚时由 Reviewer 批准，而强推、系统级安装、生产部署、凭据读取和
高风险数据库迁移是否应禁止自动执行。它只能收紧或澄清内置安全边界，不能放开灾难性命令
或工作区外访问。

### 8.3 HITL 暂停与归属

仅在“请求审批”模式（以及非自动模式的工作区外访问）需要确认时，Python
`ApprovalBroker` 创建一次性 `approvalId` 并让 Agent Loop await，
期间工具尚未收到 `tool_started`，执行函数也不会运行。Core 记录
`approvalId → taskId + 原始 correlationId`；审批接口同时校验任务归属，并用原始
correlationId 恢复 Python 中对应的 Future。重复、过期、跨任务或跨会话审批均拒绝。

用户可选择“拒绝”“允许本次”“始终允许”。拒绝会作为可观察的工具失败结果返回模型，
让模型调整方案；批准后才发出 `tool_started`。取消生成或流结束会清理待审批记录。
人工“拒绝”同样只对当前调用有效；永久拒绝只能由用户显式写入 `permissions.yaml`。

### 8.4 目标权限模型与受限 Worker

当前 `is_read_only`、`is_destructive` 继续用于风险提示和 UI，但目标架构要求每个工具根据
具体输入实现 `required_permissions(context, input)`，返回精确的文件读写路径、网络、Shell
和子进程需求。权限引擎把三层规则、硬拒绝、会话授权和工具需求合并为统一
`PermissionProfile`；冲突时遵循 `deny > write > read`。

审批策略、审批者和沙箱模式拆分：`request_approval` 使用用户 Reviewer，`auto_approve`
使用自动 Reviewer，但两者默认保持相同工作区沙箱；`full_access` 才改变权限边界。Reviewer
只能批准工具已申请的权限子集，并支持 call、turn、session、persistent 作用域。当前
`allow_external_paths` 布尔开关将替换为精确的 `grantedPermissions`，避免一次外部文件审批
放开所有外部路径。

执行侧采用可替换 `SandboxBackend`。不引入 Rust；Windows 目标后端由 Python 通过 `pywin32`
创建 Restricted Token 下的独立 Python Tool Worker，并使用 Job Object 管理完整子进程树。
文件工具与 Shell 都应进入 Worker，Python Agent 主进程只保留模型循环、权限编排和事件转发。
在该 Worker 完成前，现有路径检查属于 `LogicalSandboxBackend`，不能被描述为 OS 沙箱。
任何后端无法精确实现的 deny、敏感目录 carve-out 或网络限制必须 fail closed。

## 9. 安全与已知限制

当前已实现：

- 工作区在调用前解析为真实目录。
- 文件路径解析后验证工作区边界；外部路径在替我审批模式下不执行，其他模式只有当前
  单次审批通过才能执行。
- Shell 灾难性黑名单只用于不可接受的绝对拒绝；确定性分级器只放行完整识别的单条安全
  命令，其余风险交给规则和自动 Reviewer；HITL 只服务于人工审批模式。
- 三层 YAML 规则、deny 不可翻转和本地“始终允许”原子落盘。
- Core 对工具审批执行任务归属与原始 correlationId 绑定。
- 命令超时、文件大小、列表数量和输出长度有明确上限。
- 大文件读取按行分段，局部修改要求唯一匹配并采用原子替换。
- 未注册工具和非法参数以工具失败结果反馈，不直接执行。

当前限制：

- 文件执行发生在 Python 进程权限下，没有操作系统级目录隔离。
- Shell 仍在宿主进程权限下运行；黑名单不是操作系统沙箱，必须保留自动拒绝边界、人工
  模式的 HITL 和最小权限。
- 不同 Run 可以同时执行工具并共享资源协调；同一模型响应中的显式安全调用使用默认上限
  为 10 的滚动并发池，独占调用形成屏障，所有结果按模型返回顺序提交。

项目共享配置属于仓库输入；克隆不受信任项目时应检查其中的 allow 规则。即使项目规则
恶意放行，硬黑名单、路径沙箱和任意层 deny 仍不可绕过。

## 10. 新增工具检查清单

1. 定义最小且关闭 `additionalProperties` 的输入 Schema。
2. 使用 `validate` 表达 Schema 无法覆盖的业务约束。
3. 正确声明分类、只读、破坏性和并发属性。
4. 对工作区或文件资源提供稳定的 `resource_accesses`；兼容工具至少提供 `concurrency_key`。
5. 限制输入、执行时间和输出体积。
6. 确保敏感信息不进入 content、metadata、异常或日志。
7. 用 `function_tool(...)` 创建并注册；不要在 Java 或 Prompt 复制 Schema。
8. 增加成功、非法输入、越界、失败和并发策略测试。
9. 验证 SSE 事件、Java 持久化和 Electron 展示。

## 11. 验收矩阵

- Python：五层顺序、Shell 专属硬拒绝、路径授权、规则合并、Agent Loop 暂停恢复、
  配置原子写入、工具注册、Schema、超时和执行结果。
- Java：Python DTO 映射、审批任务归属、原始 correlationId 转发、工作记录累积、
  数据库迁移与消息恢复。
- Electron：审批 SSE、确认弹窗、三种模式、IPC 参数校验、Store 恢复、折叠摘要、
  调用详情、进行中动画和失败态。
- 人工联调：模型完成 list/search/read/patch/write/shell 链路；面对大文件时先定位再读取，
  最终回答与磁盘实际结果一致。
