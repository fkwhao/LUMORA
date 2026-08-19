# LUMORA Agent Runtime

Python 3.12 Agent 推理与编排运行时。

## 职责

- Agent Harness、动态计划、模型—工具循环和上下文压缩。
- Supervisor 通过 `delegate_task` 启动独立、一次性的完整能力子 Agent Session；子 Agent 继承本次请求实际可见的文件、Shell、MCP、Skill 与委派工具，其生命周期、可见步骤、用量和最终回报通过统一 RunEvent 实时上报。
- Chat Completions、OpenAI Responses、Anthropic Messages 三种协议适配，
  对话流式响应、TokenUsage 归一化和模型设置。
- 文件、PDF 分页读取/检索、Shell、Artifact 与远程 MCP 工具注册、结果保护和权限执行。
- 确定性权限分级、自动审批 Reviewer 和人工审批暂停/恢复。
- Responses 与 Anthropic 的供应商托管 Web Search 事件和来源转换。
- 通过 REST/SSE 接收 Java 的会话请求并返回统一运行事件。
- 通过独立运行控制端点协作式结束当前 Turn；已启动工具在安全边界收尾，
  Python 不长期保留被冻结的协程或模型连接。
- 以不可见 `protocol_message` 输出完整 Assistant/Tool 轨迹；未派发工具在暂停封口时
  获得结构化终止结果，下一 Turn 可直接恢复供应商原生消息。
- 远程 MCP Session 按任务和配置指纹进入引用计数池，跨 Turn 复用连接与能力目录。

## 边界

- 本工程不得导入 `desktop/` 或 `core/` 的源码。
- 文件和命令工具由 Tool Registry 在 Java 授权的工作区与工具白名单内执行。
- 不获得任意磁盘、无限制 Shell、浏览器或系统凭据权限。

## IDE 配置

在 IDE 中选择 Python 3.12，并以 `requirements-dev.txt` 安装开发依赖。将
`agent/` 工程根目录加入 Sources Root。

```powershell
python -m pip install -r requirements-dev.txt
```

## 代码结构

```text
app/controller/http/   REST 请求、认证和错误转换
app/dto/               REST 请求与响应模型
app/security/          本机启动令牌校验
app/harness/           Agent 生命周期、模型—工具循环、运行事件和 Provider Port
app/execution/         工具调用、审批衔接、Artifact 外置和模型输入保护
app/service/           会话、MCP、Memory 等应用用例
app/model/             Pydantic 数据模型
app/provider/          三种模型协议适配、路由、流式事件和 TokenUsage 归一化
app/prompt/            分层 System Prompt、动态上下文和模板装配
app/tool/              工具工厂、注册中心和受工作区限制的内置工具
app/permission/        分层权限策略、Shell 分类与自动 Reviewer
app/mcp/               远程 Streamable HTTP MCP 客户端和能力适配
app/subagent/          Supervisor 委派工具、子 Session 边界和事件投影
app/config/            YAML 运行配置
app/exception/         运行时异常
app/main.py            FastAPI 与 Uvicorn 生命周期
```

不同任务的 Run 可以并发进入 Agent Runtime；同一模型步骤内显式标记安全的兄弟工具也会进入
默认上限为 10 的滚动并发池，非安全工具形成独占屏障，结果仍按模型顺序提交。所有 Run 共享
文件级资源协调：读取可共享，同文件写入独占，Shell 在调用期间作为工作区屏障。完整文件
覆盖还会校验该任务最后读取的版本，避免另一个任务修改后被旧内容覆盖。设计边界见
[任务并发与资源感知设计](../docs/cross-task-concurrency-design.md)。

`delegate_task` 是只负责建立 Session 的并发安全控制面调用，本身不直接产生文件或外部副作用；
真正的副作用由子 Agent 后续工具调用逐项进入权限引擎。每个子 Agent 只有一条自包含用户消息和
独立模型历史，但继承父请求实际暴露的工具表，可以修改文件、执行 Shell、调用 MCP 或继续委派。
子 Session 与主 Run 共用审批关联 ID，另用 `sessionId` 和 `agentId` 区分执行身份；委派深度最多
3 层，全局活动子 Agent 数沿用请求并发上限。子用量作为 `usageDelta` 合入父 Run，完整设计和
后续可续接 Session 规划见
[Supervisor 多 Agent 设计](../docs/supervisor-multi-agent-design.md)。

PDF 附件通过当前 Run 的 `attachmentId` 暴露给 `read_pdf` 和 `search_pdf`，不把任意绝对路径
开放给模型。解析结果只进入当前工具结果，不建立向量索引、缓存文件或第二份持久化附件；
扫描版 PDF 会明确返回需要 OCR，避免把空文本误判为已成功读取。

## 测试

未安装项目开发依赖时，可以使用 Python 3.12 标准库运行核心测试：

```powershell
$env:PYTHONPATH = "$(Resolve-Path agent)"
python -m unittest discover -s agent/tests -v
```

