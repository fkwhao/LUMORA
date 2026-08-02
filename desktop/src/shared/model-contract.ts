export interface ModelSettings {
  providerName: string;
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
}

export interface UpdateModelSettingsInput {
  providerName: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface ChatMessage {
  messageId?: string;
  sequence?: number;
  role: "user" | "assistant";
  content: string;
  reasoningContent?: string;
  model?: string;
  usage?: TokenUsage;
  durationMs?: number;
  createdAt?: string;
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

export type ChatStreamEventType =
  | "text_delta"
  | "reasoning_delta"
  | "usage"
  | "completed"
  | "failed";

export interface ChatStreamEvent {
  type: ChatStreamEventType;
  delta: string;
  model: string;
  usage?: TokenUsage;
  errorMessage: string;
}

export interface LumoraModelApi {
  getSettings(): Promise<ModelSettings>;
  updateSettings(input: UpdateModelSettingsInput): Promise<ModelSettings>;
  complete(messages: ChatMessage[]): Promise<ChatCompletion>;
  listMessages(taskId: string): Promise<ChatMessage[]>;
  streamMessage(
    taskId: string,
    content: string,
    onEvent: (event: ChatStreamEvent) => void,
  ): () => void;
  regenerateMessage(
    taskId: string,
    messageId: string,
    content: string,
    onEvent: (event: ChatStreamEvent) => void,
  ): () => void;
}
