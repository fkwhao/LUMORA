# LUMORA 开发环境

## 独立打开工程

- IntelliJ IDEA：打开 `core/`，配置 JDK 21 和 Maven。
- PyCharm：打开 `agent/`，配置 Python 3.12，将工程根目录加入 Sources Root。
- WebStorm 或 VS Code：打开 `desktop/`，使用 Node 24 和 pnpm 11。

三个工程禁止互相导入源码。Renderer 通过 Preload IPC 调 Electron Main，Main 通过
REST + SSE 调 Java；Java 通过本机 REST 调 Python Agent。

## 本机开发配置

三个工程各自维护一个仅限本机的开发 YAML。先复制对应示例文件：

```text
agent/config/dev-local.example.yml
  → agent/config/dev-local.yml
core/src/main/resources/application-dev-local.example.yml
  → core/src/main/resources/application-dev-local.yml
desktop/config/dev-local.example.yml
  → desktop/config/dev-local.yml
```

真实 YAML 已被 Git 忽略。开发时让 Java 与 Python 使用相同的 Agent 令牌，让
Electron 与 Java 使用相同的 Core 令牌；令牌至少 32 个字符，不写入已提交的示例
配置。端口和服务地址也在这些本地 YAML 中维护。

## Python

```powershell
cd agent
python -m pip install -r requirements-dev.txt
$env:PYTHONPATH = (Resolve-Path '.').Path
python -m unittest discover -s tests -v
python -m ruff check app tests
python -m mypy app
python -m app.main
```

## Java

```powershell
cd core
mvn -N wrapper:wrapper
mvn test
```

在 IntelliJ IDEA 的 Spring Boot 启动配置中启用 `dev-local` Profile。

## Electron

```powershell
cd desktop
pnpm install
pnpm start
```

推荐启动顺序为 Python Agent、Java Core、Electron。`desktop` 在 Java 尚未启动
时仍可打开窗口，但创建任务会返回连接错误；Main 使用 `RestTaskGateway`，
`DemoTaskGateway` 只用于独立界面演示和测试。Renderer 不接触 URL 或令牌。

真实任务链路为：

```text
Electron Renderer → Preload IPC → Electron Main
  → Java REST → Python Agent REST
  → Java 将任务与计划步骤写入 SQLite
  → Java REST 响应 → Electron 展示计划
```

## 统一验证

功能完成后可统一运行跨工程验证。不编译 Java、不重新打包 Electron：

```powershell
powershell -ExecutionPolicy Bypass -File integration/verify.ps1
```

配置 JDK 21、Maven 后：

```powershell
powershell -ExecutionPolicy Bypass -File integration/verify.ps1 -IncludeJava
```
