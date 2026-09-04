# MCP 能力接入

本版通过官方 Python SDK v2 支持远程 **Streamable HTTP** 和 Windows 本地
**stdio** MCP Server 的 `Tools`、`Resources`、Resource Templates 与 `Prompts`。
两种 Transport 进入同一能力适配、权限审批和结果保护链路。

## 运行链路

1. 用户在桌面端“设置 → MCP”选择 Streamable HTTP 或 stdio。HTTP 保存 URL 和可选静态认证；stdio 保存命令、逐项参数、可选绝对工作目录和环境变量。
2. Java Core 将配置以 `mcp.servers` JSON 写入 `application_setting`，作为唯一持久化来源。HTTP 凭据与整组 stdio 环境变量使用 Windows DPAPI 加密；列表接口只返回是否已配置及环境变量名称。
3. 发起对话时，Java Core 只把已启用 Server 的运行时配置传给 Python Agent；密文只在本机进程间请求前短暂解密，Python 不落盘。
4. Python 先按当前用户请求选择相关 Server；启用仅表示能力可用，不会每轮无条件连接或启动进程。官方 SDK v2 使用自动协商，优先现代协议并在 Server 不支持时回退到旧版初始化。后续 Turn（包括暂停续接）按任务 ID 与完整配置指纹复用 Session 和工具目录；多个 Server 并行准备。
5. Tools 按 `mcp__{serverId}__{toolName}` 注册；Resources/Prompts 只有在当前请求明确涉及相应 MCP 能力时，才通过 `mcpmeta__{serverId}__*` 只读桥接工具提供给 Agent。
6. 所有 MCP 调用继续经过 LUMORA 现有的输入校验、权限判断、智能审批、执行事件和结果展示。

Session Pool 采用引用计数和有界空闲淘汰：活动 Turn 持有租约时不能被关闭；Transport、URL、命令、参数、工作目录、环境或认证变化会产生新键，不会错误复用旧连接；应用退出时统一关闭剩余 Session。该池只复用传输和能力发现，不缓存工具调用结果，也不会自动重试可能产生副作用的 MCP 工具。

MCP 配置是全局能力，不依赖当前会话是否选择工作区。没有工作区时，请求级 Tool Registry 仍可注册相关 MCP 工具，但不暴露 LUMORA 自带的文件、Shell 或 Artifact 工具。

未明确标注 `readOnlyHint: true` 的 MCP 工具按潜在写操作处理。Server 提供的 annotations 只作为风险提示，不能绕开现有权限系统。

Resources 和 Prompts 的返回值属于不可信 MCP 内容，只能作为任务上下文，不能覆盖
LUMORA System Prompt、权限策略或审批结论。

## Windows stdio 边界

stdio 命令与参数分开传给 SDK，不由 LUMORA 拼接成 shell 字符串；Windows 对
`.cmd`/`.bat` 仍可能使用系统命令解释器。SDK 会把子进程加入 Windows Job Object，
Session 关闭、取消或应用退出时停止进程树，并把有界 stderr 尾部用于脱敏诊断。

stdio Server 是用户明确配置的受信任本地程序。它仍以当前 Windows 用户权限运行，
不受 LUMORA 工作区路径校验或 OS 沙箱约束，而且启动本身可能产生副作用。权限审批覆盖
Agent 发起的工具调用，不能限制 Server 自身的启动代码。敏感值应放在 DPAPI 加密的环境
变量中，不应写进命令或参数。

## 静态认证

Streamable HTTP 设置支持以下方式：

- 无认证
- Bearer Token（`Authorization: Bearer ...`）
- API Key Header（默认 `X-API-Key`，可改名）
- 自定义认证 Header

认证 Header 禁止覆盖 `Host`、`Content-Type`、`Authorization`（Bearer 模式除外）、
`MCP-Protocol-Version`、`MCP-Session-Id` 等传输层保留 Header。当前不支持 OAuth
授权码流程、动态客户端注册或令牌刷新。

## 当前范围

- SDK：官方 `mcp>=2.1,<3`，Client 自动协商现代协议并兼容旧版初始化
- 传输：Streamable HTTP 单端点、Windows stdio
- 能力：Tools、Resources、Resource Templates、Prompts；列表分页有页数、总量和重复游标限制
- 工具结果：保留结构化内容、非文本 Content 与 `_meta`，并验证声明的输出 Schema
- 暂不支持：OAuth、MCP Apps UI、Resources 订阅、能力变更通知、Server 市场和云端托管

测试 Server 位于 `F:\project\LUMORA\MCP_server_for_test`，使用 Java 21 编写，
同时暴露静态认证、`echo` Tool、静态/模板 Resource 和参数化 Prompt。Agent 测试另会
启动一个真实 Python stdio Server，验证环境变量传递、工具发现、调用和进程关闭。
