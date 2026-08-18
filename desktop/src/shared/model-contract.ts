export interface ModelSettings {
  providerName: string;
  baseUrl: string;
  model: string;
  contextWindow: number;
  apiKeyConfigured: boolean;
  models: ProviderModel[];
}

export type ApiFormat = "anthropic" | "chat-completions" | "responses";

export interface ModelProvider {
  providerId: string;
  providerName: string;
  baseUrl: string;
  model: string;
  contextWindow: number;
  apiFormat: ApiFormat;
  active: boolean;
  apiKeyConfigured: boolean;
  models: ProviderModel[];
}

export interface ProviderModel {
  modelConfigurationId: string;
  modelId: string;
  contextWindow: number;
  maxOutputTokens: number;
  reasoningEfforts: string[];
  webSearchEnabled: boolean;
}

export interface SaveProviderModelInput {
  modelId: string;
  contextWindow: number;
  maxOutputTokens: number;
  reasoningEfforts: string[];
  webSearchEnabled: boolean;
}

export interface SaveModelProviderInput {
  providerName: string;
  baseUrl: string;
  model: string;
  contextWindow: number;
  apiFormat: ApiFormat;
  apiKey?: string;
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
  apiFormat?: ApiFormat;
  apiKey?: string;
}

import type { MessageAttachment } from "./attachment-contract";

export interface ChatMessage {
  messageId?: string;
  /** Renderer-only identity kept stable while an optimistic message is persisted. */
  runtimeId?: string;
  sequence?: number;
  parentMessageId?: string;
  messageDepth?: number;
  activePath?: boolean;
  usageRecordOnly?: boolean;
  threadMessages?: ChatMessage[];
  role: "user" | "assistant";
  content: string;
  attachments?: MessageAttachment[];
  model?: string;
  usage?: TokenUsage;
  activeContextTokens?: number;
  durationMs?: number;
  workLog?: WorkLogItem[];
  workLogJson?: string;
  createdAt?: string;
}

export type WorkLogItemStatus = "running" | "completed" | "failed";

export type ExecutionPlanStepStatus =
  | "pending"
  | "in_progress"
  | "completed";

export interface ExecutionPlanStep {
  step: string;
  status: ExecutionPlanStepStatus;
}

export interface WorkLogItem {
  itemId: string;
  kind: "progress" | "tool" | "context" | "approval" | "search";
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
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cacheMetricsAvailable?: boolean;
}

export interface DailyTokenUsage {
  date: string;
  usage: TokenUsage;
  requestCount: number;
}

export interface TokenUsageStatistics {
  usage: TokenUsage;
  peakDailyTokens: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  requestCount: number;
  conversationCount: number;
  daily: DailyTokenUsage[];
}

export interface ChatCompletion {
  message: string;
  model: string;
  usage: TokenUsage;
}

export type ReasoningEffort = string;
export type PermissionMode =
  | "full_access"
  | "auto_approve"
  | "request_approval";
export type ToolApprovalDecision = "allow_once" | "allow_always" | "deny";

export interface ToolApprovalRequest {
  approvalId: string;
  itemId: string;
  toolCallId: string;
  toolName: string;
  title: string;
  arguments: Record<string, unknown>;
  permissionLayer: string;
  reason: string;
  riskLevel: string;
  reversible?: boolean;
}

export interface ChatRequestOptions {
  model?: string;
  reasoningEffort?: ReasoningEffort;
  workspacePath?: string;
  permissionMode?: PermissionMode;
  attachments?: MessageAttachment[];
}

export type ChatStreamEventType =
  | "text_delta"
  | "text_reset"
  | "reasoning_delta"
  | "protocol_message"
  | "progress_message"
  | "tool_started"
  | "tool_completed"
  | "tool_failed"
  | "tool_approval_requested"
  | "tool_approval_resolved"
  | "approval_review_started"
  | "approval_review_completed"
  | "context_compaction_started"
  | "context_compaction_progress"
  | "context_compacted"
  | "context_compaction_failed"
  | "web_search_started"
  | "web_search_progress"
  | "web_search_completed"
  | "web_search_failed"
  | "usage"
  | "steer_claimed"
  | "paused"
  | "completed"
  | "failed";

export interface ChatStreamEvent {
  type: ChatStreamEventType;
  delta: string;
  model: string;
  usage?: TokenUsage;
  activeContextTokens?: number;
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
  approvalId?: string;
  permissionLayer?: string;
  reason?: string;
  riskLevel?: string;
  reversible?: boolean;
  decision?: "allow" | "deny" | "";
}

