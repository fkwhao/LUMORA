# LUMORA

LUMORA 是一个面向 Windows 的本地通用 AI Agent 桌面应用。项目采用 Electron、
Java 和 Python 三个独立工程组成完整运行链路，兼顾桌面交互、本地业务状态和
Agent 推理编排。

> 当前处于持续开发阶段：真实模型对话、Agent 工具循环、动态计划、权限审批、上下文
> 压缩、Artifact 和本地会话持久化已经打通；动态多 Agent、浏览器/OCR、完整通用
> Changes、插件运行时和 Windows 受限 Worker 仍按架构逐步实现。

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

- 创建或继续任务，由模型通过 `update_plan` 发布动态结构化计划并直接执行。
- 使用 OpenAI-compatible 模型进行流式持续对话，支持模型选择和模型级推理强度。
- 在授权工作区内执行文件搜索、分段读取、局部补丁、完整写入和非交互 Shell 命令。
- 使用结构化工作记录展示概括阶段和真实工具活动；模型隐藏推理不作为聊天正文展示。
- 对敏感工具调用进行权限审批，并从工具记录打开局部 Diff 或大型结果 Artifact。
- 自动或手动压缩较早上下文，并在 Java SQLite 中保存摘要、消息用量和活动上下文 Token。
- 本地保存、归档和恢复任务会话；仅允许编辑最后一条用户消息并重新生成后续回答。
- 支持 User、Project、Conversation 三层动态 Memory 和本地个性化开关。
- Java 使用 MyBatis-Plus 将任务、计划、会话、模型配置、记忆、审批和 Artifact 索引写入 SQLite。
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
