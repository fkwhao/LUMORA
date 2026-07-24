# LUMORA 开发环境

## 独立打开工程

- IntelliJ IDEA：打开 `core/`，配置 JDK 21 和 Maven。
- PyCharm：打开 `agent/`，配置 Python 3.12，将工程根目录和 `generated/` 加入 Sources Root。
- WebStorm 或 VS Code：打开 `desktop/`，使用 Node 24 和 pnpm 11。

三个工程禁止互相导入源码。Renderer 通过 Preload IPC 调 Electron Main，Main 通过
REST + SSE 调 Java；Java 与 Python 只通过 `protocol/` 中的 gRPC 接口通信。

## 协议

配置 Buf CLI 后执行：

```powershell
powershell -ExecutionPolicy Bypass -File protocol/generate.ps1
```

该命令生成 Python 协议代码。Java 协议代码由 `core/pom.xml` 的
Protobuf Maven Plugin 在 Maven 构建期间生成。

## Python

```powershell
cd agent
python -m pip install -r requirements-dev.txt
$env:PYTHONPATH = (Resolve-Path '.').Path
python -m unittest discover -s tests -v
python -m ruff check app tests
python -m mypy app
```

## Java

```powershell
cd core
mvn -N wrapper:wrapper
mvn test
```

## Electron

```powershell
cd desktop
pnpm install
pnpm start
```

`desktop` 当前使用 `DemoTaskGateway`，可以在 Java 尚未启动时演示任务和审批流程。
Java 启动并向 Main 提供 `LUMORA_CORE_URL` 与 `LUMORA_STARTUP_TOKEN` 后，
Main 自动切换为 `RestTaskGateway`。Renderer 不接触 URL 或令牌。

## 统一验证

不编译 Java、不重新打包 Electron：

```powershell
powershell -ExecutionPolicy Bypass -File integration/verify.ps1
```

配置 JDK 21、Maven 后：

```powershell
powershell -ExecutionPolicy Bypass -File integration/verify.ps1 -IncludeJava
```
