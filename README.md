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
- 按模型配置真实路由 Chat Completions、OpenAI Responses 和 Anthropic Messages，支持流式持续对话、模型选择和模型级推理强度。
- 在授权工作区内执行文件搜索、分段读取、局部补丁、完整写入和非交互 Shell 命令。
- 使用结构化工作记录展示概括阶段和真实工具活动；模型隐藏推理不作为聊天正文展示。
- 对敏感工具调用进行确定性分级、自动 Reviewer 或人工审批，并从工具记录打开局部 Diff 或大型结果 Artifact。
- 接入远程 Streamable HTTP MCP 的 Tools、Resources、Resource Templates 与 Prompts，所有远程能力继续经过现有权限和审计链路。
- 支持项目级与个人级 Skills：只在上下文中暴露名称和描述，命中后由 Agent 按需加载完整 SOP 与附属文本资源；输入 `/` 可搜索显式 Skill 指令。
- 对支持的模型启用供应商托管 Web Search，并在工作过程中展示搜索状态、引用和来源。
- 自动或手动压缩较早上下文，并在 Java SQLite 中保存摘要、活动上下文 Token 和输入、输出、推理、缓存等消息用量。
- 在会话右侧查看上下文总量与本地估算细分，在个人资料页查看本机 Token 汇总、每日热力图和缓存指标。
- 本地保存、归档和恢复任务会话；仅允许编辑最后一条用户消息并重新生成后续回答。
- 支持 User、Project、Conversation 三层动态 Memory 和本地个性化开关。
- Java 使用 MyBatis-Plus 将任务、计划、会话、模型配置、记忆、审批和 Artifact 索引写入 SQLite。
- 浅色、深色和跟随系统的外观设置。
- 本机启动令牌、进程边界和受控 Electron Preload。

## 本地开发

### 添加 Skill

项目 Skill 放在 `<工作区>/.lumora/skills/<skill-name>/SKILL.md`，个人 Skill 放在
`~/.lumora/skills/<skill-name>/SKILL.md`。项目中的同名 Skill 会覆盖个人 Skill。

```markdown
---
name: release-notes
description: 根据变更生成简洁的发布说明
mode: inline
context: full
---

先读取变更，再为 $ARGUMENTS 生成发布说明。
```

`name` 只允许小写字母、数字和连字符。`mode` 支持 `inline` 与 `fork` 元数据；
当前运行时会以内联方式执行，独立 Agent 上下文将在后续运行时版本接入。

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
