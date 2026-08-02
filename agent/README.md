# LUMORA Agent Runtime

Python 3.12 Agent 推理与编排运行时。

## 职责

- 任务规划和 Agent 状态图。
- OpenAI 兼容模型适配、对话流式响应和模型设置。
- 后续 Agent Harness、动态编排和中断恢复。
- 文档理解与结果验证能力边界。
- 通过 REST 接收 Java 的规划请求并返回结构化计划步骤。

## 边界

- 本工程不得导入 `desktop/` 或 `core/` 的源码。
- 不直接执行 Playwright、Shell 或无限制系统工具。
- 需要使用本机能力时，只能通过受控 HTTP 接口交给 Java Local Core。

## IDE 配置

在 IDE 中选择 Python 3.12，并以 `requirements-dev.txt` 安装开发依赖。将
`agent/` 工程根目录加入 Sources Root。

```powershell
python -m pip install -r requirements-dev.txt
```

## 代码结构

```text
app/controller/http/   REST 请求、认证和错误转换
app/dto/               REST 请求与响应模型
app/security/          本机启动令牌校验
app/service/           Agent 规划与编排业务
app/model/             Pydantic 数据模型
app/provider/          模型供应商适配与流式事件转换
app/prompt/            分层 System Prompt、动态上下文和模板装配
app/config/            YAML 运行配置
app/exception/         运行时异常
app/main.py            FastAPI 与 Uvicorn 生命周期
```

## 测试

未安装项目开发依赖时，可以使用 Python 3.12 标准库运行核心测试：

```powershell
$env:PYTHONPATH = "$(Resolve-Path agent)"
python -m unittest discover -s agent/tests -v
```

安装开发依赖后运行完整检查：

```powershell
cd agent
$env:PYTHONPATH = (Resolve-Path '.').Path
python -m unittest discover -s tests -v
python -m ruff check app tests
python -m mypy app
```

## 启动

复制 `config/dev-local.example.yml` 为 `config/dev-local.yml`，配置监听地址、端口、
协议版本和至少 32 个字符的本机开发令牌。模型配置由 Java Local Core 管理：
API Key 使用 Windows DPAPI 加密后写入 SQLite。Java 只在调用模型时通过已认证的
localhost 请求临时传给 Python，Python 不保存 API Key。

启动命令：

```powershell
python -m app.main
```
