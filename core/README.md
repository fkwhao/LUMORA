# LUMORA Local Core

Java 21、Spring Boot、MyBatis 和 SQLite 本地核心。

## 职责

- 管理任务、工作空间、审批和审计。
- 持久化本地状态。
- 承载文件、浏览器和 Windows 工具边界。
- 管理 Python Agent Runtime 生命周期。
- 向 Electron Main 提供本机 gRPC 服务。

## 边界

- 本工程不得导入 `desktop/` 或 `agent/` 的源码。
- 调用 Python 必须通过 `protocol/` 生成的 gRPC Client。
- 领域对象、数据库实体和 Protobuf 消息相互分离。

构建和测试命令将在 Java 工程脚手架建立后补充。

