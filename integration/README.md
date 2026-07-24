# LUMORA Integration

仅用于本地联合启动、健康检查、验证和桌面打包。

## 职责

- 生成每次运行独立的端口和启动令牌。
- 按 Python、Java、Electron 的依赖顺序启动开发环境。
- 运行跨工程验证和纵向流程测试。
- 管理开发进程 PID 与临时日志。

本目录不得包含任务、审批、Agent 或工具业务逻辑。

当前边界检查：

```powershell
powershell -ExecutionPolicy Bypass -File integration/tests/repository-boundaries.ps1
```

