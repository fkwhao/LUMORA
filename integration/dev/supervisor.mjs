import { execFile, spawn as spawnProcess } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

import { createProcessLogger } from "./logging.mjs";

export class ChildSupervisor {
  constructor(options = {}) {
    this.platform = options.platform ?? process.platform;
    this.spawn = options.spawn ?? spawnProcess;
    const runExecFile = options.execFile ?? execFile;
    this.treeKill = options.treeKill
      ?? ((pid) => killWindowsProcessTree(pid, runExecFile));
    this.loggerFactory = options.loggerFactory ?? createProcessLogger;
    this.onUnexpectedExit = options.onUnexpectedExit;
    this.logDirectory = options.logDirectory;
    this.secrets = options.secrets ?? [];
    this.console = options.console;
    this.records = new Set();
    this.shutdownStarted = false;
    this.shutdownPromise = undefined;
  }

  start(spec) {
    if (this.shutdownStarted) {
      throw new Error(`Cannot start ${spec.name} after supervisor shutdown`);
    }
    if (spec.cwd === undefined || spec.cwd === null) {
      throw new Error(`${spec.name} requires an explicit cwd`);
    }
    if (spec.environment === undefined || spec.environment === null) {
      throw new Error(`${spec.name} requires an explicit environment`);
    }

    const logger = this.loggerFactory({
      name: spec.name,
      logDirectory: spec.logDirectory ?? this.logDirectory,
      secrets: spec.secrets ?? this.secrets,
      console: spec.console ?? this.console,
    });
    let child;
    try {
      child = this.spawn(spec.command, spec.args ?? [], {
        cwd: spec.cwd,
        env: spec.environment,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      void Promise.resolve(logger.close()).catch(() => {});
      throw error;
    }

    const record = new ManagedChild({
      name: spec.name,
      child,
      logger,
      onExit: (event) => this.handleExit(record, event),
    });
    // 所有权边界：只记录本实例 spawn 返回的 PID，绝不按进程名查找或终止。
    this.records.add(record);
    return record;
  }

  shutdown(reason, options = {}) {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shutdownStarted = true;
    this.shutdownPromise = this.performShutdown(reason, options);
    return this.shutdownPromise;
  }

  async performShutdown(_reason, options) {
    const gracePeriodMs = options.gracePeriodMs ?? 5_000;
    const ownedRecords = [...this.records];

    // 关闭生命周期：每个 owned child 先且只请求一次优雅退出，再处理仍存活的 PID。
    for (const record of ownedRecords) {
      record.requestGracefulShutdown();
    }

    await waitForExitUntil(ownedRecords, gracePeriodMs);

    const stillRunning = ownedRecords.filter((record) => record.isRunning());
    if (this.platform === "win32") {
      const killTargets = stillRunning.filter(
        (record) => Number.isInteger(record.pid) && record.pid > 0,
      );
      await Promise.all(killTargets.map((record) => this.treeKill(record.pid)));
      await Promise.all(killTargets.map((record) => record.waitForExit()));
      return;
    }

    for (const record of stillRunning) {
      record.forceKill();
    }
    await Promise.all(stillRunning.map((record) => record.waitForExit()));
  }

  handleExit(record, event) {
    if (this.shutdownStarted || !this.onUnexpectedExit) return;
    Promise.resolve(this.onUnexpectedExit({
      name: record.name,
      pid: record.pid,
      exitCode: event.exitCode,
      signal: event.signal,
      error: event.error,
    })).catch(() => {});
  }
}

class ManagedChild {
  constructor(options) {
    this.name = options.name;
    this.child = options.child;
    this.logger = options.logger;
    this.onExit = options.onExit;
    this.pid = this.child.pid;
    this.running = true;
    this.gracefulKillRequested = false;
    this.stdoutDecoder = new StringDecoder("utf8");
    this.stdoutBuffer = "";
    this.lines = [];
    this.waiters = [];
    this.exitEvent = undefined;
    this.loggerClosePromise = undefined;
    this.exitPromise = new Promise((resolve) => {
      this.resolveExit = resolve;
    });

    this.child.stdout?.on("data", (chunk) => {
      this.logger.write("stdout", chunk);
      this.appendStdout(this.stdoutDecoder.write(chunk));
    });
    this.child.stderr?.on("data", (chunk) => {
      this.logger.write("stderr", chunk);
    });
    this.child.once("error", (error) => {
      this.markExited({ exitCode: null, signal: null, error });
    });
    this.child.once("exit", (exitCode, signal) => {
      this.markExited({ exitCode, signal, error: undefined });
    });
    this.child.once("close", (exitCode, signal) => {
      this.markExited({ exitCode, signal, error: undefined });
      this.closeLogger();
    });
  }

  waitForLine(predicate, options) {
    const timeoutMs = options.timeoutMs;
    const cachedIndex = this.lines.findIndex(predicate);
    if (cachedIndex >= 0) {
      return Promise.resolve(this.lines.splice(cachedIndex, 1)[0]);
    }
    if (!this.isRunning()) {
      return Promise.reject(this.createExitError());
    }

    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: undefined };
      waiter.timer = setTimeout(() => {
        this.removeWaiter(waiter);
        reject(new Error(
          `${this.name} line wait timed out after ${timeoutMs} ms`,
        ));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  isRunning() {
    return this.running
      && this.child.exitCode === null
      && this.child.signalCode === null;
  }

  waitForExit() {
    return this.exitPromise;
  }

  requestGracefulShutdown() {
    if (!this.isRunning() || this.gracefulKillRequested) return;
    this.gracefulKillRequested = true;
    this.child.kill();
  }

  forceKill() {
    if (this.isRunning()) this.child.kill("SIGKILL");
  }

  appendStdout(text) {
    this.stdoutBuffer += text;
    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      let line = this.stdoutBuffer.slice(0, newlineIndex);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      this.consumeLine(line);
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  consumeLine(line) {
    for (const waiter of [...this.waiters]) {
      let matches;
      try {
        matches = waiter.predicate(line);
      } catch (error) {
        this.removeWaiter(waiter);
        clearTimeout(waiter.timer);
        waiter.reject(error);
        continue;
      }
      if (!matches) continue;
      this.removeWaiter(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(line);
      return;
    }
    this.lines.push(line);
  }

  markExited(event) {
    if (!this.running) return;
    this.running = false;
    this.exitEvent = event;
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(this.createExitError());
    }
    this.resolveExit(event);
    this.onExit(event);
  }

  closeLogger() {
    if (this.loggerClosePromise) return this.loggerClosePromise;
    this.stdoutDecoder.end();
    this.loggerClosePromise = Promise.resolve(this.logger.close()).catch(() => {});
    return this.loggerClosePromise;
  }

  createExitError() {
    const exitCode = this.exitEvent?.exitCode ?? this.child.exitCode;
    const signal = this.exitEvent?.signal ?? this.child.signalCode;
    const detail = exitCode === null
      ? `signal ${signal ?? "unknown"}`
      : `code ${exitCode}`;
    return new Error(`${this.name} exited before a matching line (${detail})`);
  }

  removeWaiter(waiter) {
    const index = this.waiters.indexOf(waiter);
    if (index >= 0) this.waiters.splice(index, 1);
  }
}

function killWindowsProcessTree(pid, runExecFile) {
  return new Promise((resolve, reject) => {
    runExecFile(
      "taskkill",
      ["/PID", String(pid), "/T", "/F"],
      { windowsHide: true },
      (error) => {
        if (error) {
          reject(new Error(`Failed to terminate owned process tree for PID ${pid}`));
          return;
        }
        resolve();
      },
    );
  });
}

function waitForExitUntil(records, timeoutMs) {
  const runningRecords = records.filter((record) => record.isRunning());
  if (runningRecords.length === 0 || timeoutMs <= 0) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(finish, timeoutMs);
    Promise.all(runningRecords.map((record) => record.waitForExit())).then(finish);

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    }
  });
}
