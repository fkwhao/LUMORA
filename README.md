# LUMORA

LUMORA 是一个面向 Windows 的本地通用 AI Agent 桌面应用。项目采用 Electron、
Java 和 Python 三个独立工程组成完整运行链路，兼顾桌面交互、本地业务状态和
Agent 推理编排。

> 当前处于持续开发阶段：真实模型对话、Agent 工具循环、动态计划、权限审批、上下文
> 压缩、Artifact、本地会话持久化和完整能力 Supervisor 多 Agent 已经打通；可续接
> Agent Session、耐久显式 DAG、共享预算、安全重试、跨进程写入租约与冲突合并已实现，浏览器/OCR、
> 完整通用 Changes、插件运行时和 Windows 受限 Worker 仍按架构逐步实现。

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
- 支持在输入框添加本地文件和粘贴剪贴板图片；本地文件直接引用原路径，剪贴板图片仅生成一份系统临时文件，会话和队列只持久化附件元数据与路径引用。
- 通过模型无关的 `read_pdf` 和 `search_pdf` 工具分页读取、检索带文本层的 PDF，无需依赖供应商原生文档能力，也不做向量切分或解析结果持久化；扫描型 PDF 的 OCR 尚未实现。
- 在授权工作区内执行文件搜索、分段读取、局部补丁、完整写入和非交互 Shell 命令。
- 使用结构化工作记录展示概括阶段和真实工具活动；模型隐藏推理不作为聊天正文展示。
- 对敏感工具调用进行确定性分级、自动 Reviewer 或人工审批，并从工具记录打开局部 Diff 或大型结果 Artifact。
- 接入远程 Streamable HTTP MCP 的 Tools、Resources、Resource Templates 与 Prompts，所有远程能力继续经过现有权限和审计链路。
- 支持项目级与个人级 Skills：只在上下文中暴露名称和描述，命中后由 Agent 按需加载完整 SOP 与附属文本资源；输入 `/` 可搜索显式 Skill 指令。
- 对支持的模型启用供应商托管 Web Search，并在工作过程中展示搜索状态、引用和来源。
- 自动或手动压缩较早上下文，并在 Java SQLite 中保存摘要、活动上下文 Token 和输入、输出、推理、缓存等消息用量。
- 在会话右侧查看上下文总量与本地估算细分，在个人资料页查看本机 Token 汇总、每日热力图和缓存指标。
- 本地保存、归档和恢复任务会话；仅允许编辑最后一条用户消息并重新生成后续回答。
- 运行期间的新问题默认进入耐久队列并在当前任务结束后自动执行；队列问题可在安全步骤边界转换为运行中引导，暂停与重启不会丢失。
- 不同任务在可配置的有界槽位内并发执行；同任务仍由问题队列串行，同一步骤的安全工具可有界并发，文件访问使用读写协调和陈旧覆盖保护。
- 主 Agent 可作为 Supervisor 通过 `delegate_task` 动态启动独立子 Session；子 Agent 继承本次请求实际可见的文件读写、Shell、MCP、Skill 和委派工具，并继续经过相同权限审批与工作区边界。委派最多深入 3 层，互不依赖的任务有界并行；直属 Agent 以头像显示在主执行区，进一步委派的 Agent 显示在父 Agent 的右侧 Session 面板中，执行步骤、Token 与最终回报随父 Run 事件日志持久化重放。
- 复杂长期任务可选择显式 DAG，按依赖、优先级、deadline 和写入范围分 wave 调度；DAG、节点、原子 checkpoint、Effect 提交记录和租约审计耐久写入 Core SQLite。根 Run 与全部后代共享请求预算，工作流另有跨回合累计配额；读操作只对可判定的瞬态失败安全重试，写入使用带 TTL、FIFO 与 fencing token 的跨进程租约，完整文件支持基线三方合并并为重叠修改返回人工解决信息。
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
当前 Skill 仍以内联方式执行，`fork` 元数据尚未连接到 Supervisor 子 Session。

开发阶段分别启动三个工程：

1. Python Agent Runtime。
2. Java Local Core。
3. Electron Desktop。

详细环境、配置和启动步骤见 [开发指南](docs/development.md)。

## 架构

架构边界、数据归属和下一阶段 RunEvent 设计见
[公开架构说明](docs/architecture.md)。

问题排队、运行中引导和暂停恢复的状态与交互规范见
[对话问题队列与 Steer 设计](docs/conversation-input-queue-design.md)。

跨任务 Run 调度、文件资源协调和当前非目标见
[任务并发与资源感知设计](docs/cross-task-concurrency-design.md)。

图片、文件与 PDF 的引用模型、生命周期、供应商路由和安全边界见
[附件设计](docs/attachment-design.md)。

Supervisor/子 Agent 的 Session、事件、界面和分阶段路线图见
[Supervisor 多 Agent 设计](docs/supervisor-multi-agent-design.md)。

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
