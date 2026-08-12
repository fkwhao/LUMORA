import type {
  ChatCompletion,
  ChatMessage,
  ChatRequestOptions,
  ChatStreamEvent,
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
