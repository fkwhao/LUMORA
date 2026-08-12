export type McpAuthenticationType = "none" | "bearer" | "api_key" | "custom_header";

export interface McpServer {
  serverId: string;
  name: string;
  enabled: boolean;
  url: string;
  authType: McpAuthenticationType;
  headerName?: string;
  credentialConfigured: boolean;
}

export interface SaveMcpServerInput {
  name: string;
  enabled: boolean;
  url: string;
  authType: McpAuthenticationType;
  headerName?: string;
  credential?: string;
}

export interface McpConnectionTest {
  connected: boolean;
  serverName: string;
  serverVersion: string;
  tools: string[];
  resources: string[];
  resourceTemplates: string[];
  prompts: string[];
  echoOutput?: string;
}

export interface LumoraMcpApi {
  listServers(): Promise<McpServer[]>;
  saveServer(serverId: string, input: SaveMcpServerInput): Promise<McpServer>;
  deleteServer(serverId: string): Promise<void>;
  testServer(serverId: string): Promise<McpConnectionTest>;
}
