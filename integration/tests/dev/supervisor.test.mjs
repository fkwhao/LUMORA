import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http from "node:http";
import net from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";

import {
  waitForCoreHealth,
  waitForTcp,
} from "../../../integration/dev/health-checks.mjs";
import { allocateLoopbackPort } from "../../../integration/dev/ports.mjs";
import { ChildSupervisor } from "../../../integration/dev/supervisor.mjs";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixturePath = fileURLToPath(new URL("./fixtures/child.mjs", import.meta.url));

test("TCP wait resolves after a fixture server starts", async (t) => {
  const port = await allocateLoopbackPort();
  const server = net.createServer((socket) => socket.end());
  t.after(() => closeServer(server));
  setTimeout(() => server.listen({ host: "127.0.0.1", port }), 30);

  await waitForTcp({
    serviceName: "fixture-agent",
    host: "127.0.0.1",
    port,
    timeoutMs: 1_000,
    retryIntervalMs: 10,
  });

  assert.equal(server.listening, true);
});

test("TCP wait stops when its owned process exits", async () => {
  const port = await allocateLoopbackPort();
  let checks = 0;

  await assert.rejects(
    () => waitForTcp({
      serviceName: "fixture-agent",
      host: "127.0.0.1",
      port,
      timeoutMs: 1_000,
      retryIntervalMs: 5,
      isProcessAlive: () => {
        checks += 1;
        return false;
      },
    }),
    /fixture-agent.*exited/i,
  );
  assert.equal(checks, 1);
});

test("TCP wait cancels an in-flight connection when its process exits", async () => {
  const socket = new EventEmitter();
  let connectionCalls = 0;
  let destroyed = false;
  let checks = 0;
  socket.destroy = () => {
    destroyed = true;
  };

  await assert.rejects(
    () => waitForTcp({
      serviceName: "fixture-agent",
      host: "127.0.0.1",
      port: 9,
      timeoutMs: 500,
      retryIntervalMs: 5,
      isProcessAlive: () => {
        checks += 1;
        return checks === 1;
      },
      createConnection: () => {
        connectionCalls += 1;
        return socket;
      },
    }),
    /fixture-agent.*exited/i,
  );

  assert.equal(connectionCalls, 1);
  assert.equal(destroyed, true);
});

test("TCP timeout names the endpoint and elapsed time", async () => {
  const port = await allocateLoopbackPort();
  const startedAt = Date.now();

  await assert.rejects(
    () => waitForTcp({
      serviceName: "fixture-agent",
      host: "127.0.0.1",
      port,
      timeoutMs: 50,
      retryIntervalMs: 5,
    }),
    (error) => {
      assert.match(error.message, /fixture-agent/);
      assert.match(error.message, /127\.0\.0\.1/);
      assert.match(error.message, new RegExp(String(port)));
      assert.match(error.message, /elapsed/i);
      assert.ok(Date.now() - startedAt >= 40);
      return true;
    },
  );
});

test("core health polling sends its bearer token and returns the matching contract", async (t) => {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({
      authorization: request.headers.authorization,
      url: request.url,
    });
    if (requests.length === 1) {
      response.writeHead(503).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      serviceName: "lumora-core",
      serviceVersion: "0.1.0",
      protocolVersion: "v1",
    }));
  });
  await listen(server);
  t.after(() => closeServer(server));
  const { port } = server.address();

  const health = await waitForCoreHealth({
    serviceName: "core",
    host: "127.0.0.1",
    port,
    token: "startup-secret",
    protocolVersion: "v1",
    timeoutMs: 1_000,
    retryIntervalMs: 5,
  });

  assert.deepEqual(health, {
    serviceName: "lumora-core",
    serviceVersion: "0.1.0",
    protocolVersion: "v1",
  });
  assert.deepEqual(requests, [
    { authorization: "Bearer startup-secret", url: "/api/v1/health" },
    { authorization: "Bearer startup-secret", url: "/api/v1/health" },
  ]);
});

