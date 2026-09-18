import type { McpConnectionTest, McpOAuthStart, McpServer, SaveMcpServerInput } from "../../../shared/mcp-contract";

export interface McpGateway {
  listServers(): Promise<McpServer[]>;
  saveServer(serverId: string, input: SaveMcpServerInput): Promise<McpServer>;
  deleteServer(serverId: string): Promise<void>;
  testServer(serverId: string): Promise<McpConnectionTest>;
  startOAuth(serverId: string): Promise<McpOAuthStart>;
  getOAuthStatus(serverId: string, flowId: string): Promise<McpOAuthStart>;
}
