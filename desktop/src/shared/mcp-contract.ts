export type McpAuthenticationType = "none" | "bearer" | "api_key" | "custom_header" | "oauth";
export type McpTransportType = "streamable_http" | "stdio";

export interface McpServer {
  serverId: string;
  name: string;
  enabled: boolean;
  transportType: McpTransportType;
  url?: string;
  command?: string;
  arguments: string[];
  workingDirectory?: string;
  environmentKeys: string[];
  environmentConfigured: boolean;
  authType: McpAuthenticationType;
  headerName?: string;
  credentialConfigured: boolean;
  oauthAuthorized?: boolean;
}

export interface SaveMcpServerInput {
  name: string;
  enabled: boolean;
  transportType: McpTransportType;
  url?: string;
  command?: string;
  arguments?: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
  clearEnvironment?: boolean;
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

export interface McpOAuthStart {
  flowId: string;
  status: "pending" | "awaiting_authorization" | "completed" | "failed";
  authorizationUrl?: string;
  result?: McpConnectionTest;
  error?: string;
}

export interface LumoraMcpApi {
  listServers(): Promise<McpServer[]>;
  saveServer(serverId: string, input: SaveMcpServerInput): Promise<McpServer>;
  deleteServer(serverId: string): Promise<void>;
  testServer(serverId: string): Promise<McpConnectionTest>;
  authorizeServer(serverId: string): Promise<McpConnectionTest>;
}
