import type {
  ChatCompletion,
  ChatMessage,
  ChatStreamEvent,
  ModelSettings,
  UpdateModelSettingsInput,
} from "../shared/model-contract";

export interface ModelGateway {
  getSettings(): Promise<ModelSettings>;
  updateSettings(input: UpdateModelSettingsInput): Promise<ModelSettings>;
  complete(messages: ChatMessage[]): Promise<ChatCompletion>;
  listMessages(taskId: string): Promise<ChatMessage[]>;
  streamMessage(
    taskId: string,
    content: string,
    onEvent: (event: ChatStreamEvent) => void,
  ): ModelStreamSubscription;
  regenerateMessage(
    taskId: string,
    messageId: string,
    content: string,
    onEvent: (event: ChatStreamEvent) => void,
  ): ModelStreamSubscription;
}

export interface ModelStreamSubscription {
  cancel(): void;
  completed: Promise<void>;
}