test("core health cancels an in-flight request when its process exits", async () => {
  let checks = 0;
  const startedAt = Date.now();

  await assert.rejects(
    () => waitForCoreHealth({
      serviceName: "core",
      host: "127.0.0.1",
      port: 45102,
      token: "startup-secret",
      protocolVersion: "v1",
      timeoutMs: 500,
      retryIntervalMs: 5,
      isProcessAlive: () => {
        checks += 1;
        return checks === 1;
      },
      fetch: (_endpoint, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    }),
    /core.*exited/i,
  );

  assert.ok(Date.now() - startedAt < 250);
});

test("core health rejects a mismatched protocol without leaking the token", async (t) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      serviceName: "lumora-core",
      serviceVersion: "0.1.0",
      protocolVersion: "v2",
    }));
  });
  await listen(server);
  t.after(() => closeServer(server));
  const { port } = server.address();

  await assert.rejects(
    () => waitForCoreHealth({
      serviceName: "core",
      host: "127.0.0.1",
      port,
      token: "never-print-this-token",
      protocolVersion: "v1",
      timeoutMs: 1_000,
      retryIntervalMs: 5,
    }),
    (error) => {
      assert.match(error.message, /protocol.*v1.*v2/i);
      assert.doesNotMatch(error.message, /never-print-this-token/);
      return true;
    },
  );
});

test("core health redacts a token echoed as the mismatched protocol", async (t) => {
  const token = "echoed-startup-secret";
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      serviceName: "lumora-core",
      serviceVersion: "0.1.0",
      protocolVersion: token,
    }));
  });
  await listen(server);
  t.after(() => closeServer(server));
  const { port } = server.address();

  await assert.rejects(
    () => waitForCoreHealth({
      serviceName: "core",
      host: "127.0.0.1",
      port,
      token,
      protocolVersion: "v1",
      timeoutMs: 1_000,
      retryIntervalMs: 5,
    }),
    (error) => {
      assert.match(error.message, /protocol.*v1/i);
      assert.doesNotMatch(error.message, new RegExp(token));
      return true;
    },
  );
});

test("core health timeout describes the endpoint but never the token", async () => {
  const port = await allocateLoopbackPort();

  await assert.rejects(
    () => waitForCoreHealth({
      serviceName: "core",
      host: "127.0.0.1",
      port,
      token: "never-print-this-token",
      protocolVersion: "v1",
      timeoutMs: 50,
      retryIntervalMs: 5,
    }),
    (error) => {
      assert.match(error.message, /core/);
      assert.match(error.message, /127\.0\.0\.1/);
      assert.match(error.message, new RegExp(String(port)));
      assert.match(error.message, /elapsed/i);
      assert.doesNotMatch(error.message, /never-print-this-token/);
      return true;
    },
  );
});

test("ManagedChild reconstructs and caches complete stdout lines", async (t) => {
  const supervisor = await createRealSupervisor();
  t.after(() => supervisor.shutdown("test cleanup", { gracePeriodMs: 500 }));
  const child = supervisor.start({
    name: "cached-line",
    command: process.execPath,
    args: [fixturePath, "--stay-alive"],
    cwd: repoRoot,
    environment: process.env,
  });

  await delay(100);
  assert.equal(
    await child.waitForLine((line) => line === "fixture ready", { timeoutMs: 500 }),
    "fixture ready",
  );
  assert.equal(child.isRunning(), true);
});

test("ManagedChild reconstructs a line from deterministic stdout chunks", async () => {
  const process = createFakeChild(4000);
  const supervisor = new ChildSupervisor({
    spawn: createSpawnQueue([process]),
    loggerFactory: createNullLogger,
  });
  const child = supervisor.start({
    name: "chunked-line",
    command: "node",
    cwd: repoRoot,
    environment: {},
  });
  const readyLine = child.waitForLine(
    (line) => line === "fixture ready",
    { timeoutMs: 200 },
  );

  process.stdout.write(Buffer.from("fixture "));
  process.stdout.write(Buffer.from("ready\n"));

  assert.equal(await readyLine, "fixture ready");
});

