# LUMORA 开发期统一启动器设计

## 1. 目标

本阶段为 LUMORA 增加开发期一键启动能力。开发者在仓库根目录执行：

```powershell
pnpm dev
```

启动器自动完成仓库内依赖初始化、协议生成、数据库迁移、端口与令牌分配，以及
Python Agent、Java Core 和 Electron Desktop 的启动、健康检查、日志汇总和退出清理。

本阶段不制作正式安装包，也不自动安装 JDK 21、Python 3.12、Node.js 或 pnpm 本体。
这些基础运行时缺失或版本不符合要求时，启动器必须停止并给出明确的修复提示。

## 2. 模块边界

统一启动器属于独立的开发环境编排模块，代码位于 `integration/`，不属于
`desktop/`、`core/`、`agent/` 或 `protocol/` 中的任何业务模块。

```text
LUMORA/
├── package.json               # pnpm dev 统一入口
├── pnpm-workspace.yaml        # 根工程与 desktop 工作区
└── integration/
    ├── dev.mjs                # 启动入口
    └── dev/
        ├── bootstrap.mjs      # 环境检查与首次初始化
        ├── fingerprints.mjs   # 依赖和协议内容哈希
        ├── ports.mjs          # 空闲端口分配
        ├── runtime-config.mjs # 令牌、路径和子进程环境变量
        ├── supervisor.mjs     # 子进程与退出生命周期
        └── health-checks.mjs  # Python 与 Java 就绪检查
```

`integration/` 只允许依赖各工程公开的命令、端口和协议，不得导入任务、审批、
Agent 推理或数据库 Mapper 等业务源码。

## 3. 开发期与正式版职责

开发期由根目录 Node 启动器管理全部开发进程：

```text
integration/dev.mjs
  ├── Python Agent
  ├── Java Core
  └── Electron Desktop
```

正式版本不携带该开发启动器作为用户入口。正式安装包由 Electron Main 作为顶层
生命周期管理者：

```text
LUMORA.exe
  → Electron Main 启动 Java Core
  → Java Core 启动 Python Agent Runtime
  → Electron Main 等待 Java 健康检查
  → Electron Main 创建主窗口
```

正式版退出时，Electron Main 先通知 Java Core 退出，Java Core 再关闭 Python Agent。
当前开发启动器中的端口分配、随机令牌、健康检查、日志和进程关闭规则应保持独立，
便于正式打包阶段复用，但本阶段不迁移正式版进程所有权。

## 4. 首次初始化与增量检查

启动器必须能够从只安装了基础运行时的开发环境自举仓库内部依赖。

### 4.1 Node 与 Desktop

- 根目录 `package.json` 的 `dev` 脚本只调用 Node 标准库实现的 `integration/dev.mjs`，
  保证根目录依赖尚未安装时仍能进入初始化流程。
- 根依赖缺失或 `pnpm-lock.yaml` 指纹变化时，启动器执行一次 `pnpm install`。
- `desktop/` 作为 pnpm workspace 包，由根目录安装统一管理。
- Buf CLI 作为根工程固定版本的开发依赖，不再要求开发者全局安装 Buf。

### 4.2 Python

- 优先使用 `py -3.12`，其次使用满足版本要求的 `python`。
- `agent/.venv` 不存在时自动创建。
- Python 版本、`requirements.txt` 或 `requirements-dev.txt` 内容变化时，使用虚拟环境
  Python 重新安装开发依赖。
- 成功后保存不含敏感信息的 SHA-256 指纹；指纹未变化时跳过安装。

### 4.3 Protobuf

- 计算 `protocol/proto/**/*.proto`、`buf.yaml` 和 `buf.gen.yaml` 的组合指纹。
- 生成目录缺失或指纹变化时，调用根工程固定版本的 Buf 执行 lint 和 generate。
- Java Protobuf 代码仍由 Maven 构建生成；Buf 只生成 Python 代码。
- `agent/generated/` 保持 Git 忽略，不提交生成产物。

### 4.4 Maven 与 SQLite

- 仓库保存完整 Maven Wrapper，启动器使用 `core/mvnw.cmd`，不依赖全局 Maven。
- Java Core 接入 Liquibase，并在启动时自动执行版本化 SQLite 迁移。
- 数据库位于 `integration/runtime/lumora.db`。
- Liquibase 只执行尚未应用的变更集，禁止启动器手工判断或拼接业务表 SQL。

## 5. 启动数据流

每次运行都生成新的随机令牌和空闲端口。令牌使用 Node
`crypto.randomBytes(32)`，不得使用固定开发令牌。

| 子进程 | 启动器注入的配置 |
|---|---|
| Python Agent | `LUMORA_AGENT_PORT`、`LUMORA_STARTUP_TOKEN`、`LUMORA_PROTOCOL_VERSION`、`PYTHONPATH` |
| Java Core | `LUMORA_CORE_PORT`、`LUMORA_AGENT_PORT`、`LUMORA_STARTUP_TOKEN`、`LUMORA_AGENT_STARTUP_TOKEN`、`LUMORA_PROTOCOL_VERSION`、`LUMORA_DATABASE_PATH` |
| Electron Desktop | `LUMORA_CORE_URL`、`LUMORA_STARTUP_TOKEN` |

