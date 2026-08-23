import type {
  ChatCompletion,
  ChatMessage,
  ChatRequestOptions,
  ChatStreamEvent,
  ConversationRunEvent,
  ConversationRunSnapshot,
  ConversationRunChanges,
  ConversationInput,
  CreateConversationInput,
  UpdateConversationInput,
  ContextCompactionResult,
  ArtifactChunk,
  ListModelsInput,
  ModelSettings,
  ModelProvider,
  SaveModelProviderInput,
  SaveProviderModelInput,
  ProviderModel,
  ToolApprovalDecision,
  TokenUsageStatistics,
  TaskWorktreeChanges,
  TaskWorktreeStatus,
  UpdateModelSettingsInput,
} from "../../../shared/model-contract";

export interface ModelGateway {
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
  activateMessageBranch(taskId: string, messageId: string): Promise<void>;
  compactContext(taskId: string, model?: string): Promise<ContextCompactionResult>;
  readArtifact(taskId: string, artifactId: string, offset?: number, limit?: number): Promise<ArtifactChunk>;
  decideToolApproval(
    taskId: string,
    approvalId: string,
    decision: ToolApprovalDecision,
  ): Promise<void>;
  getActiveRun(taskId: string): Promise<ConversationRunSnapshot | undefined>;
  listInputs(taskId: string): Promise<ConversationInput[]>;
  createInput(taskId: string, input: CreateConversationInput): Promise<ConversationInput>;
  updateInput(taskId: string, inputId: string, input: UpdateConversationInput): Promise<ConversationInput>;
  deleteInput(taskId: string, inputId: string): Promise<void>;
  pauseRun(taskId: string, runId: string): Promise<ConversationRunSnapshot>;
  resumeRun(taskId: string, runId: string): Promise<ConversationRunSnapshot>;
  cancelRun(taskId: string, runId: string): Promise<ConversationRunSnapshot>;
  getRunChanges(taskId: string, runId: string): Promise<ConversationRunChanges>;
  revertRun(taskId: string, runId: string): Promise<ConversationRunChanges>;
  getTaskWorktree(taskId: string): Promise<TaskWorktreeStatus | undefined>;
  getTaskWorktreeChanges(taskId: string): Promise<TaskWorktreeChanges | undefined>;
  applyTaskWorktree(taskId: string): Promise<TaskWorktreeStatus>;
  createTaskWorktreeBranch(taskId: string, branchName: string): Promise<TaskWorktreeStatus>;
  discardTaskWorktree(taskId: string): Promise<TaskWorktreeStatus>;
  subscribeRun(
    taskId: string,
    runId: string,
    afterSequence: number,
    onEvent: (event: ConversationRunEvent) => void,
  ): ModelStreamSubscription;
  streamMessage(
    taskId: string,
    content: string,
    onEvent: (event: ChatStreamEvent) => void,
    options?: ChatRequestOptions,
  ): ModelStreamSubscription;
  regenerateMessage(
    taskId: string,
    messageId: string,
    content: string,
    onEvent: (event: ChatStreamEvent) => void,
    options?: ChatRequestOptions,
  ): ModelStreamSubscription;
}

export interface ModelStreamSubscription {
  cancel(): void;
  completed: Promise<void>;
}
