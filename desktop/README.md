# LUMORA Desktop

Electron、React 和 TypeScript 桌面应用。

## 职责

- 管理桌面窗口和应用生命周期。
- 由 Electron Main 启动并监控 Java Local Core。
- 通过 Preload 白名单 API 向 Renderer 暴露任务能力。
- 展示任务、进度、审批和结果。

## 边界

- Renderer 不得直接访问 Node.js、gRPC、后端端口或启动令牌。
- 本工程不得导入 `core/` 或 `agent/` 的源码。
- 跨进程类型必须由 `protocol/` 生成。

## 开发

```powershell
pnpm install
pnpm start
```

当前 Main 使用 `DemoTaskGateway` 跑通界面和审批流程。接入 Java Core 时只替换
`TaskGateway` 实现，Renderer 和 Preload API 保持不变。

## 验证

```powershell
pnpm test
pnpm typecheck
pnpm package
```
