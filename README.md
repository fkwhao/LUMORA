# LUMORA

LUMORA 是面向普通 Windows 用户的本地通用电脑 Agent。

仓库采用单仓库、独立工程根目录结构：

- [`desktop/`](desktop/README.md)：Electron 桌面端。
- [`core/`](core/README.md)：Java Local Core。
- [`agent/`](agent/README.md)：Python Agent Runtime。
- [`protocol/`](protocol/README.md)：跨进程 Protobuf 协议。
- [`integration/`](integration/README.md)：本地联调、验证和打包脚本。

各运行时必须能够独立打开、构建和测试，禁止互相导入源码。跨进程通信只能通过
`protocol/` 生成的强类型协议完成。

架构资料：

- [初始项目架构规格](docs/superpowers/specs/2026-07-24-initial-project-architecture-design.md)
- [初始项目框架实施计划](docs/superpowers/plans/2026-07-24-initial-project-framework.md)
- [总体产品架构](generalDesign/windows-ai-assistant-architecture.md)

