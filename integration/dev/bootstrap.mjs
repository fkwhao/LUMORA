import { createHash } from "node:crypto";
import { access, readdir } from "node:fs/promises";
import path from "node:path";

import { runCommand } from "./commands.mjs";
import {
  hashFiles as defaultHashFiles,
  needsRefresh as defaultNeedsRefresh,
  writeStamp as defaultWriteStamp,
} from "./fingerprints.mjs";

export function planBootstrap(state) {
  const steps = [];
  if (state.rootDependenciesChanged) steps.push("install-root-dependencies");
  if (!state.virtualEnvironmentExists) steps.push("create-python-venv");
  if (!state.virtualEnvironmentExists || state.requirementsChanged) {
    steps.push("install-python-requirements");
  }
  if (state.protocolChanged || !state.generatedProtocolExists) {
    steps.push("generate-protocol");
  }
  return steps;
}

export async function discoverPython312(options = {}) {
  const runner = options.runner ?? runCommand;
  const environment = options.environment ?? process.env;
  const candidates = [
    { executable: "py", args: ["-3.12"] },
    { executable: "python", args: [] },
  ];
  const detected = [];

  for (const candidate of candidates) {
    const result = await tryCommand(runner, candidate.executable, [...candidate.args, "--version"], { environment });
    const version = readPythonVersion(result);
    if (result?.exitCode === 0 && version?.startsWith("3.12.")) {
      return { ...candidate, version };
    }
    if (version) detected.push(`${candidate.executable} ${version}`);
  }

  // 环境边界：只接受 3.12，避免依赖被安装到不兼容的解释器中。
  throw new Error(`需要 Python 3.12；检测到 ${detected.join("，") || "未找到 Python"}`);
}

export async function discoverJava21(options = {}) {
  const runner = options.runner ?? runCommand;
  const environment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;
  const executableName = platform === "win32" ? "java.exe" : "java";
  const candidates = environment.JAVA_HOME
    ? [
      { executable: path.join(environment.JAVA_HOME, "bin", executableName), javaHome: environment.JAVA_HOME },
      { executable: "java", javaHome: null },
    ]
    : [{ executable: "java", javaHome: null }];
  const detected = [];

  for (const candidate of candidates) {
    const result = await tryCommand(runner, candidate.executable, ["-version"], { environment });
    const version = readJavaVersion(result);
    if (result?.exitCode === 0 && version?.split(".")[0] === "21") {
      return { ...candidate, version };
    }
    if (version) detected.push(`${candidate.executable} ${version}`);
  }

  // 环境边界：开发工具链要求 JDK 21，不自动替换用户安装的 Java。
  throw new Error(`需要 JDK 21；检测到 ${detected.join("，") || "未找到 Java"}`);
}

