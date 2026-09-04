# LUMORA 开发环境

## 独立打开工程

- IntelliJ IDEA：打开 `core/`，配置 JDK 21 和 Maven。
- PyCharm：打开 `agent/`，配置 Python 3.12，将工程根目录加入 Sources Root。
- WebStorm 或 VS Code：打开 `desktop/`，使用 Node 24 和 pnpm 11。

三个工程禁止互相导入源码。Renderer 通过 Preload IPC 调 Electron Main，Main 通过
REST + SSE 调 Java；Java 通过本机 REST 调 Python Agent。

## 本机开发配置

三个工程各自维护一个仅限本机的开发 YAML。先复制对应示例文件：

```text
agent/config/dev-local.example.yml
  → agent/config/dev-local.yml
core/src/main/resources/application-dev-local.example.yml
  → core/src/main/resources/application-dev-local.yml
desktop/config/dev-local.example.yml
  → desktop/config/dev-local.yml
```

真实 YAML 已被 Git 忽略。开发时让 Java 与 Python 使用相同的 Agent 令牌，让
Electron 与 Java 使用相同的 Core 令牌；令牌至少 32 个字符，不写入已提交的示例
配置。端口和服务地址也在这些本地 YAML 中维护。

模型连接通过桌面端“设置 → 模型与 API”配置。“账号与套餐”区域承载可选登录、只读套餐/额度/用量
和 LUMORA 托管模型选择；购买、续费、充值和套餐管理只通过系统默认浏览器进入网页用户控制台，
网页端独立登录。“自定义供应商”支持保存多条 BYOK 配置，并从中启用一条作为当前聊天连接；
未登录可以使用 BYOK，登录后也仍可在套餐和自定义供应商之间显式切换。
套餐模式下首页和会话中的模型列表取当前套餐版本允许模型与 Cloud 已发布模型目录的交集，且不会混入
本地供应商模型；套餐运行投影固定使用 `lumora-cloud` 内部适配器，不在套餐模型选择界面暴露上游协议。
Desktop Cloud API 和网页控制台地址分别由 `desktop/config/dev-local.yml` 的 `cloud-api-url` 与
`cloud-console-url` 配置；省略时使用本机 `46100` 与 `5175` 开发端口。Access Token 仅驻留 Electron
Main 内存，Refresh Token 使用 Electron `safeStorage` 加密后写入用户数据目录。官方模型请求由
Java Core/Python Agent 访问 Electron Main 的随机 loopback 代理，不向 Renderer 或本地服务下发云端 Token。
供应商名称、Base URL、默认模型指针和 API 格式等非敏感字段，以及经过
Windows DPAPI 加密的 API Key 密文，统一写入 Java SQLite。Python 只在当前模型请求
中临时接收明文，不保存到 YAML、日志或数据库。旧的
`agent/config/model-local.yml` 已不再使用。

用户可编辑的本地 API 格式支持 `anthropic`、`chat-completions` 和 `responses`。Python Runtime 的
`RoutingModelProvider` 会按该值分别调用 `/messages`、`/chat/completions` 或 `/responses`；
三种适配器共用 Agent Harness、工具循环、审批、上下文压缩和 TokenUsage 归一化链路。
官方套餐另有不可编辑的 `lumora-cloud` 适配器，经 Electron loopback 代理调用 Cloud 的 LUMORA Internal
Protocol v1 统一入口；它不改变、替换或降级上述任何本地 Provider。

每个自定义供应商可以保存多个模型 ID。上下文窗口和最大输出 Token 属于模型配置，
不属于供应商公共字段；最大输出 Token 会映射为所选协议对应的请求字段。
设置页获取模型目录后会补齐本地模型记录，并允许逐项测试连接、编辑或删除。供应商可
显式禁用；没有启用供应商时，聊天请求会提示先配置模型 API。

Hosted Web Search 按模型显式开启：Responses 与 Anthropic 当前支持，Chat Completions 暂不
启用。官方套餐模式下该开关来自 Cloud 已发布模型能力，由 Model Gateway 执行供应商托管搜索并把
搜索进度和引用来源转换为统一事件；本地 BYOK 行为不变。MCP Server 在“设置 → MCP”维护，
当前通过官方 Python SDK v2 支持 Streamable HTTP、Windows stdio、HTTP 静态认证以及
Tools/Resources/Resource Templates/Prompts。stdio 环境变量由 Core 使用 DPAPI 加密；
本地 Server 进程仍以当前 Windows 用户权限运行。OAuth 与 MCP Apps 尚未接入。

## Python

```powershell
cd agent
python -m pip install -r requirements-dev.txt
$env:PYTHONPATH = (Resolve-Path '.').Path
python -m unittest discover -s tests -v
python -m ruff check app tests
python -m mypy app
python -m app.main
```

## Java

```powershell
cd core
mvn -N wrapper:wrapper
mvn test
```

在 IntelliJ IDEA 的 Spring Boot 启动配置中启用 `dev-local` Profile。

## Electron

```powershell
cd desktop
pnpm install
pnpm start
```

推荐启动顺序为 Python Agent、Java Core、Electron。`desktop` 在 Java 尚未启动
时仍可打开窗口，但创建任务会返回连接错误；Main 使用 `RestTaskGateway`，
`DemoTaskGateway` 只用于独立界面演示和测试。Renderer 不接触 URL 或令牌。

真实任务链路为：

```text
Electron Renderer → Preload IPC → Electron Main
  → Java REST → Python Agent REST
  → Java 将任务与计划步骤写入 SQLite
  → Java REST 响应 → Electron 展示计划
```

## 统一验证

功能完成后可统一运行跨工程验证。不编译 Java、不重新打包 Electron：

```powershell
powershell -ExecutionPolicy Bypass -File integration/verify.ps1
```

配置 JDK 21、Maven 后：

```powershell
powershell -ExecutionPolicy Bypass -File integration/verify.ps1 -IncludeJava
```
