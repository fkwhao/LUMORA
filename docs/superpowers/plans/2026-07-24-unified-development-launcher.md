# LUMORA Unified Development Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让开发者在仓库根目录执行一次 `pnpm dev`，即可增量初始化仓库依赖并可靠启动、监控和关闭 Python Agent、Java Core 与 Electron Desktop。

**Architecture:** 根目录只提供 Node 标准库实现的开发入口，实际编排逻辑按环境检查、指纹、运行配置、健康检查和进程监督拆分在 `integration/dev/`。开发期由 Node 启动器管理三个进程；正式版仍由 Electron Main 启动 Java、Java 再管理 Python，本计划只记录并保留该迁移边界。

**Tech Stack:** Node.js 24 ESM 与 `node:test`、pnpm 11.9、Buf 1.72、Python 3.12、Java 21、Spring Boot 3.5、Liquibase、SQLite、Electron Forge。

## Global Constraints

- 根命令固定为 `pnpm dev`，并且根依赖尚未安装时仍能进入 bootstrap。
- 不自动安装 JDK 21、Python 3.12、Node.js 或 pnpm 本体。
- 仓库内部依赖、虚拟环境和协议代码按 SHA-256 指纹增量更新。
- 端口和 32 字节随机令牌每次启动重新生成，只通过子进程环境变量传递。
- Python 或 Java 未就绪时不得启动 Electron，也不得降级到 Demo 模式。
- 所有服务只监听 `127.0.0.1`，日志不得包含启动令牌。
- 启动器只能终止自己创建的子进程树。
- Java 保持传统 `Controller → Service → Mapper` 分层与普通 Java `class`。
- Python 继续使用 `requirements.txt` 和 `requirements-dev.txt`。
- 关键边界、生命周期、认证和迁移逻辑使用中文注释。

---

## File Structure

### Root workspace

- Create `package.json`: root scripts and pinned project-local Buf dependency.
- Create `pnpm-workspace.yaml`: workspace membership and native build allow-list.
- Create `pnpm-lock.yaml`: single repository lockfile.
- Delete `desktop/pnpm-workspace.yaml`: settings move to root workspace.
- Delete `desktop/pnpm-lock.yaml`: lock ownership moves to repository root.

### Launcher

- Create `integration/dev.mjs`: executable development entry.
- Create `integration/dev/fingerprints.mjs`: deterministic SHA-256 and stamp persistence.
- Create `integration/dev/commands.mjs`: executable discovery and child command runner.
- Create `integration/dev/bootstrap.mjs`: Node, Python and protocol bootstrap decisions.
- Create `integration/dev/ports.mjs`: loopback free-port allocation.
- Create `integration/dev/runtime-config.mjs`: per-run token, paths and child environments.
- Create `integration/dev/health-checks.mjs`: TCP and authenticated Java health polling.
- Create `integration/dev/logging.mjs`: prefixed console/file output and secret redaction.
- Create `integration/dev/supervisor.mjs`: owned child lifecycle and tree cleanup.
- Create `integration/dev/orchestrator.mjs`: ordered Python → Java → Electron startup.

### Runtime readiness

- Modify `agent/app/main.py`: emit one structured ready line after gRPC server start.
- Create `agent/tests/test_main.py`: ready-line format test.
- Modify `core/pom.xml`: Liquibase dependency and complete Maven Wrapper generation.
- Create `core/src/main/resources/db/changelog/db.changelog-master.yaml`: versioned SQLite changelog.
- Modify `core/src/main/resources/application.yml`: Liquibase and SQLite connection initialization.
- Create `core/src/main/java/com/lumora/core/dto/response/CoreHealthResponse.java`: REST health DTO.
- Create `core/src/main/java/com/lumora/core/controller/CoreHealthController.java`: authenticated health endpoint.
- Create `core/src/test/java/com/lumora/core/controller/CoreHealthControllerTest.java`: endpoint contract.
- Create `core/src/test/java/com/lumora/core/config/DatabaseMigrationTest.java`: real SQLite migration test.

### Tests and documentation

