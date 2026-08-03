import type {
  ChatCompletion,
  ChatMessage,
  ChatRequestOptions,
  ChatStreamEvent,
  ListModelsInput,
  ModelSettings,
  UpdateModelSettingsInput,
} from "../shared/model-contract";

export interface ModelGateway {
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