test("ManagedChild times out unmatched waits and rejects pending waits on exit", async (t) => {
  const supervisor = await createRealSupervisor();
  t.after(() => supervisor.shutdown("test cleanup", { gracePeriodMs: 500 }));
  const stayingChild = supervisor.start({
    name: "wait-timeout",
    command: process.execPath,
    args: [fixturePath, "--stay-alive"],
    cwd: repoRoot,
    environment: process.env,
  });
  await assert.rejects(
    () => stayingChild.waitForLine(() => false, { timeoutMs: 40 }),
    /wait-timeout.*line.*timed out/i,
  );

  const exitingChild = supervisor.start({
    name: "early-exit",
    command: process.execPath,
    args: [fixturePath, "--delay-ms", "20", "--exit-code", "5"],
    cwd: repoRoot,
    environment: process.env,
  });
  await assert.rejects(
    () => exitingChild.waitForLine(() => false, { timeoutMs: 1_000 }),
    /early-exit.*exited.*5/i,
  );
  assert.equal(exitingChild.isRunning(), false);
});

test("ManagedChild rejects a pending line wait on exit before stdio closes", async () => {
  const process = createFakeChild(4001);
  const supervisor = new ChildSupervisor({
    spawn: createSpawnQueue([process]),
    loggerFactory: createNullLogger,
  });
  const child = supervisor.start({
    name: "exit-before-close",
    command: "node",
    cwd: repoRoot,
    environment: {},
  });
  const line = child.waitForLine(() => false, { timeoutMs: 200 });

  process.exitCode = 6;
  process.emit("exit", 6, null);

  await assert.rejects(() => line, /exit-before-close.*exited.*6/i);
  assert.equal(child.isRunning(), false);
});

test("an unexpected backend exit invokes the failure callback", { timeout: 1_000 }, async (t) => {
  let resolveFailure;
  const failure = new Promise((resolve) => {
    resolveFailure = resolve;
  });
  const supervisor = await createRealSupervisor({
    onUnexpectedExit: resolveFailure,
  });
  t.after(() => supervisor.shutdown("test cleanup", { gracePeriodMs: 100 }));
  const child = supervisor.start({
    name: "backend",
    command: process.execPath,
    args: [fixturePath, "--exit-code", "7"],
    cwd: repoRoot,
    environment: process.env,
  });

  const event = await failure;

  assert.equal(event.name, "backend");
  assert.equal(event.pid, child.pid);
  assert.equal(event.exitCode, 7);
  assert.equal(event.signal, null);
  assert.equal(child.isRunning(), false);
});