- Create `integration/tests/dev/fingerprints.test.mjs`.
- Create `integration/tests/dev/bootstrap.test.mjs`.
- Create `integration/tests/dev/runtime-config.test.mjs`.
- Create `integration/tests/dev/supervisor.test.mjs`.
- Create `integration/tests/dev/orchestrator.test.mjs`.
- Modify `integration/verify.ps1`: launcher tests and root workspace checks.
- Modify root and component README files listed in the approved specification.
- Modify `generalDesign/windows-ai-assistant-architecture.md` locally without adding the untracked directory to Git.

---

### Task 1: Root Workspace and Deterministic Fingerprints

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `integration/dev/fingerprints.mjs`
- Create: `integration/tests/dev/fingerprints.test.mjs`
- Delete: `desktop/pnpm-workspace.yaml`
- Delete: `desktop/pnpm-lock.yaml`
- Generate: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `hashFiles(paths: string[]): Promise<string>`
- Produces: `readStamp(path: string): Promise<string | null>`
- Produces: `writeStamp(path: string, fingerprint: string): Promise<void>`
- Produces: `needsRefresh({ fingerprint, stampPath, outputs }): Promise<boolean>`
- Later tasks consume the root `pnpm` workspace and these fingerprint functions.

- [ ] **Step 1: Write the failing fingerprint tests**

Create tests using temporary directories and exact public APIs:

