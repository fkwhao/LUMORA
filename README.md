# LUMORA

LUMORA 是面向普通 Windows 用户的本地通用电脑 Agent。

仓库采用单仓库、独立工程根目录结构：

- [`desktop/`](desktop/README.md)：Electron 桌面端。
- [`core/`](core/README.md)：Java Local Core。
- [`agent/`](agent/README.md)：Python Agent Runtime。
- [`integration/`](integration/README.md)：跨工程验证和仓库边界检查脚本。

各运行时必须能够独立打开、构建和测试，禁止互相导入源码。跨进程通信只能通过
本机 HTTP 接口完成：Electron Main 通过 REST/SSE 连接 Java，Java 通过 REST
连接 Python Agent。开发阶段由三个 IDE 独立启动三个工程；正式打包后再由
Electron 统一管理本地进程生命周期。

创建任务时，Java 调用 Python 生成计划，并将任务和计划步骤写入 SQLite，再将
完整任务数据返回给 Electron 展示。

架构资料：

- [总体产品架构](generalDesign/windows-ai-assistant-architecture.md)
- [初始项目架构规格（历史）](docs/superpowers/specs/2026-07-24-initial-project-architecture-design.md)
- [初始项目框架实施计划（历史）](docs/superpowers/plans/2026-07-24-initial-project-framework.md)

历史规格和计划仅记录最初决策过程；通信方式、目录和启动方式以当前 README 与
总体产品架构为准。
