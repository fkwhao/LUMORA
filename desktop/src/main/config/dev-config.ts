import { readFileSync } from "node:fs";

import { parse } from "yaml";

export type DevConfig = Readonly<{
  coreUrl: string;
  cloudApiUrl: string;
  cloudConsoleUrl: string;
  startupToken: string;
}>;

export function loadDevConfig(configPath: string): DevConfig {
  let content: string;
  try {
    content = readFileSync(configPath, "utf8");
  } catch {
    throw new Error(`无法读取 Electron 本地配置文件：${configPath}`);
  }

  let root: unknown;
  try {
    root = parse(content);
  } catch {
    throw new Error(`Electron 本地 YAML 格式无效：${configPath}`);
  }

  const rootMapping = requireMapping(root, "根节点", configPath);
  const lumora = requireMapping(rootMapping.lumora, "lumora", configPath);
  const coreUrl = requireString(lumora["core-url"], "core-url", configPath);
  const startupToken = requireString(
    lumora["startup-token"],
    "startup-token",
    configPath,
  );
  const cloudApiUrl = optionalString(lumora["cloud-api-url"])
    ?? "http://127.0.0.1:46100";
  const cloudConsoleUrl = optionalString(lumora["cloud-console-url"])
    ?? "http://127.0.0.1:5175/console";

  validateCoreUrl(coreUrl, configPath);
  validateCloudUrl(cloudApiUrl, "cloud-api-url", configPath);
  validateCloudUrl(cloudConsoleUrl, "cloud-console-url", configPath);
  if (startupToken.length < 32) {
    // 错误只指出配置键，不拼接令牌内容，避免密钥出现在终端或日志中。
    throw new Error(`配置项 startup-token 至少需要 32 个字符：${configPath}`);
  }

  return Object.freeze({
    coreUrl,
    cloudApiUrl: withoutTrailingSlash(cloudApiUrl),
    cloudConsoleUrl: withoutTrailingSlash(cloudConsoleUrl),
    startupToken,
  });
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("可选 URL 配置必须是非空字符串");
  }
  return value;
}

function requireMapping(
  value: unknown,
  key: string,
  configPath: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`配置项 ${key} 必须是对象：${configPath}`);
  }
  return value as Record<string, unknown>;
}

function requireString(
  value: unknown,
  key: string,
  configPath: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`配置项 ${key} 必须是非空字符串：${configPath}`);
  }
  return value;
}

function validateCoreUrl(coreUrl: string, configPath: string): void {
  let url: URL;
  try {
    url = new URL(coreUrl);
  } catch {
    throw new Error(`配置项 core-url 格式无效：${configPath}`);
  }

  // Desktop 开发配置只允许连接本机 Core，避免把启动令牌发送到远程服务。
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.port.length === 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    throw new Error(
      `配置项 core-url 必须是 http://127.0.0.1:<port>：${configPath}`,
    );
  }
}

function validateCloudUrl(
  value: string,
  key: string,
  configPath: string,
): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`配置项 ${key} 格式无效：${configPath}`);
  }
  const loopbackHttp =
    url.protocol === "http:"
    && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  if (
    (url.protocol !== "https:" && !loopbackHttp)
    || url.username.length > 0
    || url.password.length > 0
    || url.search.length > 0
    || url.hash.length > 0
  ) {
    throw new Error(
      `配置项 ${key} 必须使用 HTTPS（本机开发可使用 loopback HTTP）：${configPath}`,
    );
  }
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
