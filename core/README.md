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

## IDE 配置

使用 IntelliJ IDEA 单独打开 `core/`，将 Project SDK 和 Maven Runner JRE 设置为
JDK 21。Maven 会从 `../protocol/proto` 生成 Java 和 gRPC 源码。

当前仓库只保存 Maven Wrapper 配置。你在 IDE 中配置 Maven 后可执行：

```powershell
mvn -N wrapper:wrapper
```

该命令会生成完整的 Wrapper 脚本和所需文件。

## 测试

```powershell
mvn test
```

未配置 JDK 21 时，可从仓库根目录运行不编译源码的结构检查：

```powershell
powershell -ExecutionPolicy Bypass -File integration/tests/java-scaffold.ps1
```