export type ConversationRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "PAUSING"
  | "PAUSED"
  | "WAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface ConversationRunSnapshot {
  runId: string;
  taskId: string;
  status: ConversationRunStatus;
  triggerType: "MESSAGE" | "REGENERATE" | "RESUME";
  lastEventSequence: number;
  replayFromSequence: number;
  errorMessage: string;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ConversationRunEvent {
  runId: string;
  sequence: number;
  event: ChatStreamEvent;
  occurredAt: string;
}

export type ConversationInputTarget = "NEXT_TURN" | "NEXT_STEP";
export type ConversationInputStatus =
  | "PENDING"
  | "DELIVERED"
  | "CLAIMED"
  | "CANCELLED";

export interface ConversationInput {
  inputId: string;
  taskId: string;
  runId?: string;
  target: ConversationInputTarget;
  status: ConversationInputStatus;
  content: string;
  attachments?: MessageAttachment[];
  model: string;
  reasoningEffort: string;
  workspacePath: string;
  permissionMode: PermissionMode;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConversationInput extends ChatRequestOptions {
  content: string;
  target: ConversationInputTarget;
  position?: number;
}

export interface UpdateConversationInput extends ChatRequestOptions {
  content?: string;
  target?: ConversationInputTarget;
  position?: number;
}

export interface ContextCompactionResult {
  beforeTokens: number;
  afterTokens: number;
  throughSequence?: number;
  retainedFromSequence?: number;
  usage: TokenUsage;
}

export interface ArtifactChunk {
  artifactId: string;
  content: string;
  offset: number;
  nextOffset?: number;
  hasMore: boolean;
  characterCount: number;
  mimeType: string;
  byteSize: number;
}

export interface LumoraModelApi {
  getUsageStatistics(days?: number): Promise<TokenUsageStatistics>;
  listProviders(): Promise<ModelProvider[]>;
  createProvider(input: SaveModelProviderInput): Promise<ModelProvider>;
  updateProvider(providerId: string, input: SaveModelProviderInput): Promise<ModelProvider>;
  activateProvider(providerId: string): Promise<ModelProvider>;
  disableProvider(providerId: string): Promise<ModelProvider>;
  deleteProvider(providerId: string): Promise<void>;
  listProviderModels(providerId: string, apiKey?: string): Promise<string[]>;
  createProviderModel(providerId: string, input: SaveProviderModelInput): Promise<ProviderModel>;
  updateProviderModel(providerId: string, modelConfigurationId: string, input: SaveProviderModelInput): Promise<ProviderModel>;
  deleteProviderModel(providerId: string, modelConfigurationId: string): Promise<void>;
  testProviderModel(providerId: string, modelConfigurationId: string): Promise<boolean>;
  getSettings(): Promise<ModelSettings>;
  updateSettings(input: UpdateModelSettingsInput): Promise<ModelSettings>;
  listModels(input: ListModelsInput): Promise<string[]>;
  complete(messages: ChatMessage[]): Promise<ChatCompletion>;
  listMessages(taskId: string): Promise<ChatMessage[]>;
  activateMessageBranch?(taskId: string, messageId: string): Promise<void>;
  compactContext(taskId: string, model?: string): Promise<ContextCompactionResult>;
  readArtifact(
    taskId: string,
    artifactId: string,
    offset?: number,
    limit?: number,
  ): Promise<ArtifactChunk>;
  decideToolApproval(
    taskId: string,
    approvalId: string,
    decision: ToolApprovalDecision,
  ): Promise<void>;
  getActiveRun(taskId: string): Promise<ConversationRunSnapshot | undefined>;
  listInputs(taskId: string): Promise<ConversationInput[]>;
  createInput(
    taskId: string,
    input: CreateConversationInput,
  ): Promise<ConversationInput>;
  updateInput(
    taskId: string,
    inputId: string,
    input: UpdateConversationInput,
  ): Promise<ConversationInput>;
  deleteInput(taskId: string, inputId: string): Promise<void>;
  pauseRun(taskId: string, runId: string): Promise<ConversationRunSnapshot>;
  resumeRun(taskId: string, runId: string): Promise<ConversationRunSnapshot>;
  cancelRun(taskId: string, runId: string): Promise<ConversationRunSnapshot>;
  subscribeRun(
    taskId: string,
    runId: string,
    afterSequence: number,
    onEvent: (event: ConversationRunEvent) => void,
  ): () => void;
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
