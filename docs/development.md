# LUMORA 开发环境

## 独立打开工程

- IntelliJ IDEA：打开 `core/`，配置 JDK 21 和 Maven。
- PyCharm：打开 `agent/`，配置 Python 3.12，并将 `generated/` 加入 Sources Root。
- WebStorm 或 VS Code：打开 `desktop/`，使用 Node 24 和 pnpm 11。

三个工程禁止互相导入源码。联合调试只通过 `protocol/` 中的 gRPC 接口通信。

## 协议

配置 Buf CLI 后执行：

```powershell
powershell -ExecutionPolicy Bypass -File protocol/generate.ps1
```

## Python

```powershell
cd agent
python -m pip install -e ".[dev]"
python -m pytest -q
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

## 统一验证

不编译 Java、不重新打包 Electron：

```powershell
powershell -ExecutionPolicy Bypass -File integration/verify.ps1
```

配置 JDK 21、Maven 后：

```powershell
powershell -ExecutionPolicy Bypass -File integration/verify.ps1 -IncludeJava
```
