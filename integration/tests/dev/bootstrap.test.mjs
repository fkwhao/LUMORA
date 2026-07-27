import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  bootstrapRepository,
  discoverJava21,
  discoverPython312,
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
    /JDK 21.*17\.0\.12/,
  );
});

test("Python discovery prefers the Python 3.12 launcher", async () => {
  const calls = [];
  const environment = { PATH: "python-312" };
  const runtime = await discoverPython312({
    environment,
    runner: async (command, args, options = {}) => {
      calls.push([command, args, options.environment]);
      return { exitCode: 0, stdout: "Python 3.12.9", stderr: "" };
    },
  });

  assert.deepEqual(calls, [["py", ["-3.12", "--version"], environment]]);
  assert.deepEqual(runtime, { executable: "py", args: ["-3.12"], version: "3.12.9" });
});

test("Java discovery accepts a bare JDK 21 major version", async () => {
  const environment = { PATH: "jdk-21" };
  const calls = [];
  const runtime = await discoverJava21({
    environment,
    runner: async (command, args, options = {}) => {
      calls.push([command, args, options.environment]);
      return { exitCode: 0, stdout: "", stderr: 'openjdk version "21"' };
    },
  });

  assert.deepEqual(calls, [["java", ["-version"], environment]]);
  assert.deepEqual(runtime, { executable: "java", javaHome: null, version: "21" });
});

test("bootstrap installs root dependencies before discovering Python", async () => {
  const repoRoot = await createRepository();
  const calls = [];

  await assert.rejects(
    () => bootstrapRepository({
      repoRoot,
      platform: "win32",
      runner: async (command, args) => {
        calls.push([command, args]);
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      hashFiles: async () => "fingerprint",
      needsRefresh: async ({ stampPath }) => stampPath.endsWith("node-dependencies.sha256"),
      writeStamp: async () => {},
      discoverPython: async () => {
        calls.push(["discover-python"]);
        throw new Error("Python unavailable");
      },
    }),
    /Python unavailable/,
  );

  assert.deepEqual(calls, [
    ["pnpm.cmd", ["install"]],
    ["discover-python"],
  ]);
});

test("bootstrap uses only changed dependency stages and persists their stamps", async () => {
  const repoRoot = await createRepository();
  const calls = [];
  const stampWrites = [];
  const hashFiles = async (files) => files.map((file) => path.basename(file)).join("|");
  const writeStamp = async (stampPath, fingerprint) => stampWrites.push([stampPath, fingerprint]);

  const result = await bootstrapRepository({
    repoRoot,
    platform: "win32",
    runner: async (command, args, options = {}) => {
      calls.push([command, args, options.cwd]);
      if (args.includes("--version") || args.includes("-version")) {
        return { exitCode: 0, stdout: "Python 3.12.9", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    hashFiles,
    needsRefresh: async ({ stampPath }) => stampPath.endsWith("requirements.sha256") || stampPath.endsWith("protocol.sha256"),
    writeStamp,
    discoverJava: async () => ({ executable: "java", javaHome: "C:\\jdk-21", version: "21.0.8" }),
  });

  assert.deepEqual(calls, [
    ["py", ["-3.12", "--version"], undefined],
    [path.join(repoRoot, "agent", ".venv", "Scripts", "python.exe"), ["-m", "pip", "install", "-r", "requirements-dev.txt"], path.join(repoRoot, "agent")],
    [path.join(repoRoot, "node_modules", ".bin", "buf.cmd"), ["lint"], path.join(repoRoot, "protocol")],
    [path.join(repoRoot, "node_modules", ".bin", "buf.cmd"), ["generate"], path.join(repoRoot, "protocol")],
  ]);
  assert.equal(stampWrites.length, 2);
  assert.equal(result.pythonExecutable, path.join(repoRoot, "agent", ".venv", "Scripts", "python.exe"));
  assert.equal(result.javaHome, "C:\\jdk-21");
  assert.equal(result.bufExecutable, path.join(repoRoot, "node_modules", ".bin", "buf.cmd"));
});

test("bootstrap does not persist a stamp when its command fails", async () => {
  const repoRoot = await createRepository();
  const stampWrites = [];

  await assert.rejects(
    () => bootstrapRepository({
      repoRoot,
      platform: "win32",
      runner: async (_command, args) => {
        if (args.includes("--version")) return { exitCode: 0, stdout: "Python 3.12.9", stderr: "" };
        return { exitCode: 1, stdout: "", stderr: "failure" };
      },
      hashFiles: async () => "fingerprint",
      needsRefresh: async ({ stampPath }) => stampPath.endsWith("requirements.sha256"),
      writeStamp: async (...args) => stampWrites.push(args),
      discoverJava: async () => ({ executable: "java", javaHome: "C:\\jdk-21", version: "21.0.8" }),
    }),
    /failed/,
  );

  assert.deepEqual(stampWrites, []);
});

test("bootstrap invokes pnpm without a Windows suffix on non-Windows platforms", async () => {
  const repoRoot = await createRepository();
  const calls = [];

  await bootstrapRepository({
    repoRoot,
    platform: "linux",
    runner: async (command, args) => {
      calls.push([command, args]);
      if (args.includes("--version")) return { exitCode: 0, stdout: "Python 3.12.9", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    hashFiles: async () => "fingerprint",
    needsRefresh: async ({ stampPath }) => stampPath.endsWith("node-dependencies.sha256"),
    writeStamp: async () => {},
    discoverJava: async () => ({ executable: "java", javaHome: null, version: "21" }),
  });

  assert.ok(calls.some(([command, args]) => command === "pnpm" && args[0] === "install"));
});

async function createRepository() {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "lumora-bootstrap-"));
  await mkdir(path.join(repoRoot, "agent"), { recursive: true });
  await mkdir(path.join(repoRoot, "protocol", "proto", "lumora", "v1"), { recursive: true });
  await mkdir(path.join(repoRoot, "node_modules", ".bin"), { recursive: true });
  await writeFile(path.join(repoRoot, "package.json"), "{}");
  await writeFile(path.join(repoRoot, "pnpm-lock.yaml"), "lockfileVersion: '9.0'");
  await writeFile(path.join(repoRoot, "agent", "requirements.txt"), "requests");
  await writeFile(path.join(repoRoot, "agent", "requirements-dev.txt"), "-r requirements.txt");
  await writeFile(path.join(repoRoot, "protocol", "buf.yaml"), "version: v2");
  await writeFile(path.join(repoRoot, "protocol", "buf.gen.yaml"), "version: v2");
  await writeFile(path.join(repoRoot, "protocol", "proto", "lumora", "v1", "core.proto"), "syntax = 'proto3';");
  await writeFile(path.join(repoRoot, "node_modules", ".bin", "buf.cmd"), "");
  await mkdir(path.join(repoRoot, "agent", ".venv", "Scripts"), { recursive: true });
  await writeFile(path.join(repoRoot, "agent", ".venv", "Scripts", "python.exe"), "");
  await mkdir(path.join(repoRoot, "agent", "generated"), { recursive: true });
  return repoRoot;
}
