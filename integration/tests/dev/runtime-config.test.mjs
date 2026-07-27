import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createProcessLogger, redactSecrets } from "../../../integration/dev/logging.mjs";
import { allocateLoopbackPort } from "../../../integration/dev/ports.mjs";
import { createRuntimeConfig } from "../../../integration/dev/runtime-config.mjs";

test("runtime config uses distinct ports and injects one token", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "lumora-runtime-"));
  const ports = [45101, 45102];
  const config = await createRuntimeConfig({
    repoRoot,
    allocatePort: async () => ports.shift(),
    randomBytes: () => Buffer.alloc(32, 7),
    startedAt: new Date("2026-07-24T00:00:00Z"),
    environment: { PATH: "inherited-path", PYTHONPATH: "inherited-python" },
  });

  assert.equal(config.agentPort, 45101);
  assert.equal(config.corePort, 45102);
  assert.equal(config.token, "07".repeat(32));
  assert.equal(config.protocolVersion, "v1");
  assert.equal(config.databasePath, path.join(repoRoot, "integration", "runtime", "lumora.db"));
  assert.equal(config.logDirectory, path.join(repoRoot, "integration", "runtime", "logs", "2026-07-24T00-00-00.000Z"));
  assert.deepEqual(config.agentEnvironment, {
    PATH: "inherited-path",
    PYTHONPATH: `${path.join(repoRoot, "agent")}${path.delimiter}inherited-python`,
    LUMORA_AGENT_PORT: "45101",
    LUMORA_STARTUP_TOKEN: config.token,
    LUMORA_PROTOCOL_VERSION: "v1",
  });
  assert.deepEqual(config.coreEnvironment, {
    PATH: "inherited-path",
    PYTHONPATH: "inherited-python",
    LUMORA_CORE_PORT: "45102",
    LUMORA_AGENT_PORT: "45101",
    LUMORA_STARTUP_TOKEN: config.token,
    LUMORA_AGENT_STARTUP_TOKEN: config.token,
    LUMORA_PROTOCOL_VERSION: "v1",
    LUMORA_DATABASE_PATH: config.databasePath,
  });
  assert.deepEqual(config.desktopEnvironment, {
    PATH: "inherited-path",
    PYTHONPATH: "inherited-python",
    LUMORA_CORE_URL: "http://127.0.0.1:45102",
    LUMORA_STARTUP_TOKEN: config.token,
  });
  assert.deepEqual(config.environments, {
    agent: config.agentEnvironment,
    core: config.coreEnvironment,
    desktop: config.desktopEnvironment,
  });
});

test("runtime config rejects duplicate ports", async () => {
  await assert.rejects(
    () => createRuntimeConfig({
      repoRoot: "runtime-test-root",
      allocatePort: async () => 45101,
      randomBytes: () => Buffer.alloc(32),
    }),
    /distinct/i,
  );
});

test("loopback allocation binds only the IPv4 loopback address", async () => {
  let listenOptions;
  let closed = false;
  const server = {
    once(event, handler) {
      if (event === "listening") queueMicrotask(handler);
      return this;
    },
    listen(options) {
      listenOptions = options;
    },
    address() {
      return { port: 45101 };
    },
    close(handler) {
      closed = true;
      queueMicrotask(handler);
    },
  };

  const port = await allocateLoopbackPort({ createServer: () => server });

  assert.equal(port, 45101);
  assert.deepEqual(listenOptions, { host: "127.0.0.1", port: 0 });
  assert.equal(closed, true);
});

test("redactSecrets removes every literal token from logs", () => {
  assert.equal(
    redactSecrets("Authorization: Bearer secret-token; secret-token", ["secret-token"]),
    "Authorization: Bearer [REDACTED]; [REDACTED]",
  );
});

test("process logger redacts complete UTF-8 lines and flushes its final chunk on close", async () => {
  const logDirectory = await mkdtemp(path.join(tmpdir(), "lumora-logs-"));
  const consoleLines = [];
  const logger = createProcessLogger({
    name: "agent",
    logDirectory,
    secrets: ["secret-token"],
    console: { log: (line) => consoleLines.push(line), error: (line) => consoleLines.push(line) },
  });

  const firstLine = Buffer.from("状态 ready secret-token\n", "utf8");
  logger.write("stdout", firstLine.subarray(0, 2));
  logger.write("stdout", firstLine.subarray(2));
  logger.write("stdout", "next line");
  logger.write("stderr", "failure secret-token\n");
  await logger.close();

  assert.deepEqual(consoleLines, [
    "[agent] 状态 ready [REDACTED]",
    "[agent] failure [REDACTED]",
    "[agent] next line",
  ]);
  assert.equal(
    await readFile(path.join(logDirectory, "agent.log"), "utf8"),
    "[agent] 状态 ready [REDACTED]\n[agent] failure [REDACTED]\n[agent] next line\n",
  );
});

test("process logger rejects writes after closing and close remains idempotent", async () => {
  const logDirectory = await mkdtemp(path.join(tmpdir(), "lumora-logs-close-"));
  const logger = createProcessLogger({
    name: "core",
    logDirectory,
    console: { log: () => {}, error: () => {} },
  });

  logger.write("stdout", "final line");
  const firstClose = logger.close();

  assert.strictEqual(logger.close(), firstClose);
  assert.throws(() => logger.write("stdout", "late during close"), /closed/i);
  await firstClose;
  assert.throws(() => logger.write("stderr", "late after close"), /closed/i);
  assert.equal(await readFile(path.join(logDirectory, "core.log"), "utf8"), "[core] final line\n");
});