export async function bootstrapRepository(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const platform = options.platform ?? process.platform;
  const runner = options.runner ?? runCommand;
  const hashFiles = options.hashFiles ?? defaultHashFiles;
  const needsRefresh = options.needsRefresh ?? defaultNeedsRefresh;
  const writeStamp = options.writeStamp ?? defaultWriteStamp;
  const exists = options.exists ?? pathExists;
  const discoverPython = options.discoverPython ?? discoverPython312;
  const discoverJava = options.discoverJava ?? discoverJava21;
  const environment = options.environment ?? process.env;
  const executableSuffix = platform === "win32" ? ".exe" : "";
  const scriptDirectory = platform === "win32" ? "Scripts" : "bin";
  const pnpmExecutable = platform === "win32" ? "pnpm.cmd" : "pnpm";
  const pythonExecutable = path.join(repoRoot, "agent", ".venv", scriptDirectory, `python${executableSuffix}`);
  const bufExecutable = path.join(repoRoot, "node_modules", ".bin", platform === "win32" ? "buf.cmd" : "buf");
  const mavenWrapper = path.join(repoRoot, "core", platform === "win32" ? "mvnw.cmd" : "mvnw");
  const stampsDirectory = path.join(repoRoot, ".lumora", "stamps");
  const nodeFiles = [path.join(repoRoot, "package.json"), path.join(repoRoot, "pnpm-lock.yaml")];
  const requirementsFiles = [path.join(repoRoot, "agent", "requirements.txt"), path.join(repoRoot, "agent", "requirements-dev.txt")];
  const protocolDirectory = path.join(repoRoot, "protocol");
  const nodeStamp = path.join(stampsDirectory, "node-dependencies.sha256");
  const requirementsStamp = path.join(stampsDirectory, "requirements.sha256");
  const protocolStamp = path.join(stampsDirectory, "protocol.sha256");
  const nodeFingerprint = await hashFiles(nodeFiles);
  if (await needsRefresh({ fingerprint: nodeFingerprint, stampPath: nodeStamp, outputs: [bufExecutable] })) {
    await ensureSuccess(runner(pnpmExecutable, ["install"], { cwd: repoRoot, environment }), "pnpm install");
    // 仅在命令成功后落 stamp，失败的安装下次必须重试。
    await writeStamp(nodeStamp, nodeFingerprint);
  }

  const python = await discoverPython({ runner, environment, platform });
  if (!await exists(pythonExecutable)) {
    await ensureSuccess(runner(python.executable, [...python.args, "-m", "venv", path.join(repoRoot, "agent", ".venv")], { cwd: repoRoot, environment }), "创建 Python 虚拟环境");
  }

  const requirementsFingerprint = fingerprintWithVersion(await hashFiles(requirementsFiles), python.version);
  if (await needsRefresh({ fingerprint: requirementsFingerprint, stampPath: requirementsStamp, outputs: [pythonExecutable] })) {
    await ensureSuccess(runner(pythonExecutable, ["-m", "pip", "install", "-r", "requirements-dev.txt"], { cwd: path.join(repoRoot, "agent"), environment }), "安装 Python 依赖");
    await writeStamp(requirementsStamp, requirementsFingerprint);
  }

  const protoFiles = await listFiles(path.join(protocolDirectory, "proto"), (file) => file.endsWith(".proto"));
  const protocolFiles = [...protoFiles, path.join(protocolDirectory, "buf.yaml"), path.join(protocolDirectory, "buf.gen.yaml")];
  const protocolFingerprint = await hashFiles(protocolFiles);
  if (await needsRefresh({ fingerprint: protocolFingerprint, stampPath: protocolStamp, outputs: [path.join(repoRoot, "agent", "generated")] })) {
    await ensureSuccess(runner(bufExecutable, ["lint"], { cwd: protocolDirectory, environment }), "Buf lint");
    await ensureSuccess(runner(bufExecutable, ["generate"], { cwd: protocolDirectory, environment }), "Buf generate");
    await writeStamp(protocolStamp, protocolFingerprint);
  }

  const java = await discoverJava({ runner, environment, platform });
  return { pythonExecutable, javaHome: java.javaHome, bufExecutable, mavenWrapper };
}

async function tryCommand(runner, command, args, options) {
  try {
    return await runner(command, args, options);
  } catch {
    return null;
  }
}

function readPythonVersion(result) {
  return `${result?.stdout ?? ""}\n${result?.stderr ?? ""}`.match(/Python\s+(\d+\.\d+\.\d+)/i)?.[1] ?? null;
}

function readJavaVersion(result) {
  return `${result?.stdout ?? ""}\n${result?.stderr ?? ""}`.match(/(?:openjdk|java) version\s+"?(\d+(?:\.\d+)*(?:_[\d]+)?)/i)?.[1] ?? null;
}

function fingerprintWithVersion(fingerprint, version) {
  return createHash("sha256").update(version).update("\0").update(fingerprint).digest("hex");
}

async function ensureSuccess(resultPromise, label) {
  const result = await resultPromise;
  if (result.exitCode !== 0) {
    // 失败时保留旧 stamp，下一次启动才能重新执行该阶段。
    throw new Error(`${label} failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`);
  }
}

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function listFiles(directory, include) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(target, include);
    return include(target) ? [target] : [];
  }));
  return files.flat().sort();
}
