# LUMORA Agent Runtime

Python 3.12 Agent 推理与编排运行时。

## 职责

- 任务规划和 Agent 状态图。
- Chat Completions、OpenAI Responses、Anthropic Messages 三种协议适配，
  对话流式响应和模型设置。
- 后续 Agent Harness、动态编排和中断恢复。
- 文档理解与结果验证能力边界。
- 通过 REST 接收 Java 的规划请求并返回结构化计划步骤。

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
app/service/           Agent 规划与编排业务
app/model/             Pydantic 数据模型
app/provider/          模型供应商适配、流式事件转换与独立 Agent 工具循环
app/prompt/            分层 System Prompt、动态上下文和模板装配
app/tool/              工具工厂、注册中心和受工作区限制的内置工具
app/config/            YAML 运行配置
app/exception/         运行时异常
app/main.py            FastAPI 与 Uvicorn 生命周期
```

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
