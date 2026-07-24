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

构建和测试命令将在 Python 工程脚手架建立后补充。

