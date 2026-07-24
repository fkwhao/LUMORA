# LUMORA Desktop

Electron、React 和 TypeScript 桌面应用。

## 职责

- 管理桌面窗口和应用生命周期。
- 由 Electron Main 启动并监控 Java Local Core。
- 通过 Preload 白名单 API 向 Renderer 暴露任务能力。
- 展示任务、进度、审批和结果。

## 边界

- Renderer 不得直接访问 Node.js、REST/SSE、后端端口或启动令牌。
- 本工程不得导入 `core/` 或 `agent/` 的源码。
- Renderer 与 Main 的能力通过 `shared/task-contract.ts` 和 Preload 白名单定义。

## 开发

```powershell
pnpm install
pnpm start
```

Java 未启动时，Main 使用 `DemoTaskGateway` 跑通界面和审批流程。配置
`LUMORA_CORE_URL=http://127.0.0.1:<port>` 和 `LUMORA_STARTUP_TOKEN` 后，
Main 使用 `RestTaskGateway` 和 SSE 连接 Java。Renderer 和 Preload API 保持不变。

## 验证

```powershell
pnpm test
pnpm typecheck
pnpm package
```
