# Task 1 Report: Root Workspace and Deterministic Fingerprints

## 实现内容

- 新增根 `package.json`、`pnpm-workspace.yaml` 与根 `pnpm-lock.yaml`；workspace 包含 `.` 和 `desktop` importer。
- 删除 `desktop/pnpm-workspace.yaml` 与 `desktop/pnpm-lock.yaml`，将既有 Electron 构建许可提升到根 workspace。
- 新增 `integration/dev/fingerprints.mjs`，提供确定性 SHA-256 文件摘要、UTF-8 stamp 读写以及输出/stamp 联合失效判断。
- 新增使用真实临时目录的 Node 测试，覆盖无序输入的稳定摘要、内容变更、缺失输出、stamp 写入及匹配 stamp。

## TDD 证据

1. 先只创建 `integration/tests/dev/fingerprints.test.mjs`，未创建实现模块。
2. RED 命令：`node --test integration/tests/dev/fingerprints.test.mjs`
   - 退出码 `1`，预期错误：`ERR_MODULE_NOT_FOUND`，目标为 `integration/dev/fingerprints.mjs`。
3. 添加最小 `fingerprints.mjs` 实现后运行同一命令。
   - GREEN：`pass 2`、`fail 0`。

## 验证结果

- `node --test integration/tests/dev/fingerprints.test.mjs`
  - 退出码 `0`；`pass 2`、`fail 0`。
- `C:\Users\16085\AppData\Roaming\npm\pnpm.cmd --config.strict-dep-builds=false --filter lumora-desktop typecheck`
  - 退出码 `0`；输出：`$ tsc --noEmit`。
- `git diff --check`
  - 退出码 `0`，无空白错误。
- `pnpm-lock.yaml` 已校验含 `.`（第 9 行）与 `desktop`（第 15 行）importer。

## Workspace 安装记录

- 原样 `pnpm.cmd install` 先因 pnpm 11.9 默认的 `blockExoticSubdeps` 拒绝 Electron Forge 所需的 git 传递依赖 `@electron/node-gyp`。
- 以一次性 `--config.block-exotic-subdeps=false` 后依赖解析完成并生成根 lockfile，但又因 `@bufbuild/buf@1.72.0` 的未批准构建脚本报 `ERR_PNPM_IGNORED_BUILDS`。
- 以一次性 `--config.strict-dep-builds=false` 可运行实际 typecheck；pnpm 会自动尝试把 `@bufbuild/buf` 审批提示写入 YAML，已两次移除，最终 YAML 严格保持 brief 的精确内容。

## 变更文件

- `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `desktop/pnpm-workspace.yaml`（删除）
- `desktop/pnpm-lock.yaml`（删除）
- `integration/dev/fingerprints.mjs`
- `integration/tests/dev/fingerprints.test.mjs`

## 自审

- 路径按字典序复制后再摘要，且每个规范化路径与文件字节均以 NUL 分隔，避免输入顺序和边界拼接造成的不确定性。
- 仅 `ENOENT` 会视为缺失 stamp/输出；其他 I/O 权限或设备错误会原样抛出，避免误判为应刷新。
- `writeStamp` 建立父目录并以 UTF-8 写入；所有生成物必须存在且 stamp 精确相同才跳过刷新。
- 未修改或暂存 `artwork/`、`generalDesign/`。

## 顾虑

本机 pnpm 11.9 的默认供应链及严格构建策略与 brief 规定的精确 `allowBuilds` 列表不兼容。原样 `pnpm install` / 其触发的依赖同步会失败；本次 lockfile 已生成且 TypeScript 已在临时 pnpm 配置下通过，但后续 bootstrap 应在 Task 2 评估是否统一提供一次性 pnpm 配置或经需求确认后调整审批策略。

## 用户裁定与最终验证

- 用户已裁定以最小修正明确审批 `@bufbuild/buf` 的构建脚本：`allowBuilds` 增加 `'@bufbuild/buf': true`。
- 同步更新 `docs/superpowers/plans/2026-07-24-unified-development-launcher.md` 的 Task 1 精确 YAML；设计规范中不存在同一配置，因此无需修改。
- `C:\Users\16085\AppData\Roaming\npm\pnpm.cmd install`
  - 退出码 `0`；输出包含 `node_modules/@bufbuild/buf postinstall: Done` 与 `Done in 4.5s using pnpm v11.9.0`。
- 根 `pnpm-lock.yaml` importer 校验：`.` 位于第 9 行，`desktop` 位于第 15 行。
- `node --test integration/tests/dev/fingerprints.test.mjs`
  - 退出码 `0`；`pass 2`、`fail 0`。
- `C:\Users\16085\AppData\Roaming\npm\pnpm.cmd --filter lumora-desktop typecheck`
  - 退出码 `0`；输出：`$ tsc --noEmit`。
- `git diff --check`
  - 退出码 `0`；仅有 Git 的 LF-to-CRLF 工作树警告，无空白错误。
