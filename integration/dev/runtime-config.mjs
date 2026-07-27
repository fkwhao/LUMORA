import { randomBytes as defaultRandomBytes } from "node:crypto";
import path from "node:path";

import { allocateLoopbackPort } from "./ports.mjs";

const PROTOCOL_VERSION = "v1";

export async function createRuntimeConfig(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const allocatePort = options.allocatePort ?? allocateLoopbackPort;
  const randomBytes = options.randomBytes ?? defaultRandomBytes;
  const startedAt = options.startedAt ?? new Date();
  const environment = options.environment ?? process.env;
  const agentPort = await allocatePort();
  const corePort = await allocatePort();

  if (agentPort === corePort) {
    throw new Error("Runtime agent and core ports must be distinct");
  }

  // 令牌只在本次启动的内存配置和子进程环境中存在，绝不写入磁盘或父进程环境。
  const token = randomBytes(32).toString("hex");
  const runtimeDirectory = path.join(repoRoot, "integration", "runtime");
  const databasePath = path.join(runtimeDirectory, "lumora.db");
  const logDirectory = path.join(runtimeDirectory, "logs", formatRunTimestamp(startedAt));
  const pythonPath = [path.join(repoRoot, "agent"), environment.PYTHONPATH]
    .filter(Boolean)
    .join(path.delimiter);
  const agentEnvironment = {
    ...environment,
    LUMORA_AGENT_PORT: String(agentPort),
    LUMORA_STARTUP_TOKEN: token,
    LUMORA_PROTOCOL_VERSION: PROTOCOL_VERSION,
    PYTHONPATH: pythonPath,
  };
  const coreEnvironment = {
    ...environment,
    LUMORA_CORE_PORT: String(corePort),
    LUMORA_AGENT_PORT: String(agentPort),
    LUMORA_STARTUP_TOKEN: token,
    LUMORA_AGENT_STARTUP_TOKEN: token,
    LUMORA_PROTOCOL_VERSION: PROTOCOL_VERSION,
    LUMORA_DATABASE_PATH: databasePath,
  };
  const desktopEnvironment = {
    ...environment,
    LUMORA_CORE_URL: `http://127.0.0.1:${corePort}`,
    LUMORA_STARTUP_TOKEN: token,
  };

  return {
    token,
    protocolVersion: PROTOCOL_VERSION,
    agentPort,
    corePort,
    databasePath,
    logDirectory,
    agentEnvironment,
    coreEnvironment,
    desktopEnvironment,
    environments: {
      agent: agentEnvironment,
      core: coreEnvironment,
      desktop: desktopEnvironment,
    },
  };
}

function formatRunTimestamp(startedAt) {
  return startedAt.toISOString().replace(/:/g, "-");
}
