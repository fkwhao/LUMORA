# LUMORA Desktop

Electron、React 和 TypeScript 桌面应用。

## 职责

- 管理桌面窗口和应用生命周期。
- 通过 Preload 白名单 API 向 Renderer 暴露任务、模型、Memory、MCP 和用量查询能力。
- 展示任务计划、对话流、审批、工具执行、Hosted Web Search、Diff 和 Artifact。
- 提供可调整的会话上下文统计侧边栏，展示活动上下文、累计 Token 明细和本地估算细分。
- 在个人资料页展示本机 Token 汇总、每日活动热力图、缓存指标和请求/会话数量。
- 管理本地任务归档与恢复、会话分支、模型连接、MCP 配置、个性化和应用外观偏好。

## 边界

- Renderer 不得直接访问 Node.js、REST/SSE、后端端口或启动令牌。
- 本工程不得导入 `core/` 或 `agent/` 的源码。
- Renderer 与 Main 的能力通过 `shared/` 下的领域契约和 Preload 白名单定义。
- 侧边栏宽度、折叠状态等显示偏好可以保存在本机；任务、消息、用量和远程能力配置仍以 Java Core 为事实来源。

## 开发

```powershell
pnpm install
pnpm start
```

复制 `config/dev-local.example.yml` 为 `config/dev-local.yml`，配置 Java 地址和
本机开发令牌；真实配置文件已被 Git 忽略。开发入口使用 `RestTaskGateway`
和 SSE 连接 Java，因此创建任务前需要先启动 Java；完整规划和模型对话还需要启动
Python Agent。Renderer 不直接接触后端 URL、启动令牌或模型 API Key。

开发阶段由 IDE 分别启动 Python Agent、Java Core 和 Electron。正式打包后，
Electron Main 再负责启动、监控和关闭随应用分发的 Java 与 Python 运行时。

## 验证

```powershell
pnpm test
pnpm typecheck
pnpm package
```
