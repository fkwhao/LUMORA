# LUMORA Protocol

LUMORA 跨进程接口的唯一协议源。

## 职责

- 定义 Electron Main 与 Java Local Core 的 gRPC 接口。
- 定义 Java Local Core 与 Python Agent Runtime 的 gRPC 接口。
- 生成 TypeScript、Java 和 Python 强类型代码。
- 检查协议格式和破坏性变更。

协议包使用 `lumora.v1` 命名空间。运行时不得共享业务源码，只能依赖生成的协议代码。

## 目录

```text
proto/lumora/v1/common.proto  公共认证、健康检查和错误
proto/lumora/v1/core.proto    任务、事件、审批和 CoreService
proto/lumora/v1/agent.proto   规划消息和 AgentService
```

## 检查

不依赖外部工具的结构检查：

```powershell
powershell -ExecutionPolicy Bypass -File protocol/tests/contract-shape.ps1
```

配置 Buf CLI 后执行完整 Lint 和代码生成：

```powershell
powershell -ExecutionPolicy Bypass -File protocol/generate.ps1
```
