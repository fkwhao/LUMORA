import { ipcMain } from "electron";

import type {
  ChatMessage,
  ChatRequestOptions,
  ChatStreamEvent,
  ListModelsInput,
  SaveModelProviderInput,
  SaveProviderModelInput,
  UpdateModelSettingsInput,
  ToolApprovalDecision,
} from "../../../shared/model-contract";
import type { ModelGateway } from "./model-gateway";

export const modelIpcChannels = {
  listProviders: "model:list-providers",
  usageStatistics: "model:usage-statistics",
  createProvider: "model:create-provider",
  updateProvider: "model:update-provider",
  activateProvider: "model:activate-provider",
  disableProvider: "model:disable-provider",
  deleteProvider: "model:delete-provider",
  listProviderModels: "model:list-provider-models",
  createProviderModel: "model:create-provider-model",
  updateProviderModel: "model:update-provider-model",
  deleteProviderModel: "model:delete-provider-model",
  testProviderModel: "model:test-provider-model",
  getSettings: "model:get-settings",
  updateSettings: "model:update-settings",
  listModels: "model:list-models",
  complete: "model:complete",
  listMessages: "model:list-messages",
  activateMessageBranch: "model:activate-message-branch",
  decideToolApproval: "model:decide-tool-approval",
  compactContext: "model:compact-context",
  readArtifact: "model:read-artifact",
  streamStart: "model:stream-start",
  streamCancel: "model:stream-cancel",
  streamEvent: "model:stream-event",
} as const;

