import { contextBridge, ipcRenderer } from "electron";

import type {
  ApprovalDecisionInput,
  LumoraApi,
  TaskEvent,
  TaskPreferencesInput,
} from "../shared/task-contract";
import type {
  ChatMessage,
  ChatRequestOptions,
  ChatStreamEvent,
  ListModelsInput,
  SaveModelProviderInput,
  SaveProviderModelInput,
  UpdateModelSettingsInput,
  ToolApprovalDecision,
} from "../shared/model-contract";
import {
  validateApprovalDecisionInput,
  validateArtifactId,
  validateGoal,
  validateMessageId,
  validateTaskId,
  validateTaskPreferencesInput,
} from "../shared/validation";
import type { ResolvedAppearanceTheme } from "../shared/window-contract";
import type { SaveMcpServerInput } from "../shared/mcp-contract";
import type { ProjectDirectory } from "../shared/window-contract";

const api: LumoraApi = {
  tasks: {
    create: (goal) => ipcRenderer.invoke("tasks:create", validateGoal(goal)),
    list: () => ipcRenderer.invoke("tasks:list"),
    get: (taskId) => ipcRenderer.invoke("tasks:get", validateTaskId(taskId)),
    updatePreferences: (input: TaskPreferencesInput) =>
      ipcRenderer.invoke(
        "tasks:update-preferences",
        validateTaskPreferencesInput(input),
      ),
    subscribe: (untrustedTaskId, onEvent) => {
      const taskId = validateTaskId(untrustedTaskId);
      if (typeof onEvent !== "function") {
        throw new TypeError("任务事件处理器必须是函数");
      }
      const listener = (_event: Electron.IpcRendererEvent, event: TaskEvent) => {
        if (event.taskId === taskId) {
          onEvent(event);
        }
      };
      ipcRenderer.on("tasks:event", listener);
      ipcRenderer.send("tasks:subscribe", taskId);

      return () => {
        ipcRenderer.removeListener("tasks:event", listener);
        ipcRenderer.send("tasks:unsubscribe", taskId);
      };
    },
    decideApproval: (input: ApprovalDecisionInput) =>
      ipcRenderer.invoke(
        "tasks:decide-approval",
        validateApprovalDecisionInput(input),
      ),
  },
  model: {
    getUsageStatistics: (days?: number) =>
      ipcRenderer.invoke("model:usage-statistics", days),
    listProviders: () => ipcRenderer.invoke("model:list-providers"),
    createProvider: (input: SaveModelProviderInput) =>
      ipcRenderer.invoke("model:create-provider", input),
    updateProvider: (providerId: string, input: SaveModelProviderInput) =>
      ipcRenderer.invoke("model:update-provider", providerId, input),
    activateProvider: (providerId: string) =>
      ipcRenderer.invoke("model:activate-provider", providerId),
    disableProvider: (providerId: string) =>
      ipcRenderer.invoke("model:disable-provider", providerId),
    deleteProvider: (providerId: string) =>
      ipcRenderer.invoke("model:delete-provider", providerId),
    listProviderModels: (providerId: string, apiKey?: string) =>
      ipcRenderer.invoke("model:list-provider-models", providerId, apiKey),
    createProviderModel: (providerId: string, input: SaveProviderModelInput) =>
      ipcRenderer.invoke("model:create-provider-model", providerId, input),
    updateProviderModel: (providerId: string, modelConfigurationId: string, input: SaveProviderModelInput) =>
      ipcRenderer.invoke("model:update-provider-model", providerId, modelConfigurationId, input),
    deleteProviderModel: (providerId: string, modelConfigurationId: string) =>
      ipcRenderer.invoke("model:delete-provider-model", providerId, modelConfigurationId),
    testProviderModel: (providerId: string, modelConfigurationId: string) =>
      ipcRenderer.invoke("model:test-provider-model", providerId, modelConfigurationId),
    getSettings: () => ipcRenderer.invoke("model:get-settings"),
    updateSettings: (input: UpdateModelSettingsInput) =>
      ipcRenderer.invoke("model:update-settings", input),
    listModels: (input: ListModelsInput) =>
      ipcRenderer.invoke("model:list-models", input),
    complete: (messages: ChatMessage[]) =>
      ipcRenderer.invoke("model:complete", messages),
    listMessages: (taskId) =>
      ipcRenderer.invoke("model:list-messages", validateTaskId(taskId)),
    activateMessageBranch: (taskId, messageId) =>
      ipcRenderer.invoke(
        "model:activate-message-branch",
        validateTaskId(taskId),
        validateMessageId(messageId),
      ),
    compactContext: (taskId, model) =>
      ipcRenderer.invoke(
        "model:compact-context",
        validateTaskId(taskId),
        model?.trim() || undefined,
      ),
    readArtifact: (taskId, artifactId, offset, limit) =>
      ipcRenderer.invoke(
        "model:read-artifact",
        validateTaskId(taskId),
        validateArtifactId(artifactId),
        offset,
        limit,
      ),
    decideToolApproval: (
      taskId,
      approvalId,
      decision: ToolApprovalDecision,
    ) =>
      ipcRenderer.invoke("model:decide-tool-approval", {
        taskId: validateTaskId(taskId),
        approvalId: validateMessageId(approvalId),
        decision,
      }),
    streamMessage: (
      untrustedTaskId,
      untrustedContent,
      onEvent,
      options?: ChatRequestOptions,
    ) => {
      const taskId = validateTaskId(untrustedTaskId);
      const content = untrustedContent.trim();
      if (!content) {
        throw new TypeError("消息内容不能为空");
      }
      if (typeof onEvent !== "function") {
        throw new TypeError("模型流事件处理器必须是函数");
      }
      // 使用 Chromium Web Crypto，避免沙箱化 Preload 加载 Node crypto 失败。
      const requestId = globalThis.crypto.randomUUID();
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { requestId: string; event: ChatStreamEvent },
      ) => {
        if (payload.requestId === requestId) {
          onEvent(payload.event);
        }
      };
      ipcRenderer.on("model:stream-event", listener);
      ipcRenderer.send("model:stream-start", {
        requestId,
        taskId,
        content,
        options,
      });
      return () => {
        ipcRenderer.removeListener("model:stream-event", listener);
        ipcRenderer.send("model:stream-cancel", requestId);
      };
    },
    regenerateMessage: (
      untrustedTaskId,
      untrustedMessageId,
      untrustedContent,
      onEvent,
      options?: ChatRequestOptions,
    ) => {
      const taskId = validateTaskId(untrustedTaskId);
      const messageId = validateMessageId(untrustedMessageId);
      const content = untrustedContent.trim();
      if (!content) {
        throw new TypeError("消息内容不能为空");
      }
      if (typeof onEvent !== "function") {
        throw new TypeError("模型流事件处理器必须是函数");
      }
      const requestId = globalThis.crypto.randomUUID();
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { requestId: string; event: ChatStreamEvent },
      ) => {
        if (payload.requestId === requestId) {
          onEvent(payload.event);
        }
      };
      ipcRenderer.on("model:stream-event", listener);
      ipcRenderer.send("model:stream-start", {
        requestId,
        taskId,
        messageId,
        content,
        options,
      });
      return () => {
        ipcRenderer.removeListener("model:stream-event", listener);
        ipcRenderer.send("model:stream-cancel", requestId);
      };
    },
  },
  memory: {
    getSettings: () => ipcRenderer.invoke("memory:get-settings"),
    updateSettings: (enabled: boolean) => {
      if (typeof enabled !== "boolean") {
        throw new TypeError("记忆开关必须是布尔值");
      }
      return ipcRenderer.invoke("memory:update-settings", enabled);
    },
    reset: () => ipcRenderer.invoke("memory:reset"),
  },
  mcp: {
    listServers: () => ipcRenderer.invoke("mcp:list-servers"),
    saveServer: (serverId: string, input: SaveMcpServerInput) =>
      ipcRenderer.invoke("mcp:save-server", serverId, input),
    deleteServer: (serverId: string) =>
      ipcRenderer.invoke("mcp:delete-server", serverId),
    testServer: (serverId: string) =>
      ipcRenderer.invoke("mcp:test-server", serverId),
  },
  window: {
    setAppearance: (theme: ResolvedAppearanceTheme) => {
      if (theme !== "light" && theme !== "dark") {
        throw new TypeError("窗口主题必须是 light 或 dark");
      }
      ipcRenderer.send("window:set-appearance", theme);
    },
    selectProjectDirectory: (): Promise<ProjectDirectory | undefined> =>
      ipcRenderer.invoke("workspace:select-project-directory"),
  },
};

// 只暴露具体业务动作，不把 ipcRenderer 或任意 channel 交给页面。
contextBridge.exposeInMainWorld("lumora", api);