环境变量只传给本次启动的子进程，不写入 `.env`、系统用户环境变量或日志。

启动顺序固定为：

1. 检查 Node、pnpm、JDK 21 和 Python 3.12。
2. 执行需要的 Node、Python 和协议初始化步骤。
3. 创建 `integration/runtime/`，生成令牌、端口和运行配置。
4. 启动 Python Agent，等待进程和端口就绪。
5. 启动 Java Core，等待带启动令牌的版本化健康接口成功。
6. 启动 Electron Desktop，并强制使用 `RestTaskGateway`。

真实后端未就绪时不得启动 Electron，也不得自动降级到 `DemoTaskGateway`。

## 6. 健康检查

- Python Agent 在 gRPC Server 完成注册并开始监听后输出结构化 ready 事件。
- 启动器同时检查 Python 子进程仍存活且目标端口可连接。
- Java Core 提供受启动令牌保护的 `/api/v1/health` 接口，响应服务名、版本和协议版本。
- 启动器轮询 Java 健康接口，只有协议版本与当前配置一致时才认为就绪。
- Python 默认就绪超时为 20 秒，Java 默认就绪超时为 60 秒。
- 超时值可通过启动器内部常量调整，本阶段不增加用户配置文件。

## 7. 日志与运行状态

控制台日志使用固定前缀：

```text
[bootstrap]
[agent]
[core]
[desktop]
```

日志同时写入：

```text
integration/runtime/logs/<启动时间>/
```

运行目录可以保存不含令牌的诊断清单，例如进程名称、PID、端口和日志路径。启动令牌、
模型密钥和完整子进程环境变量禁止落盘或输出。

## 8. 退出与失败处理

- 环境检查或初始化失败时，不启动任何业务进程。
- Python 或 Java 在健康检查前退出时，启动器立即停止已启动进程并返回非零退出码。
- Java 或 Python 在运行期间意外退出时，启动器关闭 Electron 和其他后端进程。
- Electron 正常退出时，启动器按 Electron、Java、Python 的顺序清理进程。
- 第一次收到 `Ctrl+C` 时执行正常关闭并等待有限时间。
- 清理超时或第二次收到中断信号时，终止由本启动器创建的剩余进程树。
- 启动器只能结束自己持有的子进程，禁止按进程名称批量结束系统中的 Java、Python
  或 Electron。

错误信息必须说明失败阶段、实际检测结果和下一步操作。例如 JDK 版本不符时输出
检测到的 Java 路径与版本，而不是只输出“启动失败”。

## 9. 安全要求

- 所有服务只监听 `127.0.0.1`。
- 每次启动使用新的随机令牌。
- Python、Java 和 Electron Main 使用相同的协议版本。
- Renderer 不接触端口、令牌、子进程或文件系统路径。
- 启动器日志对包含令牌的参数和环境变量进行脱敏。
- 运行目录和生成目录继续由 `.gitignore` 排除。

## 10. 测试策略

Node 启动器使用 `node:test` 覆盖：

- 文件组合指纹稳定性与内容变化检测。
- Python、requirements、proto 和锁文件的跳过/重建判断。
- 空闲端口分配。
- 令牌长度、随机性和日志脱敏。
- 子进程正常退出、启动失败、超时和 `Ctrl+C` 清理。
- 只关闭启动器自身子进程，不影响无关进程。

工程级测试覆盖：

- Buf lint 与 Python 生成代码导入。
- Python Agent ready 事件和端口监听。
- Java Liquibase 首次迁移与重复启动。
- Java 健康接口认证和协议版本响应。
- Electron 在真实后端配置下选择 `RestTaskGateway`。
- 后端失败时不启动 Electron、不进入 Demo 模式。

统一验证脚本继续覆盖现有 Python、Java 和 Desktop 测试，并增加启动器结构与单元测试。

## 11. 文档同步

实现完成时同步：

- 根目录 `README.md`：将 `pnpm dev` 作为标准开发启动方式。
- `integration/README.md`：说明独立编排边界、自动初始化、日志和故障定位。
- `docs/development.md`：区分日常一键启动与各工程单独调试方式。
- `desktop/README.md`：说明开发期由 integration 启动，正式版由 Electron Main 管理。
- `core/README.md`：说明 Maven Wrapper、Liquibase 和正式版 Java 管理 Python 的职责。
- `agent/README.md`：说明虚拟环境、生成代码和端口令牌由开发启动器注入。
- `generalDesign/windows-ai-assistant-architecture.md`：同步开发期与正式版的进程所有权。

## 12. 验收标准

- 基础运行时已安装的干净工作区执行一次 `pnpm dev` 即可完成仓库内部初始化并启动
  Python、Java 和 Electron。
- 第二次执行在相关文件未变化时跳过依赖安装和协议生成。
- requirements、proto 或锁文件变化时只重新执行对应步骤。
- SQLite 无需手工建库或执行 SQL，迁移可重复运行。
- Python 或 Java 启动失败时 Electron 不打开，也不进入 Demo。
- Electron 退出或用户按 `Ctrl+C` 后不残留由启动器创建的 Java、Python 或 Electron
  进程。
- 控制台和文件日志能够定位失败进程，但不包含启动令牌。
- 各工程仍可在 IDE 中独立打开、测试和调试，禁止通过源码导入形成新的语言耦合。
