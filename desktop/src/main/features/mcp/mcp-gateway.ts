import type { McpConnectionTest, McpServer, SaveMcpServerInput } from "../../../shared/mcp-contract";

export interface McpGateway {
  listServers(): Promise<McpServer[]>;
  saveServer(serverId: string, input: SaveMcpServerInput): Promise<McpServer>;
  deleteServer(serverId: string): Promise<void>;
  testServer(serverId: string): Promise<McpConnectionTest>;
}
