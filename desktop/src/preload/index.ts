import { contextBridge, ipcRenderer } from "electron";

import type {
  ApprovalDecisionInput,
  LumoraApi,
  TaskEvent,
} from "../shared/task-contract";
import type {
  ChatMessage,
  ChatRequestOptions,
  ChatStreamEvent,
  ListModelsInput,
  UpdateModelSettingsInput,
} from "../shared/model-contract";
import {
  validateApprovalDecisionInput,
  validateGoal,
  validateMessageId,
  validateTaskId,
} from "../shared/validation";
import type { ResolvedAppearanceTheme } from "../shared/window-contract";
import type { ProjectDirectory } from "../shared/window-contract";

const api: LumoraApi = {
  tasks: {
    create: (goal) => ipcRenderer.invoke("tasks:create", validateGoal(goal)),
    list: () => ipcRenderer.invoke("tasks:list"),
    get: (taskId) => ipcRenderer.invoke("tasks:get", validateTaskId(taskId)),
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
    getSettings: () => ipcRenderer.invoke("model:get-settings"),
    updateSettings: (input: UpdateModelSettingsInput) =>
      ipcRenderer.invoke("model:update-settings", input),
    listModels: (input: ListModelsInput) =>
      ipcRenderer.invoke("model:list-models", input),
    complete: (messages: ChatMessage[]) =>
      ipcRenderer.invoke("model:complete", messages),
    listMessages: (taskId) =>
      ipcRenderer.invoke("model:list-messages", validateTaskId(taskId)),
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
