# LUMORA Desktop

Electron、React 和 TypeScript 桌面应用。

## 职责

- 管理桌面窗口和应用生命周期。
- 通过 Preload 白名单 API 向 Renderer 暴露任务能力。
- 展示 Python 生成并由 Java 持久化的真实任务计划、进度、审批和结果。

## 边界

- Renderer 不得直接访问 Node.js、REST/SSE、后端端口或启动令牌。
- 本工程不得导入 `core/` 或 `agent/` 的源码。
- Renderer 与 Main 的能力通过 `shared/task-contract.ts` 和 Preload 白名单定义。

## 开发

```powershell
pnpm install
pnpm start
```

复制 `config/dev-local.example.yml` 为 `config/dev-local.yml`，配置 Java 地址和
本机开发令牌；真实配置文件已被 Git 忽略。开发入口使用 `RestTaskGateway`
和 SSE 连接 Java，因此创建任务前需要先启动 Java。`DemoTaskGateway` 只保留给
独立界面演示和测试使用。Renderer 和 Preload API 保持不变。

开发阶段由 IDE 分别启动 Python Agent、Java Core 和 Electron。正式打包后，
Electron Main 再负责启动、监控和关闭随应用分发的 Java 与 Python 运行时。

## 验证

```powershell
pnpm test
pnpm typecheck
pnpm package
```