```javascript
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  hashFiles,
  needsRefresh,
  readStamp,
  writeStamp,
} from "../../../integration/dev/fingerprints.mjs";

test("hashFiles is stable and changes with file content", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lumora-fingerprint-"));
  const first = path.join(root, "a.txt");
  const second = path.join(root, "b.txt");
  await writeFile(first, "alpha");
  await writeFile(second, "beta");
  const before = await hashFiles([second, first]);
  const repeated = await hashFiles([first, second]);
  await writeFile(second, "changed");
  const after = await hashFiles([first, second]);
  assert.equal(before, repeated);
  assert.notEqual(before, after);
});

test("needsRefresh requires matching stamp and existing outputs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lumora-stamp-"));
  const stampPath = path.join(root, "requirements.sha256");
  const output = path.join(root, "python.exe");
  assert.equal(
    await needsRefresh({ fingerprint: "abc", stampPath, outputs: [output] }),
    true,
  );
  await writeFile(output, "");
  await writeStamp(stampPath, "abc");
  assert.equal(await readStamp(stampPath), "abc");
  assert.equal(
    await needsRefresh({ fingerprint: "abc", stampPath, outputs: [output] }),
    false,
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test integration/tests/dev/fingerprints.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `integration/dev/fingerprints.mjs`.

- [ ] **Step 3: Implement the fingerprint module**

Implement sorted path hashing with each normalized relative path and file bytes included in the digest. `writeStamp` must create the parent directory and use UTF-8. `needsRefresh` returns true for missing outputs, missing stamp, or a mismatched fingerprint.

```javascript
export async function hashFiles(paths) {
  const hash = createHash("sha256");
  for (const filePath of [...paths].sort()) {
    hash.update(path.normalize(filePath));
    hash.update("\0");
    hash.update(await readFile(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}
```

- [ ] **Step 4: Add the root workspace**

Create root `package.json`:

```json
{
  "name": "lumora-workspace",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@11.9.0",
  "scripts": {
    "dev": "node integration/dev.mjs",
    "test:launcher": "node --test integration/tests/dev/*.test.mjs"
  },
  "devDependencies": {
    "@bufbuild/buf": "1.72.0"
  }
}
```

Create root `pnpm-workspace.yaml`:

```yaml
packages:
  - desktop

nodeLinker: hoisted
allowBuilds:
  '@bufbuild/buf': true
  electron: true
  electron-winstaller: true
  esbuild: true
  protobufjs: true
onlyBuiltDependencies:
  - electron
  - electron-winstaller
  - esbuild
  - protobufjs
```

Delete the nested workspace and lockfile, then generate the root lock:

```powershell
pnpm.cmd install
```

Expected: root `pnpm-lock.yaml` contains importers `.` and `desktop`.

- [ ] **Step 5: Run GREEN verification**

Run:

```powershell
node --test integration/tests/dev/fingerprints.test.mjs
pnpm.cmd --filter lumora-desktop typecheck
```

Expected: fingerprint tests PASS and desktop typecheck PASS.

- [ ] **Step 6: Commit**

```powershell
git add package.json pnpm-workspace.yaml pnpm-lock.yaml desktop/pnpm-workspace.yaml desktop/pnpm-lock.yaml integration/dev/fingerprints.mjs integration/tests/dev/fingerprints.test.mjs
git commit -m "build: add root pnpm workspace"
```

---

### Task 2: Environment Discovery and Incremental Bootstrap

**Files:**
- Create: `integration/dev/commands.mjs`
- Create: `integration/dev/bootstrap.mjs`
- Create: `integration/tests/dev/bootstrap.test.mjs`

**Interfaces:**
- Consumes: fingerprint APIs from Task 1.
- Produces: `runCommand(command, args, options): Promise<CommandResult>`
- Produces: `planBootstrap(state): BootstrapStep[]`
- Produces: `discoverPython312(options): Promise<PythonRuntime>`
- Produces: `discoverJava21(options): Promise<JavaRuntime>`
- Produces: `bootstrapRepository(options): Promise<BootstrapResult>`
- `BootstrapResult` contains `pythonExecutable`, `javaHome`, `bufExecutable`, and `mavenWrapper`.

- [ ] **Step 1: Write failing bootstrap decision tests**

Test the pure bootstrap decision separately from executable discovery so tests do not
install packages:

```javascript
import assert from "node:assert/strict";
import test from "node:test";

import {
  discoverJava21,
  planBootstrap,
} from "../../../integration/dev/bootstrap.mjs";

test("bootstrap skips unchanged repository dependencies", () => {
  assert.deepEqual(
    planBootstrap({
      rootDependenciesChanged: false,
      virtualEnvironmentExists: true,
      requirementsChanged: false,
      protocolChanged: false,
      generatedProtocolExists: true,
    }),
    [],
  );
});

test("bootstrap rebuilds only changed requirements", () => {
  assert.deepEqual(
    planBootstrap({
      rootDependenciesChanged: false,
      virtualEnvironmentExists: true,
      requirementsChanged: true,
      protocolChanged: false,
      generatedProtocolExists: true,
    }),
    ["install-python-requirements"],
  );
});

test("bootstrap reports an actionable error for the wrong Java version", async () => {
  await assert.rejects(
    () => discoverJava21({
      environment: { JAVA_HOME: "C:\\jdk-17" },
      runner: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: 'openjdk version "17.0.12"',
      }),
    }),
    /需要 JDK 21.*检测到 17\.0\.12/,
  );
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
node --test integration/tests/dev/bootstrap.test.mjs
```

Expected: FAIL because `bootstrap.mjs` and `commands.mjs` do not exist.

- [ ] **Step 3: Implement executable discovery**

`discoverPython312` checks `py -3.12 --version`, then `python --version`.
`discoverJava21` checks `%JAVA_HOME%\bin\java.exe -version`, then `java -version`.
Version parsers must reject Python other than major/minor `3.12` and Java major other than `21`.

Return exact discovered paths and include the detected path/version in errors.

- [ ] **Step 4: Implement idempotent bootstrap**

Bootstrap order:

1. If root `node_modules/.bin/buf.cmd` is missing or the Node dependency fingerprint differs, execute `pnpm.cmd install`.
2. If `agent/.venv/Scripts/python.exe` is missing, execute discovered Python with `-m venv agent/.venv`.
3. Hash Python version plus both requirements files. On change, execute virtualenv Python with `-m pip install -r requirements-dev.txt`.
4. Hash all sorted proto files plus both Buf configs. On change or missing generated outputs, execute project-local Buf `lint` then `generate` with cwd `protocol/`.
5. Persist stamps only after each command succeeds.

The project-local Buf executable is:

```javascript
const bufExecutable = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "buf.cmd" : "buf",
);
```

- [ ] **Step 5: Run GREEN verification**

Run:

```powershell
node --test integration/tests/dev/bootstrap.test.mjs
```

Expected: all bootstrap tests PASS without changing the real virtual environment.

- [ ] **Step 6: Commit**

```powershell
git add integration/dev/commands.mjs integration/dev/bootstrap.mjs integration/tests/dev/bootstrap.test.mjs
git commit -m "feat: add incremental development bootstrap"
```

---

### Task 3: Runtime Ports, Token and Secret-Safe Logging

**Files:**
- Create: `integration/dev/ports.mjs`
- Create: `integration/dev/runtime-config.mjs`
- Create: `integration/dev/logging.mjs`
- Create: `integration/tests/dev/runtime-config.test.mjs`

**Interfaces:**
- Produces: `allocateLoopbackPort(): Promise<number>`
- Produces: `createRuntimeConfig(options): Promise<RuntimeConfig>`
- Produces: `redactSecrets(text: string, secrets: string[]): string`
- Produces: `createProcessLogger(options): ProcessLogger`
- `RuntimeConfig` contains `token`, `protocolVersion`, `agentPort`, `corePort`, `databasePath`, `logDirectory`, and `environments`.

- [ ] **Step 1: Write failing runtime configuration tests**

```javascript
test("runtime config uses distinct ports and injects one token", async () => {
  const ports = [45101, 45102];
  const config = await createRuntimeConfig({
    repoRoot,
    allocatePort: async () => ports.shift(),
    randomBytes: () => Buffer.alloc(32, 7),
    startedAt: new Date("2026-07-24T00:00:00Z"),
  });
  assert.equal(config.agentPort, 45101);
  assert.equal(config.corePort, 45102);
  assert.equal(config.token.length, 64);
  assert.equal(config.agentEnvironment.LUMORA_STARTUP_TOKEN, config.token);
  assert.equal(config.coreEnvironment.LUMORA_STARTUP_TOKEN, config.token);
  assert.equal(
    config.desktopEnvironment.LUMORA_CORE_URL,
    "http://127.0.0.1:45102",
  );
});

test("redactSecrets removes the token from logs", () => {
  assert.equal(
    redactSecrets("Authorization: Bearer secret-token", ["secret-token"]),
    "Authorization: Bearer [REDACTED]",
  );
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
node --test integration/tests/dev/runtime-config.test.mjs
```

Expected: FAIL with missing runtime modules.

- [ ] **Step 3: Implement port allocation and runtime config**

Use `net.createServer()` bound to host `127.0.0.1` and port `0`, read the assigned
port, then close the server. Allocate agent and core ports sequentially and reject a duplicate.

Use `randomBytes(32).toString("hex")` for the token. Create child environments by copying
`process.env` and adding only the variables in the approved design. Build Python
`PYTHONPATH` with `path.delimiter`.

- [ ] **Step 4: Implement prefixed file/console logging**

`createProcessLogger` creates the log directory, writes UTF-8 lines to
`<name>.log`, prefixes console lines with `[name]`, and passes every line through
`redactSecrets`. It exposes `write(stream, chunk)` and `close()`.

- [ ] **Step 5: Run GREEN verification**

Run:

```powershell
node --test integration/tests/dev/runtime-config.test.mjs
```

Expected: all tests PASS, including token redaction.

- [ ] **Step 6: Commit**

```powershell
git add integration/dev/ports.mjs integration/dev/runtime-config.mjs integration/dev/logging.mjs integration/tests/dev/runtime-config.test.mjs
git commit -m "feat: add secure development runtime config"
```

---

### Task 4: Python Ready Signal, Java Health and SQLite Migration

**Files:**
- Modify: `agent/app/main.py`
- Create: `agent/tests/test_main.py`
- Modify: `core/pom.xml`
- Create: `core/src/main/resources/db/changelog/db.changelog-master.yaml`
- Modify: `core/src/main/resources/application.yml`
- Create: `core/src/main/java/com/lumora/core/dto/response/CoreHealthResponse.java`
- Create: `core/src/main/java/com/lumora/core/controller/CoreHealthController.java`
- Create: `core/src/test/java/com/lumora/core/controller/CoreHealthControllerTest.java`
- Create: `core/src/test/java/com/lumora/core/config/DatabaseMigrationTest.java`
- Generate: `core/mvnw`, `core/mvnw.cmd`, `core/.mvn/wrapper/maven-wrapper.properties`

**Interfaces:**
- Produces Python stdout line: `LUMORA_READY {"service":"agent","port":<port>}`
- Produces authenticated `GET /api/v1/health`
- Health JSON fields: `serviceName`, `serviceVersion`, `protocolVersion`
- Java startup automatically applies Liquibase changes to the configured SQLite database.

- [ ] **Step 1: Write the failing Python ready-line test**

```python
import json
import unittest

from app.main import format_ready_event


class ReadyEventTest(unittest.TestCase):
    def test_formats_machine_readable_ready_event(self) -> None:
        line = format_ready_event(45123)
        prefix, payload = line.split(" ", 1)
        self.assertEqual(prefix, "LUMORA_READY")
        self.assertEqual(
            json.loads(payload),
            {"service": "agent", "port": 45123},
        )
```

Run:

```powershell
agent\.venv\Scripts\python.exe -m unittest agent.tests.test_main -v
```

Expected: FAIL because `format_ready_event` does not exist.

- [ ] **Step 2: Implement and verify the Python ready event**

Add this pure formatter. Immediately after `await server.start()`, print its result:

```python
def format_ready_event(port: int) -> str:
    payload = json.dumps(
        {"service": "agent", "port": port},
        separators=(",", ":"),
    )
    return f"LUMORA_READY {payload}"

print(format_ready_event(bound_port), flush=True)
```

Re-run the test and expect PASS.

- [ ] **Step 3: Write failing Java health tests**

Create a standalone MockMvc test that wires `CoreHealthController` and
`SessionTokenFilter`. Assert no token returns 401 and the correct bearer token
returns:

```json
{
  "serviceName": "lumora-core",
  "serviceVersion": "0.1.0",
  "protocolVersion": "1"
}
```

Run:

```powershell
cd core
mvn -Dtest=CoreHealthControllerTest test
```

Expected: test compilation FAIL because controller and DTO are absent.

- [ ] **Step 4: Implement Java health endpoint**

Create `CoreHealthResponse` as a regular Java class with constructor and getters.
Create `CoreHealthController` at `/api/v1/health`, reading protocol version from
`CoreProperties`. Keep version `0.1.0` in a named constant until build metadata is
introduced.

Re-run `CoreHealthControllerTest`; expected PASS.

- [ ] **Step 5: Write the failing real SQLite migration test**

Use `@SpringBootTest(webEnvironment = NONE)` and `@DynamicPropertySource` to point
to a unique `target/migration-<uuid>.db`. Query `sqlite_master` and
`DATABASECHANGELOG` through `JdbcTemplate`. Assert `agent_task`,
`approval_request`, and one Liquibase change set exist. Autowire
`liquibase.integration.spring.SpringLiquibase`, invoke `afterPropertiesSet()` a
second time against the same database, and assert the change-set count remains one.

Run:

```powershell
mvn -Dtest=DatabaseMigrationTest test
```

Expected: FAIL because Liquibase and the changelog are not configured.

- [ ] **Step 6: Add Liquibase and migrate the existing schema**

Add `org.liquibase:liquibase-core` using the Spring Boot managed version.
Create:

```yaml
databaseChangeLog:
  - changeSet:
      id: 001-initial-schema
      author: lumora
      changes:
        - sqlFile:
            path: db/migration/V1__initial_schema.sql
            relativeToChangelogFile: false
            splitStatements: true
            stripComments: false
```

Configure:

```yaml
spring:
  datasource:
    hikari:
      connection-init-sql: PRAGMA foreign_keys=ON
  liquibase:
    change-log: classpath:db/changelog/db.changelog-master.yaml
```

Re-run `DatabaseMigrationTest`; expected PASS on first context startup and no
duplicate schema error on a second `mvn test`.

- [ ] **Step 7: Generate the Maven Wrapper**

From `core/` run:

```powershell
mvn -N wrapper:wrapper
```

Verify:

```powershell
.\mvnw.cmd --version
.\mvnw.cmd test
```

Expected: Maven Wrapper reports a Maven version and all Java tests PASS.

- [ ] **Step 8: Commit**

```powershell
git add agent/app/main.py agent/tests/test_main.py core/pom.xml core/mvnw core/mvnw.cmd core/.mvn/wrapper core/src/main/resources core/src/main/java/com/lumora/core/controller/CoreHealthController.java core/src/main/java/com/lumora/core/dto/response/CoreHealthResponse.java core/src/test/java/com/lumora/core/controller/CoreHealthControllerTest.java core/src/test/java/com/lumora/core/config/DatabaseMigrationTest.java
git commit -m "feat: add backend readiness and automatic migrations"
```

---

### Task 5: Health Checks and Owned Process Supervisor

**Files:**
- Create: `integration/dev/health-checks.mjs`
- Create: `integration/dev/supervisor.mjs`
- Create: `integration/tests/dev/supervisor.test.mjs`
- Create: `integration/tests/dev/fixtures/child.mjs`

**Interfaces:**
- Produces: `waitForTcp(options): Promise<void>`
- Produces: `waitForCoreHealth(options): Promise<CoreHealth>`
- Produces: `ChildSupervisor`
- `ChildSupervisor.start(spec)` returns an owned `ManagedChild`.
- `ManagedChild.waitForLine(predicate, { timeoutMs }): Promise<string>` exposes
  machine-readable ready lines without coupling orchestration to raw streams.
- `ManagedChild.isRunning(): boolean` reports whether the owned child is alive.
- `ChildSupervisor.shutdown(reason, options)` stops only records created by that instance.

- [ ] **Step 1: Write failing health and supervisor tests**

Cover these exact behaviors:

- TCP wait resolves after a fixture server starts.
- Java health polling sends `Authorization: Bearer <token>` and validates protocol version.
- An unexpected backend exit invokes the failure callback.
- Shutdown requests graceful termination, then invokes the injected Windows tree-kill
  function only for still-running owned PIDs.
- A second shutdown call is idempotent.

The fixture child accepts `--exit-code`, `--delay-ms`, and `--stay-alive` arguments,
prints one line, and handles `SIGTERM`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test integration/tests/dev/supervisor.test.mjs
```

Expected: FAIL because health and supervisor modules are absent.

- [ ] **Step 3: Implement health polling**

`waitForTcp` retries until timeout while also consulting an optional
`isProcessAlive` callback. `waitForCoreHealth` uses Node `fetch`, the bearer token,
and rejects a response whose `protocolVersion` differs from the requested version.
Timeout errors include service name, host, port and elapsed time, but never the token.

- [ ] **Step 4: Implement the supervisor**

Use `spawn` with `shell: false`, `windowsHide: true`, explicit `cwd` and environment.
Pipe stdout/stderr through the logger from Task 3. Track only returned child objects.
Each `ManagedChild` buffers complete stdout lines until consumed by `waitForLine`; reject
pending line waits when the process exits.

Graceful shutdown calls `child.kill()` once. After five seconds, Windows fallback
uses:

```powershell
taskkill /PID <owned-pid> /T /F
```

The PID must come from the owned child record, never from process-name lookup.

- [ ] **Step 5: Run GREEN verification**

Run:

```powershell
node --test integration/tests/dev/supervisor.test.mjs
```

Expected: all supervisor and health tests PASS with no fixture processes left running.

- [ ] **Step 6: Commit**

```powershell
git add integration/dev/health-checks.mjs integration/dev/supervisor.mjs integration/tests/dev/supervisor.test.mjs integration/tests/dev/fixtures/child.mjs
git commit -m "feat: supervise development process lifecycle"
```

---

### Task 6: Ordered One-Command Orchestration

**Files:**
- Create: `integration/dev/orchestrator.mjs`
- Create: `integration/dev.mjs`
- Create: `integration/tests/dev/orchestrator.test.mjs`

**Interfaces:**
- Consumes all launcher APIs from Tasks 1-5.
- Produces: `runDevelopment(options): Promise<number>`
- Produces CLI behavior for `pnpm dev`.

- [ ] **Step 1: Write failing orchestration tests with injected fakes**

```javascript
import assert from "node:assert/strict";
import test from "node:test";

import {
  runDevelopment,
} from "../../../integration/dev/orchestrator.mjs";

const fakeBootstrap = {
  pythonExecutable: "python.exe",
  javaHome: "C:\\jdk-21",
  mavenWrapper: "mvnw.cmd",
};
const fakeConfig = {
  agentEnvironment: {},
  coreEnvironment: {},
  desktopEnvironment: {},
};

function fakeSupervisor(events) {
  return {
    start(spec) {
      events.push(`start-${spec.name}`);
      return {
        isRunning: () => true,
        waitForLine: async () => "LUMORA_READY",
      };
    },
    async shutdown() {
      events.push("shutdown");
    },
  };
}

test("starts Python, then Java, then Desktop", async () => {
  const events = [];
  const exitCode = await runDevelopment({
    bootstrap: async () => fakeBootstrap,
    createConfig: async () => fakeConfig,
    supervisor: fakeSupervisor(events),
    waitForAgent: async () => events.push("agent-ready"),
    waitForCore: async () => events.push("core-ready"),
    waitForDesktopExit: async () => 0,
  });
  assert.equal(exitCode, 0);
  assert.deepEqual(events, [
    "start-agent",
    "agent-ready",
    "start-core",
    "core-ready",
    "start-desktop",
    "shutdown",
  ]);
});

test("does not start Desktop when Java health fails", async () => {
  const events = [];
  await assert.rejects(
    () => runDevelopment({
      bootstrap: async () => fakeBootstrap,
      createConfig: async () => fakeConfig,
      supervisor: fakeSupervisor(events),
      waitForAgent: async () => events.push("agent-ready"),
      waitForCore: async () => {
        throw new Error("core timeout");
      },
      waitForDesktopExit: async () => 0,
    }),
    /core timeout/,
  );
  assert.equal(events.includes("start-desktop"), false);
  assert.equal(events.at(-1), "shutdown");
});

test("does not start Core when Agent readiness fails", async () => {
  const events = [];
  await assert.rejects(
    () => runDevelopment({
      bootstrap: async () => fakeBootstrap,
      createConfig: async () => fakeConfig,
      supervisor: fakeSupervisor(events),
      waitForAgent: async () => {
        throw new Error("agent exited before ready");
      },
      waitForCore: async () => events.push("core-ready"),
      waitForDesktopExit: async () => 0,
    }),
    /agent exited before ready/,
  );
  assert.equal(events.includes("start-core"), false);
  assert.equal(events.includes("start-desktop"), false);
  assert.equal(events.at(-1), "shutdown");
});

test("SIGINT triggers owned-process shutdown", async () => {
  const events = [];
  let interrupt;
  let finishDesktop;
  const desktopExit = new Promise((resolve) => {
    finishDesktop = resolve;
  });
  const running = runDevelopment({
    bootstrap: async () => fakeBootstrap,
    createConfig: async () => fakeConfig,
    supervisor: fakeSupervisor(events),
    waitForAgent: async () => events.push("agent-ready"),
    waitForCore: async () => events.push("core-ready"),
    waitForDesktopExit: async () => desktopExit,
    registerSignals: (handlers) => {
      interrupt = handlers.onInterrupt;
      return () => {};
    },
  });
  while (!events.includes("start-desktop")) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  await interrupt();
  finishDesktop(0);
  await running;
  assert.equal(events.filter((event) => event === "shutdown").length, 1);
});
```

The normal-order test covers normal Electron exit. The Agent test covers failure before
Core startup, the Core test covers failure before Desktop startup, and the supervisor
tests from Task 5 cover an unexpected backend exit after readiness.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test integration/tests/dev/orchestrator.test.mjs
```

Expected: FAIL because `orchestrator.mjs` is absent.

- [ ] **Step 3: Implement ordered orchestration**

Build child specs exactly as follows:

- Agent: virtualenv Python, args `-m app.main`, cwd `agent/`.
- Core: `core/mvnw.cmd`, args `spring-boot:run`, cwd `core/`.
- Desktop: `pnpm.cmd`, args `--filter`, `lumora-desktop`, `start`, cwd repository root.

Wait for the Agent ready line and TCP check before starting Core. Poll authenticated
Core health before starting Desktop. Register `SIGINT`, `SIGTERM`, unexpected child
exit and Desktop exit handlers before the first child starts. A failed backend must
never start Electron and must never select `DemoTaskGateway`. `Ctrl+C` must call the
same idempotent shutdown path as a child-process failure.

- [ ] **Step 4: Implement the CLI entry**

`integration/dev.mjs` calls `runDevelopment`, prints one concise bootstrap summary,
sets `process.exitCode`, and catches errors with the failing stage name. It must not
print stack traces for expected environment errors unless
`LUMORA_DEV_DEBUG=true`.

- [ ] **Step 5: Run GREEN verification**

Run:

```powershell
pnpm.cmd test:launcher
```

Expected: all launcher unit tests PASS.

- [ ] **Step 6: Perform a real smoke run**

Run:

```powershell
pnpm.cmd dev
```

Expected:

- unchanged dependencies and protocol generation are reported as skipped;
- `[agent]` ready appears before `[core]`;
- authenticated Core health succeeds before `[desktop]` starts;
- Electron opens using `RestTaskGateway`;
- closing Electron returns the command prompt;
- `Get-Process java,python,electron -ErrorAction SilentlyContinue` shows no processes
  owned by the completed launcher run.

- [ ] **Step 7: Commit**

```powershell
git add integration/dev.mjs integration/dev/orchestrator.mjs integration/tests/dev/orchestrator.test.mjs
git commit -m "feat: add one-command development launcher"
```

---

### Task 7: Unified Verification and Documentation

**Files:**
- Modify: `integration/verify.ps1`
- Modify: `integration/tests/repository-boundaries.ps1`
- Modify: `README.md`
- Modify: `integration/README.md`
- Modify: `docs/development.md`
- Modify: `desktop/README.md`
- Modify: `core/README.md`
- Modify: `agent/README.md`
- Modify locally only: `generalDesign/windows-ai-assistant-architecture.md`

**Interfaces:**
- Produces documented standard command `pnpm dev`.
- Preserves component-specific test/debug commands.
- Records that development uses `integration`, while production uses Electron Main
  → Java Core → Python Agent ownership.

- [ ] **Step 1: Add failing structural checks**

Extend repository checks to require root `package.json`, `pnpm-workspace.yaml`,
`integration/dev.mjs`, launcher modules, Maven Wrapper, Liquibase changelog and
health controller. Reject a checked-in `agent/generated/` directory and reject
business-source imports from `integration/dev/`.

Run:

```powershell
powershell -ExecutionPolicy Bypass -File integration/tests/repository-boundaries.ps1
```

Expected before completing the check list: FAIL for any intentionally omitted required
launcher file; after all prior tasks it should become PASS.

- [ ] **Step 2: Add launcher tests to unified verification**

Before Python tests, add:

```powershell
Invoke-ProjectCheck 'Development launcher tests' {
    pnpm.cmd test:launcher
}
```

Keep Java behind `-IncludeJava` and packaging behind `-IncludePackage`.

- [ ] **Step 3: Synchronize tracked documentation**

Document:

- first run may install repository dependencies and create `agent/.venv`;
- subsequent runs use fingerprints and skip unchanged work;
- runtime logs and SQLite path;
- exact failure behavior and individual IDE debugging commands;
- no manual child-process environment variables for normal development;
- formal packaging ownership is Electron Main → Java Core → Python Agent.

Do not claim formal packaging is implemented in this phase.

- [ ] **Step 4: Synchronize the untracked general design locally**

Update `generalDesign/windows-ai-assistant-architecture.md` with the same development
and production ownership distinction. Confirm `git status --short` still shows
`?? generalDesign/` and do not stage it.

- [ ] **Step 5: Run complete verification**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File integration/verify.ps1 `
  -PythonCommand agent\.venv\Scripts\python.exe `
  -IncludeJava
git diff --check
```

Expected:

- repository, protocol, Java scaffold and Python scaffold checks PASS;
- launcher tests PASS;
- Python tests PASS;
- Desktop tests and typecheck PASS;
- Java tests and Liquibase migration tests PASS;
- `git diff --check` exits 0.

- [ ] **Step 6: Review and commit**

Review the complete diff against
`docs/superpowers/specs/2026-07-24-unified-development-launcher-design.md`.
Request a read-only code review and fix all Critical or Important findings.

Commit:

```powershell
git add README.md integration docs/development.md desktop/README.md core/README.md agent/README.md
git commit -m "docs: document unified development workflow"
```

Do not add `artwork/` or `generalDesign/`.