test("shutdown gracefully stops children then tree-kills only still-running owned PIDs", async () => {
  const graceful = createFakeChild(4101, { exitOnKill: true });
  const stubborn = createFakeChild(4102);
  const foreign = createFakeChild(5101);
  const firstSpawn = createSpawnQueue([graceful, stubborn]);
  const secondSpawn = createSpawnQueue([foreign]);
  const treeKilled = [];
  const supervisor = new ChildSupervisor({
    platform: "win32",
    spawn: firstSpawn,
    treeKill: async (pid) => {
      treeKilled.push(pid);
      stubborn.exitCode = 1;
      stubborn.emit("exit", 1, null);
    },
    loggerFactory: createNullLogger,
  });
  const otherSupervisor = new ChildSupervisor({
    platform: "win32",
    spawn: secondSpawn,
    treeKill: async (pid) => treeKilled.push(pid),
    loggerFactory: createNullLogger,
  });
  const spec = {
    name: "core",
    command: "node.exe",
    args: ["fixture.mjs"],
    cwd: repoRoot,
    environment: { PATH: "explicit-path" },
  };

  supervisor.start(spec);
  supervisor.start({ ...spec, name: "desktop" });
  otherSupervisor.start({ ...spec, name: "foreign" });
  const firstShutdown = supervisor.shutdown("test", { gracePeriodMs: 0 });
  const secondShutdown = supervisor.shutdown("ignored", { gracePeriodMs: 0 });

  assert.strictEqual(secondShutdown, firstShutdown);
  await firstShutdown;
  assert.equal(graceful.killCalls, 1);
  assert.equal(stubborn.killCalls, 1);
  assert.equal(foreign.killCalls, 0);
  assert.deepEqual(treeKilled, [4102]);
  assert.deepEqual(firstSpawn.calls[0], [
    "node.exe",
    ["fixture.mjs"],
    {
      cwd: repoRoot,
      env: { PATH: "explicit-path" },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  ]);
});

test("default Windows tree kill uses taskkill with one owned PID and no shell", async () => {
  const stubborn = createFakeChild(4201);
  const calls = [];
  const supervisor = new ChildSupervisor({
    platform: "win32",
    spawn: createSpawnQueue([stubborn]),
    execFile(command, args, options, callback) {
      calls.push([command, args, options]);
      callback(null);
      stubborn.exitCode = 1;
      stubborn.emit("exit", 1, null);
    },
    loggerFactory: createNullLogger,
  });

  supervisor.start({
    name: "core",
    command: "node.exe",
    args: ["fixture.mjs"],
    cwd: repoRoot,
    environment: { PATH: "explicit-path" },
  });
  await supervisor.shutdown("test", { gracePeriodMs: 0 });

  assert.deepEqual(calls, [[
    "taskkill",
    ["/PID", "4201", "/T", "/F"],
    { windowsHide: true },
  ]]);
});

test("shutdown waits for a tree-killed owned child to report exit", async () => {
  const stubborn = createFakeChild(4301);
  let resolveTreeKillStarted;
  const treeKillStarted = new Promise((resolve) => {
    resolveTreeKillStarted = resolve;
  });
  let finishTreeKill;
  const supervisor = new ChildSupervisor({
    platform: "win32",
    spawn: createSpawnQueue([stubborn]),
    treeKill: () => {
      resolveTreeKillStarted();
      return new Promise((resolve) => {
        finishTreeKill = resolve;
      });
    },
    loggerFactory: createNullLogger,
  });
  const child = supervisor.start({
    name: "stubborn",
    command: "node.exe",
    cwd: repoRoot,
    environment: {},
  });

  let shutdownSettled = false;
  const shutdown = supervisor.shutdown("test", { gracePeriodMs: 0 });
  shutdown.then(() => {
    shutdownSettled = true;
  });
  await treeKillStarted;
  finishTreeKill();
  await delay(0);

  assert.equal(shutdownSettled, false);
  stubborn.exitCode = 1;
  stubborn.emit("exit", 1, null);
  await shutdown;
  assert.equal(child.isRunning(), false);
});

test("start rejects a missing explicit cwd or environment before spawning", () => {
  for (const missingField of ["cwd", "environment"]) {
    const process = createFakeChild(4401);
    const spawn = createSpawnQueue([process]);
    const supervisor = new ChildSupervisor({
      spawn,
      loggerFactory: createNullLogger,
    });
    const spec = {
      name: "core",
      command: "node",
      cwd: repoRoot,
      environment: {},
    };
    delete spec[missingField];

    assert.throws(() => supervisor.start(spec), new RegExp(missingField, "i"));
    assert.equal(spawn.calls.length, 0);
  }
});

async function createRealSupervisor(options = {}) {
  return new ChildSupervisor({
    ...options,
    platform: "win32",
    treeKill: async () => {
      throw new Error("real taskkill must not run in tests");
    },
    loggerFactory: createNullLogger,
  });
}

function createNullLogger() {
  return {
    write() {},
    async close() {},
  };
}

function createFakeChild(pid, options = {}) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.killCalls = 0;
  child.kill = () => {
    child.killCalls += 1;
    if (options.exitOnKill) {
      queueMicrotask(() => {
        child.exitCode = 0;
        child.emit("close", 0, null);
      });
    }
    return true;
  };
  return child;
}

function createSpawnQueue(children) {
  const queue = [...children];
  const spawn = (...argumentsList) => {
    spawn.calls.push(argumentsList);
    return queue.shift();
  };
  spawn.calls = [];
  return spawn;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