安装开发依赖后运行完整检查：

```powershell
cd agent
$env:PYTHONPATH = (Resolve-Path '.').Path
python -m unittest discover -s tests -v
python -m ruff check app tests
python -m mypy app
```

## 启动

复制 `config/dev-local.example.yml` 为 `config/dev-local.yml`，配置监听地址、端口、
协议版本和至少 32 个字符的本机开发令牌。模型配置由 Java Local Core 管理：
API Key 使用 Windows DPAPI 加密后写入 SQLite。Java 只在调用模型时通过已认证的
localhost 请求临时传给 Python，Python 不保存 API Key。

启动命令：

```powershell
python -m app.main
```

## 模型 API 协议适配

模型供应商的 `apiFormat` 会从 Desktop/Core 原样传入 Python，由
`RoutingModelProvider` 选择协议适配器：

- `chat-completions`：`/chat/completions`
- `responses`：`/responses`
- `anthropic`：`/messages`

三种适配器统一输出内部 `ProviderTurn` / `ProviderTurnEvent`，Agent Harness、上下文压缩和
审批 Reviewer 不感知外部协议差异。新增协议时只需注册新的 Provider 适配器，不再修改业务
编排代码。`apiFormat` 缺省为 `chat-completions`，以兼容已有供应商记录。
每个协议适配器懒创建一个可并发复用的 `httpx.AsyncClient`，空闲连接保留 120 秒，
工具循环内的后续模型回合不再每次重新建立 TCP/TLS。应用关闭时由 `RoutingModelProvider`
统一释放连接池；请求超时、流式取消和错误重试语义保持不变。

## 自动审批 Reviewer

界面选择“替我审批”后，风险工具会先经过 Python 内置的确定性分级。单条且路径不越出
工作区的常见只读命令、版本查询、测试、lint、typecheck 和构建命令直接允许，不请求模型；
命令拼接、管道、重定向、变量或子命令展开、写入命令和无法可靠识别的 Shell 调用才交给
Reviewer。项目测试与构建会执行仓库代码，因此只应在可信工作区中使用；团队可以用下方
YAML 规则继续收紧或覆盖快速分级结果。

分级器的命令集、验证任务和禁止参数集中维护在
[`app/permission/default_shell_policy.yaml`](app/permission/default_shell_policy.yaml)。
灾难性删除、关机/格式化、Shell 组合与工作区路径边界是安全不变量，保留在代码中且不能
通过该配置放宽。普通权限覆盖规则仍使用 `permissions.yaml`。

Reviewer 复用当前任务选择的 API 协议、API Key 和模型，不要求接入任何第三方 Agent
SDK；它没有工具权限，只能对当前调用返回 `allow_once`、`deny` 或 `require_human`。工作区内
创建新文件也由确定性低风险规则直接允许；覆盖已有文件等灰区才调用 Reviewer。模型接口或
输出异常会自动重试一次，连续失败时阻止本次调用，并在界面标明“智能审批暂不可用，本次
未执行”。“替我审批”不会创建人工审批弹窗；主 Agent 会改用更安全的替代方案，或在最终
回答中说明未执行项。只有“请求审批”模式会暂停等待用户选择。

Reviewer 或人工点击“拒绝”都不会落盘成永久拒绝；为避免循环，同一次 Agent 运行中完全
相同的已拒绝调用会直接跳过，新任务中仍会重新评估。只有显式写入 `permissions.yaml` 的
`deny` 才会持续生效。

确定性规则写在以下 YAML 文件，格式参考
[`config/permissions.example.yaml`](config/permissions.example.yaml)：

```text
~/.lumora/permissions.yaml
{workspace}/.lumora/permissions.yaml
{workspace}/.lumora/permissions.local.yaml
```

Reviewer 的自然语言业务策略参考
[`config/approval-reviewer.example.md`](config/approval-reviewer.example.md)，可放在：

```text
~/.lumora/approval-reviewer.md
{workspace}/.lumora/approval-reviewer.md
{workspace}/.lumora/approval-reviewer.local.md
```

硬拒绝和工作区外路径检查始终优先；YAML 的 `deny` / `ask` 也不会被 Reviewer 覆盖。

## MCP

Agent 只连接由 Java Core 在当前请求中提供的远程 Streamable HTTP MCP Server。
MCP 配置在桌面端设置中维护，静态 Bearer/API Key/自定义 Header 凭据由 Core 使用
Windows DPAPI 加密，Python 仅在当前请求内使用且不持久化。

发现的 MCP Tools 会注册到当前请求的 Tool Registry，并继续经过现有权限与审批链路。
Resources、Resource Templates 与 Prompts 会以只读桥接工具提供给 Agent；远程返回内容
视为不可信上下文，不能覆盖系统指令和权限策略。当前不启动本地 stdio Server，也不实现
OAuth、资源订阅或能力变更通知。完整边界见
[`docs/mcp-runtime-design.md`](../docs/mcp-runtime-design.md)。
