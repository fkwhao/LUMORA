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

构建和测试命令将在桌面工程脚手架建立后补充。

