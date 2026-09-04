import { ipcMain } from "electron";
import { win32 as windowsPath } from "node:path";

import type { SaveMcpServerInput } from "../../../shared/mcp-contract";
import type { McpGateway } from "./mcp-gateway";

const MCP_AUTH_TYPES = new Set(["none", "bearer", "api_key", "custom_header"]);
const MCP_TRANSPORT_TYPES = new Set(["streamable_http", "stdio"]);
const RESERVED_AUTH_HEADERS = new Set([
  "accept", "authorization", "connection", "content-length", "content-type",
  "cookie", "host", "mcp-protocol-version", "mcp-session-id",
  "proxy-authorization", "set-cookie", "transfer-encoding",
]);

export const mcpIpcChannels = {
  listServers: "mcp:list-servers",
  saveServer: "mcp:save-server",
  deleteServer: "mcp:delete-server",
  testServer: "mcp:test-server",
} as const;

export function registerMcpIpc(gateway: McpGateway): () => void {
  ipcMain.handle(mcpIpcChannels.listServers, () => gateway.listServers());
  ipcMain.handle(mcpIpcChannels.saveServer, (_event, serverId: string, input: SaveMcpServerInput) =>
    gateway.saveServer(requireId(serverId), validateMcpServerInput(input)));
  ipcMain.handle(mcpIpcChannels.deleteServer, (_event, serverId: string) =>
    gateway.deleteServer(requireId(serverId)));
  ipcMain.handle(mcpIpcChannels.testServer, (_event, serverId: string) =>
    gateway.testServer(requireId(serverId)));
  return () => Object.values(mcpIpcChannels).forEach((channel) => ipcMain.removeHandler(channel));
}

export function validateMcpServerInput(input: SaveMcpServerInput): SaveMcpServerInput {
  if (!input || typeof input !== "object") throw new TypeError("MCP 配置格式无效");
  const name = requireText(input.name, "MCP Server 名称");
  const transportType = input.transportType || "streamable_http";
  if (!MCP_TRANSPORT_TYPES.has(transportType)) {
    throw new TypeError("不支持的 MCP Transport");
  }
  if (transportType === "stdio") {
    return validateStdioInput(input, name);
  }
  const url = input.url?.trim();
  if (!/^https?:\/\//.test(url || "")) throw new TypeError("请输入 HTTP(S) MCP 地址");
  if (!MCP_AUTH_TYPES.has(input.authType)) throw new TypeError("不支持的 MCP 静态认证类型");
  if (input.command || input.arguments?.length || input.workingDirectory
      || input.environment !== undefined || input.clearEnvironment) {
    throw new TypeError("Streamable HTTP 配置不能包含 stdio 启动参数");
  }
  const authType = input.authType;
  const headerName = input.headerName?.trim() || undefined;
  if (["api_key", "custom_header"].includes(authType) && !headerName) {
    throw new TypeError("API Key 或自定义 Header 认证必须填写 Header 名称");
  }
  if (headerName && !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/.test(headerName)) {
    throw new TypeError("认证 Header 名称格式无效");
  }
  if (headerName && RESERVED_AUTH_HEADERS.has(headerName.toLowerCase())) {
    throw new TypeError("该 Header 名称由 MCP 传输层保留");
  }
  const credential = input.credential?.trim() || undefined;
  if (credential && credential.length > 4096) throw new TypeError("静态凭据长度超过限制");
  return {
    name,
    enabled: input.enabled !== false,
    transportType,
    url,
    authType,
    headerName,
    credential,
  };
}

function validateStdioInput(
  input: SaveMcpServerInput,
  name: string,
): SaveMcpServerInput {
  if (input.url || input.authType !== "none" || input.headerName || input.credential) {
    throw new TypeError("stdio MCP Server 不支持 HTTP 地址或静态 Header 认证");
  }
  const command = requireText(input.command, "stdio 启动命令");
  requireProcessText(command, "stdio 启动命令", 1_000);
  const rawArguments = input.arguments ?? [];
  if (!Array.isArray(rawArguments) || rawArguments.length > 64) {
    throw new TypeError("stdio 参数数量超过限制");
  }
  const arguments_ = rawArguments.map((value) => {
    requireProcessText(value, "stdio 参数", 2_000);
    return value;
  });
  const workingDirectory = input.workingDirectory?.trim() || undefined;
  if (workingDirectory) {
    requireProcessText(workingDirectory, "stdio 工作目录", 2_000);
    if (!windowsPath.isAbsolute(workingDirectory)) {
      throw new TypeError("stdio 工作目录必须是 Windows 绝对路径");
    }
  }
  const environment = normalizeEnvironment(input.environment);
  if (input.clearEnvironment && environment && Object.keys(environment).length > 0) {
    throw new TypeError("不能同时设置并清除 stdio 环境变量");
  }
  return {
    name,
    enabled: input.enabled !== false,
    transportType: "stdio",
    command,
    arguments: arguments_,
    workingDirectory,
    environment,
    clearEnvironment: input.clearEnvironment === true || undefined,
    authType: "none",
  };
}

function normalizeEnvironment(
  value: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("stdio 环境变量格式无效");
  }
  const entries = Object.entries(value);
  if (entries.length > 64) throw new TypeError("stdio 环境变量数量超过限制");
  const environment: Record<string, string> = {};
  const normalizedKeys = new Set<string>();
  for (const [key, entryValue] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key)) {
      throw new TypeError(`stdio 环境变量名称无效: ${key}`);
    }
    const normalizedKey = key.toLocaleLowerCase("en-US");
    if (normalizedKeys.has(normalizedKey)) {
      throw new TypeError(`stdio 环境变量名称重复: ${key}`);
    }
    normalizedKeys.add(normalizedKey);
    if (typeof entryValue !== "string" || entryValue.length > 4_096
        || entryValue.includes("\0")) {
      throw new TypeError(`stdio 环境变量值无效: ${key}`);
    }
    environment[key] = entryValue;
  }
  return environment;
}

function requireProcessText(
  value: unknown,
  label: string,
  maxLength: number,
): asserts value is string {
  if (typeof value !== "string" || value.length > maxLength
      || /[\0\r\n]/.test(value)) {
    throw new TypeError(`${label}格式无效`);
  }
}

function requireId(value: string): string {
  const id = requireText(value, "MCP Server ID");
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(id)) throw new TypeError("MCP Server ID 无效");
  return id;
}

function requireText(value: string | undefined, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new TypeError(`${label}不能为空`);
  return normalized;
}
