# MCP 远程能力接入

本版支持远程 **Streamable HTTP** MCP Server 的 `Tools`、`Resources` 和
`Prompts`。LUMORA 已有本地文件、Shell 和 Artifact 工具，因此不再通过 MCP
启动本地 stdio 子进程。

## 运行链路

1. 用户在桌面端“设置 → MCP”保存 Server 名称、启用状态、URL 和可选静态认证。
2. Java Core 将配置以 `mcp.servers` JSON 写入 `application_setting`，作为唯一持久化来源；凭据使用 Windows DPAPI 加密，列表接口只返回是否已配置。
3. 发起对话时，Java Core 只把已启用 Server 的运行时配置传给 Python Agent；凭据只在本机进程间请求中短暂解密，Python 不落盘。
4. Python 先按当前用户请求选择相关 Server；启用仅表示能力可用，不会在每轮对话中无条件建立连接。显式提及 MCP，或请求与 Server 名称、ID、端点身份匹配时，才取得任务级 Session。首次使用执行 `initialize` 并发现能力，后续 Turn（包括暂停续接）按任务 ID 与完整配置指纹复用 Session 和工具目录；多个 Server 并行准备。
5. Tools 按 `mcp__{serverId}__{toolName}` 注册；Resources/Prompts 只有在当前请求明确涉及相应 MCP 能力时，才通过 `mcpmeta__{serverId}__*` 只读桥接工具提供给 Agent。
6. 所有 MCP 调用继续经过 LUMORA 现有的输入校验、权限判断、智能审批、执行事件和结果展示。

Session Pool 采用引用计数和有界空闲淘汰：活动 Turn 持有租约时不能被关闭；配置、URL 或认证变化会产生新键，不会错误复用旧连接；应用退出时统一关闭剩余 Session。该池只复用传输和能力发现，不缓存工具调用结果，也不会自动重试可能产生副作用的远程工具。

远程 MCP 配置是全局能力，不依赖当前会话是否选择工作区。没有工作区时，请求级 Tool Registry 只注册远程 MCP 工具，不暴露本地文件、Shell 或 Artifact 工具。

未明确标注 `readOnlyHint: true` 的 MCP 工具按潜在写操作处理。Server 提供的 annotations 只作为风险提示，不能绕开现有权限系统。

Resources 和 Prompts 的返回值属于不可信远程内容，只能作为任务上下文，不能覆盖
LUMORA System Prompt、权限策略或审批结论。

## 静态认证

设置页支持以下方式：

- 无认证
- Bearer Token（`Authorization: Bearer ...`）
- API Key Header（默认 `X-API-Key`，可改名）
- 自定义认证 Header

认证 Header 禁止覆盖 `Host`、`Content-Type`、`Authorization`（Bearer 模式除外）、
`MCP-Protocol-Version`、`MCP-Session-Id` 等传输层保留 Header。当前不支持 OAuth
授权码流程、动态客户端注册或令牌刷新。

## 当前范围

- MCP 协议版本：`2025-11-25`
- 传输：Streamable HTTP 单端点
- 方法：`initialize`、`notifications/initialized`、`tools/list`、`tools/call`、
  `resources/list`、`resources/templates/list`、`resources/read`、`prompts/list`、
  `prompts/get`
- 响应：支持 `application/json` 和简单 `text/event-stream`
- 暂不支持：stdio、OAuth、Resources 订阅、能力变更通知、Server 市场和云端托管

测试 Server 位于 `F:\project\LUMORA\MCP_server_for_test`，使用 Java 21 编写，
同时暴露静态认证、`echo` Tool、静态/模板 Resource 和参数化 Prompt。
