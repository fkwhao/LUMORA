# LUMORA Agent Runtime

Python 3.12 Agent 推理与编排运行时。

## 职责

- 任务规划和 Agent 状态图。
- 模型适配、路由和中断恢复。
- 文档理解与结果验证能力边界。

## 边界

- 本工程不得导入 `desktop/` 或 `core/` 的源码。
- 不直接执行 Playwright、Shell 或无限制系统工具。
- 所有内置工具调用通过 `protocol/` 交给 Java Local Core。

## IDE 配置

在 IDE 中选择 Python 3.12，并以 `pyproject.toml` 安装开发依赖。协议生成目录
`agent/generated` 需要加入 Sources Root。

## 测试

未安装项目开发依赖时，可以使用 Python 3.12 标准库运行核心测试：

```powershell
$env:PYTHONPATH = "$(Resolve-Path agent/src)"
python -m unittest discover -s agent/tests -v
```

安装开发依赖后运行完整检查：

```powershell
cd agent
python -m pytest -q
python -m ruff check .
python -m mypy src
```

## 启动

先生成 Protobuf 代码，再设置以下环境变量：

```text
LUMORA_AGENT_PORT
LUMORA_STARTUP_TOKEN
LUMORA_PROTOCOL_VERSION
```

启动命令：

```powershell
python -m lumora_agent.server
```
