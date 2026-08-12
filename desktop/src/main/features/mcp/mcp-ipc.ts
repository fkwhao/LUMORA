import { ipcMain } from "electron";

import type { SaveMcpServerInput } from "../../../shared/mcp-contract";
import type { McpGateway } from "./mcp-gateway";

const MCP_AUTH_TYPES = new Set(["none", "bearer", "api_key", "custom_header"]);
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
    gateway.saveServer(requireId(serverId), validateInput(input)));
  ipcMain.handle(mcpIpcChannels.deleteServer, (_event, serverId: string) =>
    gateway.deleteServer(requireId(serverId)));
  ipcMain.handle(mcpIpcChannels.testServer, (_event, serverId: string) =>
    gateway.testServer(requireId(serverId)));
  return () => Object.values(mcpIpcChannels).forEach((channel) => ipcMain.removeHandler(channel));
}

function validateInput(input: SaveMcpServerInput): SaveMcpServerInput {
  if (!input || typeof input !== "object") throw new TypeError("MCP 配置格式无效");
  const name = requireText(input.name, "MCP Server 名称");
  const url = input.url?.trim();
  if (!/^https?:\/\//.test(url || "")) throw new TypeError("请输入 HTTP(S) MCP 地址");
  if (!MCP_AUTH_TYPES.has(input.authType)) throw new TypeError("不支持的 MCP 静态认证类型");
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
    url,
    authType,
    headerName,
    credential,
  };
}

function requireId(value: string): string {
  const id = requireText(value, "MCP Server ID");
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(id)) throw new TypeError("MCP Server ID 无效");
  return id;
}

function requireText(value: string, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new TypeError(`${label}不能为空`);
  return normalized;
}
