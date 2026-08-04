# LUMORA 工具调用运行时设计

> 文档状态：当前实现，2026-08-03。

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

本设计不包含浏览器工具、插件动态加载、跨进程工具执行器和破坏性操作审批调度。

## 2. 执行链路

```text
Electron 选择工作区并发送消息
  → Java 校验任务并传递 workspacePath + availableTools
  → Python ChatService 用 ToolRegistry 生成模型 tools
  → 模型返回一个或多个 tool_calls
  → Provider 发出 TOOL_STARTED
  → ToolRegistry 校验输入、应用并发策略并执行
  → Provider 发出 TOOL_COMPLETED / TOOL_FAILED
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
display_title(input)
execute(context, input) -> ToolResult
to_model_definition()
```

风险和并发属性接收本次输入，而不是固定布尔值，因此同一个工具可以根据目标路径或
参数调整策略。`ToolContext` 当前携带已解析的工作区路径、关联 ID 和取消检测函数；
后续可在不污染工具输入 Schema 的情况下加入审批凭证或运行身份。

`ToolResult`：

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
5. 按并发安全属性和资源 key 串行化冲突调用。
6. 统一统计耗时并补充分类、只读、破坏性和标题 metadata。

当前 Schema 校验器覆盖内置工具使用的 object、string、integer、boolean、array、
required、additionalProperties、minimum 和 maximum。引入组合 Schema 或复杂嵌套对象
前，应换成完整 JSON Schema 实现并增加兼容性测试。

## 6. 内置工具

| 工具 | 分类 | 只读 | 并发策略 | 主要边界 |
| --- | --- | --- | --- | --- |
| `list_files` | filesystem | 是 | 可并发 | glob 必须位于工作区，最多展示 300 项 |
| `search_in_file` | filesystem | 是 | 可并发 | 普通文本搜索，默认 40、最多展示 100 个匹配 |
| `read_file` | filesystem | 是 | 可并发 | 默认 200 行，单次最多 400 行或 40,000 字符 |
| `apply_patch` | filesystem | 否 | 同一目标文件串行 | 旧文本必须唯一匹配，原子替换，补丁最多 100,000 字符 |
| `write_file` | filesystem | 否 | 同一目标文件串行 | 用于新建或明确完整覆盖，输入最多 1,000,000 字符 |
| `shell_command` | shell | 否 | 同一工作区串行 | 非交互、最长 120 秒、有界输出、危险模式拒绝 |

`write_file` 当前统一标记为 destructive，因为输入阶段无法可靠判断目标在执行时是否
仍然存在。以后接入审批时，应在执行前重新计算真实风险并防止检查与使用之间的竞态。

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

## 7. 工作过程事件与 UI

模型中间文字作为 `progress_message`，工具调用产生：

```text
tool_started
tool_completed
tool_failed
```

供应商适配器负责生成单回合结果，`AgentLoopRunner` 负责多回合工具编排。两者分离后，
工具生命周期、累计用量和二十轮上限不依赖某个具体模型供应商。

事件包含稳定的 `itemId`、模型 `toolCallId`、工具名称、展示标题、参数、输出、耗时、
退出码和 metadata。每轮工具调用前，模型输出一句描述本轮目的的动态阶段标题；Java
持久化消息的工作记录，Electron 将其投影为：

- 默认折叠的“正在处理/已处理”摘要；
- 展开后的动态语义阶段，例如“正在生成测试数据”；
- 语义阶段再次展开后的真实工具步骤；
- 单次工具调用的参数、命令、输出和状态详情；
- “已编辑 文件名.ext”点击后打开右侧局部 Diff 预览；
- 执行中的灰色文字扫光效果。

模型隐藏推理不进入这条可验证工作记录；UI 只显示阶段说明和真实工具执行事件。

实时事件和持久化事件使用不同投影：实时 UI 可以展示本次调用详情，落库前由 Java
移除完整文件写入的 `content`，但为 `apply_patch` 保留最多 12,000 字符的 `oldText`
与 `newText` 局部预览；单字段输出最多保留 8,000 字符，单次回答最多保存 200 条工作
记录。Desktop 的实时流与历史恢复共用同一个
`ChatStreamEvent → WorkLogItem` 映射函数。

用户停止生成时，Desktop 除了关闭本地 SSE，还会调用 Java 取消端点。Java 中断活动
生成线程，使 Python 请求被取消；Shell 子进程也会在协程取消时终止。

## 8. 安全与已知限制

当前已实现：

- 工作区在调用前解析为真实目录。
- 文件只接受相对路径，并在解析后再次验证仍位于工作区。
- Shell 拒绝绝对 Windows 路径、父目录跳转、删除、进程控制、下载和部分危险命令。
- 命令超时、文件大小、列表数量和输出长度有明确上限。
- 大文件读取按行分段，局部修改要求唯一匹配并采用原子替换。
- 未注册工具和非法参数以工具失败结果反馈，不直接执行。

当前限制：

- `is_destructive` 目前只进入 metadata，尚未连接 Java 审批条。
- Shell 危险模式使用 denylist，只适合当前开发阶段，不能视为完整沙箱。
- 文件执行发生在 Python 进程权限下，没有操作系统级目录隔离。
- 多工具调用当前按模型返回顺序执行；注册中心具备并发策略，但 Provider 尚未并行
  调度同一回合的多个调用。

因此，在审批闸门和更强隔离完成前，只能对用户明确选择的测试或项目工作区开放这些
工具，不应对任意目录或无人值守高风险任务开放。

## 9. 新增工具检查清单

1. 定义最小且关闭 `additionalProperties` 的输入 Schema。
2. 使用 `validate` 表达 Schema 无法覆盖的业务约束。
3. 正确声明分类、只读、破坏性和并发属性。
4. 对共享资源提供稳定的 `concurrency_key`。
5. 限制输入、执行时间和输出体积。
6. 确保敏感信息不进入 content、metadata、异常或日志。
7. 用 `function_tool(...)` 创建并注册；不要在 Java 或 Prompt 复制 Schema。
8. 增加成功、非法输入、越界、失败和并发策略测试。
9. 验证 SSE 事件、Java 持久化和 Electron 展示。

## 10. 验收矩阵

- Python：工具注册、重复检测、Schema、语义校验、风险 metadata、路径边界、超时和
  执行结果。
- Java：Python DTO 映射、工作记录累积、数据库迁移与消息恢复。
- Electron：SSE 映射、Store 恢复、折叠摘要、调用详情、进行中动画和失败态。
- 人工联调：模型完成 list/search/read/patch/write/shell 链路；面对大文件时先定位再读取，
  最终回答与磁盘实际结果一致。
