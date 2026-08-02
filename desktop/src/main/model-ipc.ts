import { ipcMain } from "electron";

import type {
  ChatMessage,
  ChatStreamEvent,
  UpdateModelSettingsInput,
} from "../shared/model-contract";
import type { ModelGateway } from "./model-gateway";

export const modelIpcChannels = {
  getSettings: "model:get-settings",
  updateSettings: "model:update-settings",
  complete: "model:complete",
  listMessages: "model:list-messages",
  streamStart: "model:stream-start",
  streamCancel: "model:stream-cancel",
  streamEvent: "model:stream-event",
} as const;

export function registerModelIpc(gateway: ModelGateway): () => void {
  const subscriptions = new Map<string, () => void>();
  ipcMain.handle(modelIpcChannels.getSettings, () => gateway.getSettings());
  ipcMain.handle(
    modelIpcChannels.updateSettings,
    (_event, input: UpdateModelSettingsInput) =>
      gateway.updateSettings(validateSettings(input)),
  );
  ipcMain.handle(
    modelIpcChannels.complete,
    (_event, messages: ChatMessage[]) =>
      gateway.complete(validateMessages(messages)),
  );
  ipcMain.handle(modelIpcChannels.listMessages, (_event, taskId: string) =>
    gateway.listMessages(requireText(taskId, "任务 ID")),
  );
  ipcMain.on(modelIpcChannels.streamStart, (event, input: StreamStartInput) => {
    const taskId = requireText(input?.taskId, "任务 ID");
    const content = requireText(input?.content, "消息内容");
    const messageId =
      input?.messageId === undefined
        ? undefined
        : requireText(input.messageId, "消息 ID");
    const requestId = requireText(input?.requestId, "流请求 ID");
    const key = subscriptionKey(event.sender.id, requestId);
    subscriptions.get(key)?.();

    const handleEvent = (streamEvent: ChatStreamEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(modelIpcChannels.streamEvent, {
            requestId,
            event: streamEvent,
          });
        }
      };
    const subscription = messageId
      ? gateway.regenerateMessage(taskId, messageId, content, handleEvent)
      : gateway.streamMessage(taskId, content, handleEvent);
    subscriptions.set(key, subscription.cancel);
    void subscription.completed
      .catch((error: unknown) => {
        if (!event.sender.isDestroyed() && !isAbortError(error)) {
          event.sender.send(modelIpcChannels.streamEvent, {
            requestId,
            event: {
              type: "failed",
              delta: "",
              model: "",
              errorMessage: toErrorMessage(error),
            } satisfies ChatStreamEvent,
          });
        }
      })
      .finally(() => subscriptions.delete(key));
  });
  ipcMain.on(
    modelIpcChannels.streamCancel,
    (event, untrustedRequestId: string) => {
      const requestId = requireText(untrustedRequestId, "流请求 ID");
      const key = subscriptionKey(event.sender.id, requestId);
      subscriptions.get(key)?.();
      subscriptions.delete(key);
    },
  );

  return () => {
    ipcMain.removeHandler(modelIpcChannels.getSettings);
    ipcMain.removeHandler(modelIpcChannels.updateSettings);
    ipcMain.removeHandler(modelIpcChannels.complete);
    ipcMain.removeHandler(modelIpcChannels.listMessages);
    ipcMain.removeAllListeners(modelIpcChannels.streamStart);
    ipcMain.removeAllListeners(modelIpcChannels.streamCancel);
    for (const cancel of subscriptions.values()) {
      cancel();
    }
    subscriptions.clear();
  };
}

interface StreamStartInput {
  requestId: string;
  taskId: string;
  messageId?: string;
  content: string;
}

function validateSettings(
  input: UpdateModelSettingsInput,
): UpdateModelSettingsInput {
  if (!input || typeof input !== "object") {
    throw new TypeError("模型配置格式无效");
  }
  const providerName = requireText(input.providerName, "模型供应商");
  const baseUrl = requireText(input.baseUrl, "API 地址");
  const model = requireText(input.model, "模型名称");
  const apiKey =
    input.apiKey === undefined
      ? undefined
      : requireText(input.apiKey, "API Key");
  return { providerName, baseUrl, model, apiKey };
}

function validateMessages(messages: ChatMessage[]): ChatMessage[] {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
    throw new TypeError("对话消息数量无效");
  }
  return messages.map((message) => {
    if (message.role !== "user" && message.role !== "assistant") {
      throw new TypeError("对话消息角色无效");
    }
    return {
      role: message.role,
      content: requireText(message.content, "消息内容"),
    };
  });
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label}不能为空`);
  }
  return value.trim();
}

function subscriptionKey(webContentsId: number, requestId: string): string {
  return `${webContentsId}:${requestId}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "模型流式响应失败";
}
