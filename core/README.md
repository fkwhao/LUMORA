# LUMORA Local Core

Java 21、Spring Boot、MyBatis-Plus 和 SQLite 本地核心。

## 职责

- 管理任务、工作空间、审批和审计。
- 持久化本地状态。
- 承载文件、浏览器和 Windows 工具边界。
- 管理 Python Agent Runtime 生命周期。
- 向 Electron Main 提供本机 REST API 和 SSE 任务事件流。
- 通过 gRPC 调用 Python Agent Runtime，并为后续受控工具服务保留 gRPC 边界。

## 边界

- 本工程不得导入 `desktop/` 或 `agent/` 的源码。
- 调用 Python 必须通过 `protocol/` 生成的 gRPC Client。
- REST DTO、数据库实体和 Protobuf 消息相互分离。

## 代码结构

```text
controller/      REST 与 SSE 入口，只做参数和 DTO 转换
dto/             REST 请求与响应对象
entity/          与 SQLite 表对应的普通 Java class
service/         业务接口
service/impl/    状态规则、审批校验和事务
mapper/          MyBatis-Plus Mapper 接口
mapper/typehandler/
                 SQLite 特有的字段类型转换
grpc/client/     Java 调用 Python Agent
config/          Spring 配置
exception/       业务异常和统一 REST 异常响应
security/        本机 REST 启动令牌校验
```

基础 CRUD 由 MyBatis-Plus `BaseMapper` 提供；复杂查询需要手写 SQL 时，再放入
`src/main/resources/mapper/`。SQLite 的 `TEXT` 时间列统一通过
`SqliteInstantTypeHandler` 按 ISO-8601 格式读写。Controller 不写业务规则，
Mapper 不判断状态转换。

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