export function registerModelIpc(gateway: ModelGateway): () => void {
  const subscriptions = new Map<string, () => void>();
  ipcMain.handle(modelIpcChannels.listProviders, () => gateway.listProviders());
  ipcMain.handle(modelIpcChannels.usageStatistics, (_event, days?: number) =>
    gateway.getUsageStatistics(validateStatisticsDays(days)));
  ipcMain.handle(modelIpcChannels.createProvider, (_event, input: SaveModelProviderInput) =>
    gateway.createProvider(validateProvider(input)));
  ipcMain.handle(modelIpcChannels.updateProvider, (_event, providerId: string, input: SaveModelProviderInput) =>
    gateway.updateProvider(requireText(providerId, "供应商 ID"), validateProvider(input)));
  ipcMain.handle(modelIpcChannels.activateProvider, (_event, providerId: string) =>
    gateway.activateProvider(requireText(providerId, "供应商 ID")));
  ipcMain.handle(modelIpcChannels.disableProvider, (_event, providerId: string) =>
    gateway.disableProvider(requireText(providerId, "供应商 ID")));
  ipcMain.handle(modelIpcChannels.deleteProvider, (_event, providerId: string) =>
    gateway.deleteProvider(requireText(providerId, "供应商 ID")));
  ipcMain.handle(modelIpcChannels.listProviderModels, (_event, providerId: string, apiKey?: string) =>
    gateway.listProviderModels(requireText(providerId, "供应商 ID"), apiKey?.trim() || undefined));
  ipcMain.handle(modelIpcChannels.createProviderModel, (_event, providerId: string, input: SaveProviderModelInput) =>
    gateway.createProviderModel(requireText(providerId, "供应商 ID"), validateProviderModel(input)));
  ipcMain.handle(modelIpcChannels.updateProviderModel, (_event, providerId: string, modelConfigurationId: string, input: SaveProviderModelInput) =>
    gateway.updateProviderModel(requireText(providerId, "供应商 ID"), requireText(modelConfigurationId, "模型配置 ID"), validateProviderModel(input)));
  ipcMain.handle(modelIpcChannels.deleteProviderModel, (_event, providerId: string, modelConfigurationId: string) =>
    gateway.deleteProviderModel(requireText(providerId, "供应商 ID"), requireText(modelConfigurationId, "模型配置 ID")));
  ipcMain.handle(modelIpcChannels.testProviderModel, (_event, providerId: string, modelConfigurationId: string) =>
    gateway.testProviderModel(requireText(providerId, "供应商 ID"), requireText(modelConfigurationId, "模型配置 ID")));
  ipcMain.handle(modelIpcChannels.getSettings, () => gateway.getSettings());
  ipcMain.handle(
    modelIpcChannels.updateSettings,
    (_event, input: UpdateModelSettingsInput) =>
      gateway.updateSettings(validateSettings(input)),
  );
  ipcMain.handle(
    modelIpcChannels.listModels,
    (_event, input: ListModelsInput) =>
      gateway.listModels(validateListModelsInput(input)),
  );
  ipcMain.handle(
    modelIpcChannels.complete,
    (_event, messages: ChatMessage[]) =>
      gateway.complete(validateMessages(messages)),
  );
  ipcMain.handle(modelIpcChannels.listMessages, (_event, taskId: string) =>
    gateway.listMessages(requireText(taskId, "任务 ID")),
  );
  ipcMain.handle(
    modelIpcChannels.activateMessageBranch,
    (_event, taskId: string, messageId: string) =>
      gateway.activateMessageBranch(
        requireText(taskId, "任务 ID"),
        requireText(messageId, "消息 ID"),
      ),
  );
  ipcMain.handle(
    modelIpcChannels.compactContext,
    (_event, taskId: string, model?: string) =>
      gateway.compactContext(
        requireText(taskId, "任务 ID"),
        model?.trim() || undefined,
      ),
  );
  ipcMain.handle(
    modelIpcChannels.readArtifact,
    (_event, taskId: string, artifactId: string, offset?: number, limit?: number) =>
      gateway.readArtifact(
        requireText(taskId, "任务 ID"),
        requireText(artifactId, "Artifact ID"),
        Number.isInteger(offset) ? offset : 0,
        Number.isInteger(limit) ? limit : 20_000,
      ),
  );
  ipcMain.handle(
    modelIpcChannels.decideToolApproval,
    (
      _event,
      input: {
        taskId: string;
        approvalId: string;
        decision: ToolApprovalDecision;
      },
    ) =>
      gateway.decideToolApproval(
        requireText(input?.taskId, "任务 ID"),
        requireText(input?.approvalId, "审批 ID"),
        validateToolApprovalDecision(input?.decision),
      ),
  );
  ipcMain.on(modelIpcChannels.streamStart, (event, input: StreamStartInput) => {
    const taskId = requireText(input?.taskId, "任务 ID");
    const content = requireText(input?.content, "消息内容");
    const messageId =
      input?.messageId === undefined
        ? undefined
        : requireText(input.messageId, "消息 ID");
    const requestId = requireText(input?.requestId, "流请求 ID");
    const options = validateChatRequestOptions(input?.options);
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
      ? gateway.regenerateMessage(
          taskId,
          messageId,
          content,
          handleEvent,
          options,
        )
      : gateway.streamMessage(taskId, content, handleEvent, options);
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
    ipcMain.removeHandler(modelIpcChannels.listProviders);
    ipcMain.removeHandler(modelIpcChannels.usageStatistics);
    ipcMain.removeHandler(modelIpcChannels.createProvider);
    ipcMain.removeHandler(modelIpcChannels.updateProvider);
    ipcMain.removeHandler(modelIpcChannels.activateProvider);
    ipcMain.removeHandler(modelIpcChannels.disableProvider);
    ipcMain.removeHandler(modelIpcChannels.deleteProvider);
    ipcMain.removeHandler(modelIpcChannels.listProviderModels);
    ipcMain.removeHandler(modelIpcChannels.createProviderModel);
    ipcMain.removeHandler(modelIpcChannels.updateProviderModel);
    ipcMain.removeHandler(modelIpcChannels.deleteProviderModel);
    ipcMain.removeHandler(modelIpcChannels.testProviderModel);
    ipcMain.removeHandler(modelIpcChannels.getSettings);
    ipcMain.removeHandler(modelIpcChannels.updateSettings);
    ipcMain.removeHandler(modelIpcChannels.listModels);
    ipcMain.removeHandler(modelIpcChannels.complete);
    ipcMain.removeHandler(modelIpcChannels.listMessages);
    ipcMain.removeHandler(modelIpcChannels.activateMessageBranch);
    ipcMain.removeHandler(modelIpcChannels.decideToolApproval);
    ipcMain.removeHandler(modelIpcChannels.compactContext);
    ipcMain.removeHandler(modelIpcChannels.readArtifact);
    ipcMain.removeAllListeners(modelIpcChannels.streamStart);
    ipcMain.removeAllListeners(modelIpcChannels.streamCancel);
    for (const cancel of subscriptions.values()) {
      cancel();
    }
    subscriptions.clear();
  };
}

function validateStatisticsDays(value?: number): number {
  if (value === undefined) return 365;
  if (!Number.isInteger(value) || value < 7 || value > 3660) {
    throw new TypeError("统计天数必须在 7 到 3660 之间");
  }
  return value;
}

function validateProvider(input: SaveModelProviderInput): SaveModelProviderInput {
  const validated = validateSettings(input);
  const formats = new Set(["anthropic", "chat-completions", "responses"]);
  if (!formats.has(input.apiFormat)) {
    throw new TypeError("API 格式无效");
  }
  return { ...validated, apiFormat: input.apiFormat };
}

function validateProviderModel(input: SaveProviderModelInput): SaveProviderModelInput {
  if (!input || typeof input !== "object") {
    throw new TypeError("模型配置格式无效");
  }
  const contextWindow = Number(input.contextWindow);
  const maxOutputTokens = Number(input.maxOutputTokens);
  if (!Number.isInteger(contextWindow) || contextWindow < 1 || contextWindow > 10_000_000) {
    throw new TypeError("上下文长度必须在 1 到 10000000 之间");
  }
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 10_000_000) {
    throw new TypeError("最大输出 Token 必须在 1 到 10000000 之间");
  }
  const reasoningEfforts = validateReasoningEfforts(input.reasoningEfforts);
  return {
    modelId: requireText(input.modelId, "模型 ID"),
    contextWindow,
    maxOutputTokens,
    reasoningEfforts,
    webSearchEnabled: input.webSearchEnabled === true,
  };
}

