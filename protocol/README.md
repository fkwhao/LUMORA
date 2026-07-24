# LUMORA Protocol

LUMORA 跨进程接口的唯一协议源。

## 职责

- 定义 Electron Main 与 Java Local Core 的 gRPC 接口。
- 定义 Java Local Core 与 Python Agent Runtime 的 gRPC 接口。
- 生成 TypeScript、Java 和 Python 强类型代码。
- 检查协议格式和破坏性变更。

协议包使用 `lumora.v1` 命名空间。运行时不得共享业务源码，只能依赖生成的协议代码。

生成和检查命令将在协议任务完成后补充。

