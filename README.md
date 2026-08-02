# LUMORA

LUMORA 是一个面向 Windows 的本地通用 AI Agent 桌面应用。项目采用 Electron、
Java 和 Python 三个独立工程组成完整运行链路，兼顾桌面交互、本地业务状态和
Agent 推理编排。

> 当前处于早期开发阶段：任务规划、对话流式响应、本地会话持久化和基础桌面界面
> 已打通；动态多 Agent、工具执行、审批与统一 RunEvent 正在按架构逐步实现。

## 项目结构

```text
desktop/       Electron、React、TypeScript 桌面端
core/          Java 21、Spring Boot、MyBatis-Plus、SQLite 本地核心
agent/         Python 3.12、FastAPI Agent Runtime
contracts/     Java 与 Python 之间的 REST/SSE 接口契约
integration/   跨工程边界和统一验证脚本
docs/          对外开发与架构说明
```

三个运行时互不导入源码，只通过明确的 IPC、REST 和 SSE 契约通信：

```text
Electron Renderer
  → Preload IPC
  → Electron Main
  → Java Local Core（REST/SSE）
  → Python Agent Runtime（REST/SSE）
```

## 当前能力

- 创建任务并生成结构化计划。
- Java 使用 MyBatis-Plus 将任务、计划和会话写入 SQLite。
- 配置 OpenAI 兼容模型接口。
- 流式展示模型回答和推理内容。
- 本地保存、归档和恢复任务会话。
- 浅色、深色和跟随系统的外观设置。
- 本机启动令牌、进程边界和受控 Electron Preload。

## 本地开发

开发阶段分别启动三个工程：

1. Python Agent Runtime。
2. Java Local Core。
3. Electron Desktop。

详细环境、配置和启动步骤见 [开发指南](docs/development.md)。

## 架构

架构边界、数据归属和下一阶段 RunEvent 设计见
[公开架构说明](docs/architecture.md)。

## 安全说明

- 真实 API Key、启动令牌和本机服务配置不得提交。
- `dev-local.yml`、`.env*`、数据库、日志、虚拟环境和依赖目录已加入 `.gitignore`。
- 仓库只提供不含真实凭据的 `*.example.yml`。
- Renderer 不接触 Node.js、后端 URL、启动令牌或任意 HTTP Client。
- 提交前仍应执行敏感信息扫描，并检查 Git 历史中是否曾出现真实密钥。

## 验证

```powershell
powershell -ExecutionPolicy Bypass -File integration/verify.ps1
```

配置 JDK 21 和 Maven 后：

```powershell
powershell -ExecutionPolicy Bypass -File integration/verify.ps1 -IncludeJava
```

## 子工程说明

- [Desktop](desktop/README.md)
- [Java Local Core](core/README.md)
- [Python Agent Runtime](agent/README.md)