function validateReasoningEfforts(values: unknown): string[] {
  if (values === undefined) {
    return [];
  }
  if (!Array.isArray(values)) {
    throw new TypeError("推理档位格式无效");
  }
  if (values.length > 16) {
    throw new TypeError("推理档位最多可配置 16 个");
  }
  const normalized = values.map((value) => {
    if (typeof value !== "string") {
      throw new TypeError("推理档位必须是字符串");
    }
    const field = value.trim();
    if (!field || field.length > 64 || !/^[A-Za-z0-9._-]+$/.test(field)) {
      throw new TypeError("推理档位只能包含字母、数字、点、下划线和连字符");
    }
    return field;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError("推理档位不能重复");
  }
  return normalized;
}

interface StreamStartInput {
  requestId: string;
  taskId: string;
  messageId?: string;
  content: string;
  options?: ChatRequestOptions;
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
  const contextWindow = Number(input.contextWindow);
  if (!Number.isInteger(contextWindow) || contextWindow < 1 || contextWindow > 10_000_000) {
    throw new TypeError("上下文长度必须在 1 到 10000000 之间");
  }
  return { providerName, baseUrl, model, contextWindow, apiKey };
}

function validateListModelsInput(input: ListModelsInput): ListModelsInput {
  if (!input || typeof input !== "object") {
    throw new TypeError("模型连接格式无效");
  }
  return {
    providerName: requireText(input.providerName, "模型供应商"),
    baseUrl: requireText(input.baseUrl, "API 地址"),
    apiKey:
      input.apiKey === undefined || !input.apiKey.trim()
        ? undefined
        : input.apiKey.trim(),
  };
}

function validateChatRequestOptions(
  options?: ChatRequestOptions,
): ChatRequestOptions | undefined {
  if (!options) {
    return undefined;
  }
  const model = options.model?.trim() || undefined;
  const reasoningEffort = options.reasoningEffort?.trim() || undefined;
  if (
    reasoningEffort &&
    (reasoningEffort.length > 64 || !/^[A-Za-z0-9._-]+$/.test(reasoningEffort))
  ) {
    throw new TypeError("推理强度无效");
  }
  const workspacePath = options.workspacePath?.trim() || undefined;
  if (workspacePath && workspacePath.length > 1000) {
    throw new TypeError("工作区路径过长");
  }
  const permissionMode = options.permissionMode;
  const permissionModes = new Set([
    "full_access",
    "auto_approve",
    "request_approval",
  ]);
  if (permissionMode && !permissionModes.has(permissionMode)) {
    throw new TypeError("权限模式无效");
  }
  return { model, reasoningEffort, workspacePath, permissionMode };
}

function validateToolApprovalDecision(
  decision: unknown,
): ToolApprovalDecision {
  if (
    decision !== "allow_once" &&
    decision !== "allow_always" &&
    decision !== "deny"
  ) {
    throw new TypeError("工具审批决定无效");
  }
  return decision;
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
