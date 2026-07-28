# LUMORA Integration

仅用于跨工程验证和仓库边界检查。

## 职责

- 运行跨工程验证和纵向流程测试。

本目录不得包含任务、审批、Agent 或工具业务逻辑。

开发阶段不使用统一启动器。Python Agent、Java Core 和 Electron 分别从各自 IDE
启动，并读取各工程中被 Git 忽略的 `dev-local.yml`。正式版本的子进程生命周期
由 Electron Main 管理，不在本目录实现业务运行时。

当前边界检查：

```powershell
powershell -ExecutionPolicy Bypass -File integration/tests/repository-boundaries.ps1
```
