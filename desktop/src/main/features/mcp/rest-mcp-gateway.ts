import { randomUUID } from "node:crypto";

import type { McpConnectionTest, McpServer, SaveMcpServerInput } from "../../../shared/mcp-contract";
import type { JavaConnection } from "../../core/java-connection";
import { validateJavaConnection } from "../../core/java-connection";
import type { McpGateway } from "./mcp-gateway";

export class RestMcpGateway implements McpGateway {
  private readonly connection: JavaConnection;

  constructor(connection: JavaConnection, private readonly fetchImpl: typeof fetch = fetch) {
    this.connection = validateJavaConnection(connection);
  }

  listServers(): Promise<McpServer[]> {
    return this.request("/api/v1/mcp/servers");
  }

  saveServer(serverId: string, input: SaveMcpServerInput): Promise<McpServer> {
    return this.request(`/api/v1/mcp/servers/${encodeURIComponent(serverId)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  async deleteServer(serverId: string): Promise<void> {
    await this.request(`/api/v1/mcp/servers/${encodeURIComponent(serverId)}`, { method: "DELETE" });
  }

  testServer(serverId: string): Promise<McpConnectionTest> {
    return this.request(`/api/v1/mcp/servers/${encodeURIComponent(serverId)}/test`, { method: "POST" }, 30_000);
  }

  private async request<T>(path: string, init: RequestInit = {}, timeout = 10_000): Promise<T> {
    const response = await this.fetchImpl(`${this.connection.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.connection.sessionToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Correlation-Id": randomUUID(),
        ...init.headers,
      },
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) {
      let message = `Java Core 请求失败: HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { message?: string };
        message = body.message || message;
      } catch {
        // Keep the stable fallback for empty error responses.
      }
      throw new Error(message);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
