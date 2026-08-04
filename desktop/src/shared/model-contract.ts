export interface ModelSettings {
  providerName: string;
  baseUrl: string;
  model: string;
  contextWindow: number;
  apiKeyConfigured: boolean;
}

export interface UpdateModelSettingsInput {
  providerName: string;
  baseUrl: string;
  model: string;
  contextWindow: number;
  apiKey?: string;
}

export interface ListModelsInput {
  providerName: string;
  baseUrl: string;
  apiKey?: string;
}

export interface ChatMessage {
  messageId?: string;
  sequence?: number;
  role: "user" | "assistant";
  content: string;
  model?: string;
  usage?: TokenUsage;
  durationMs?: number;
  workLog?: WorkLogItem[];
  workLogJson?: string;
  createdAt?: string;
}

export type WorkLogItemStatus = "running" | "completed" | "failed";

export interface WorkLogItem {
  itemId: string;
  kind: "progress" | "tool";
  status: WorkLogItemStatus;
  content?: string;
  toolCallId?: string;
  toolName?: string;
  title?: string;
  arguments?: Record<string, unknown>;
  output?: string;
  durationMs?: number;
  exitCode?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatCompletion {
  message: string;
  model: string;
  usage: TokenUsage;
}

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ChatRequestOptions {
  model?: string;
  reasoningEffort?: ReasoningEffort;
  workspacePath?: string;
}

export type ChatStreamEventType =
  | "text_delta"
  | "reasoning_delta"
  | "progress_message"
  | "tool_started"
  | "tool_completed"
  | "tool_failed"
  | "usage"
  | "completed"
  | "failed";

export interface ChatStreamEvent {
  type: ChatStreamEventType;
  delta: string;
  model: string;
  usage?: TokenUsage;
  errorMessage: string;
  itemId?: string;
  toolCallId?: string;
  toolName?: string;
  title?: string;
  arguments?: Record<string, unknown>;
  output?: string;
  durationMs?: number;
  exitCode?: number;
  metadata?: Record<string, unknown>;
}

export interface LumoraModelApi {
  getSettings(): Promise<ModelSettings>;
  updateSettings(input: UpdateModelSettingsInput): Promise<ModelSettings>;
  listModels(input: ListModelsInput): Promise<string[]>;
  complete(messages: ChatMessage[]): Promise<ChatCompletion>;
  listMessages(taskId: string): Promise<ChatMessage[]>;
  streamMessage(
    taskId: string,
    content: string,
    onEvent: (event: ChatStreamEvent) => void,
    options?: ChatRequestOptions,
  ): () => void;
  regenerateMessage(
    taskId: string,
    messageId: string,
    content: string,
    onEvent: (event: ChatStreamEvent) => void,
    options?: ChatRequestOptions,
  ): () => void;
}
