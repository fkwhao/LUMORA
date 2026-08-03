import { createStore } from "zustand/vanilla";

import type {
  ChatMessage,
  ChatRequestOptions,
  ChatStreamEvent,
  LumoraModelApi,
} from "../../../shared/model-contract";
import type {
  ApprovalDecision,
  LumoraTaskApi,
  TaskEvent,
  TaskSnapshot,
  TaskSummary,
} from "../../../shared/task-contract";
import {
  loadArchivedTaskIds,
  loadDeletedTaskIds,
  saveArchivedTaskIds,
  saveDeletedTaskIds,
} from "./task-archive-storage";
import {
  loadTaskProjectPaths,
  saveTaskProjectPaths,
} from "./project-context-storage";

interface TaskState {
  activeTask?: TaskSnapshot;
  recentTasks: TaskSummary[];
  archivedTaskIds: string[];
  deletedTaskIds: string[];
  isCreating: boolean;
  isLoadingHistory: boolean;
  isChatting: boolean;
  chatWasStopped: boolean;
  chatStartedAt?: number;
  lastChatDurationMs?: number;
  error?: string;
  chatError?: string;
  messages: ChatMessage[];
  taskEvents: TaskEvent[];
  taskProjectPaths: Record<string, string>;
  loadRecentTasks(): Promise<void>;
  openTask(taskId: string): Promise<void>;
  createTask(goal: string, projectPath?: string): Promise<TaskSnapshot>;
  sendMessage(content: string, options?: ChatRequestOptions): Promise<void>;
  stopChat(): void;
  regenerateMessage(
    messageId: string,
    content: string,
    options?: ChatRequestOptions,
  ): Promise<void>;
  decideApproval(decision: ApprovalDecision): Promise<TaskSnapshot>;
  archiveTask(taskId: string): void;
  restoreTask(taskId: string): void;
  deleteArchivedTask(taskId: string): void;
  deleteAllArchivedTasks(): void;
  clearActiveTask(): void;
  clearError(): void;
}

export type TaskStore = ReturnType<typeof createTaskStore>;

export function createTaskStore(
  api: LumoraTaskApi,
  modelApi?: LumoraModelApi,
) {
  let unsubscribe: (() => void) | undefined;
  let unsubscribeChat: (() => void) | undefined;
  let resolveChat: (() => void) | undefined;

  return createStore<TaskState>((set, get) => ({
    activeTask: undefined,
    recentTasks: [],
    archivedTaskIds: loadArchivedTaskIds(),
    deletedTaskIds: loadDeletedTaskIds(),
    isCreating: false,
    isLoadingHistory: false,
    isChatting: false,
    chatWasStopped: false,
    chatStartedAt: undefined,
    lastChatDurationMs: undefined,
    error: undefined,
    chatError: undefined,
    messages: [],
    taskEvents: [],
    taskProjectPaths: loadTaskProjectPaths(),

    async loadRecentTasks() {
      set({ isLoadingHistory: true });
      try {
        const deletedTaskIdSet = new Set(get().deletedTaskIds);
        const recentTasks = (await api.list()).filter(
          (task) => !deletedTaskIdSet.has(task.taskId),
        );
        set({ recentTasks, isLoadingHistory: false });
      } catch (error) {
        set({
          isLoadingHistory: false,
          error: toErrorMessage(error),
        });
      }
    },

    async openTask(taskId) {
      unsubscribeChat?.();
      unsubscribeChat = undefined;
      resolveChat?.();
      resolveChat = undefined;
      set({
        isLoadingHistory: true,
        chatError: undefined,
      });
      try {
        const [task, messages] = await Promise.all([
          api.get(taskId),
          modelApi?.listMessages(taskId) ?? Promise.resolve([]),
        ]);
        unsubscribe?.();
        unsubscribe = api.subscribe(task.taskId, (event) => {
          applyEvent(event, get, set);
        });
        set({
          activeTask: task,
          messages,
          taskEvents: [],
          isLoadingHistory: false,
          isChatting: false,
          chatWasStopped: false,
          chatStartedAt: undefined,
          lastChatDurationMs: undefined,
        });
      } catch (error) {
        set({
          isLoadingHistory: false,
          error: toErrorMessage(error),
        });
      }
    },

    async createTask(goal, projectPath) {
      const normalizedGoal = goal.trim();
      if (!normalizedGoal) {
        throw new Error("任务目标不能为空");
      }

      set({ isCreating: true, error: undefined });
      try {
        const task = await api.create(normalizedGoal);
        unsubscribe?.();
        unsubscribe = api.subscribe(task.taskId, (event) => {
          applyEvent(event, get, set);
        });
        set({
          activeTask: task,
          isCreating: false,
          messages: [],
          taskEvents: [],
          archivedTaskIds: get().archivedTaskIds.filter(
            (taskId) => taskId !== task.taskId,
          ),
          deletedTaskIds: get().deletedTaskIds.filter(
            (taskId) => taskId !== task.taskId,
          ),
          recentTasks: [
            {
              taskId: task.taskId,
              goal: task.goal,
              status: task.status,
              updatedAt: task.updatedAt,
            },
            ...get().recentTasks.filter(
              (item) => item.taskId !== task.taskId,
            ),
          ],
        });
        if (projectPath) {
          const taskProjectPaths = {
            ...get().taskProjectPaths,
            [task.taskId]: projectPath,
          };
          saveTaskProjectPaths(taskProjectPaths);
          set({ taskProjectPaths });
        }
        saveArchivedTaskIds(get().archivedTaskIds);
        saveDeletedTaskIds(get().deletedTaskIds);
        await get().sendMessage(normalizedGoal);
        return task;
      } catch (error) {
        const message = toErrorMessage(error);
        set({ isCreating: false, error: message });
        throw error;
      }
    },

    async sendMessage(content, options) {
      const normalizedContent = content.trim();
      if (!normalizedContent) {
        throw new Error("消息内容不能为空");
      }
      const task = get().activeTask;
      if (!task) {
        throw new Error("当前没有活动任务");
      }
      const userMessage: ChatMessage = {
        role: "user",
        content: normalizedContent,
        createdAt: new Date().toISOString(),
      };
      const messages = [
        ...get().messages,
        userMessage,
        { role: "assistant" as const, content: "" },
      ];
      set({
        messages,
        taskEvents: [],
        isChatting: true,
        chatWasStopped: false,
        chatError: undefined,
        chatStartedAt: Date.now(),
        lastChatDurationMs: undefined,
      });
      if (!modelApi) {
        set({
          messages: messages.slice(0, -1),
          isChatting: false,
          chatStartedAt: undefined,
          chatError: "模型能力尚未连接",
        });
        return;
      }
      await new Promise<void>((resolve) => {
        resolveChat = resolve;
        unsubscribeChat?.();
        unsubscribeChat = modelApi.streamMessage(
          task.taskId,
          normalizedContent,
          (event) => {
            applyChatEvent(event, task.taskId, modelApi, get, set, resolve);
          },
          options,
        );
      });
      resolveChat = undefined;
      unsubscribeChat?.();
      unsubscribeChat = undefined;
      await get().loadRecentTasks();
    },

    stopChat() {
      if (!get().isChatting) {
        return;
      }
      unsubscribeChat?.();
      unsubscribeChat = undefined;
      const chatStartedAt = get().chatStartedAt;
      const taskId = get().activeTask?.taskId;
      const stoppedUserMessage = [...get().messages]
        .reverse()
        .find((message) => message.role === "user");
      set({
        isChatting: false,
        chatWasStopped: true,
        chatStartedAt: undefined,
        lastChatDurationMs: chatStartedAt
          ? Date.now() - chatStartedAt
          : undefined,
        chatError: undefined,
      });
      const resolve = resolveChat;
      resolveChat = undefined;
      resolve?.();
      if (modelApi && taskId) {
        void modelApi
          .listMessages(taskId)
          .then((persistedMessages) => {
            if (
              !get().chatWasStopped ||
              get().activeTask?.taskId !== taskId ||
              !stoppedUserMessage
            ) {
              return;
            }
            const persistedUserMessage = [...persistedMessages]
              .reverse()
              .find(
                (message) =>
                  message.role === "user" &&
                  message.content === stoppedUserMessage.content &&
                  Boolean(message.messageId),
              );
            if (!persistedUserMessage) {
              return;
            }
            set({
              messages:
                persistedMessages.at(-1)?.role === "assistant"
                  ? persistedMessages
                  : [
                      ...persistedMessages,
                      { role: "assistant", content: "" },
                    ],
            });
          })
          .catch(() => undefined);
      }
    },

    async regenerateMessage(messageId, content, options) {
      const normalizedContent = content.trim();
      if (!normalizedContent) {
        throw new Error("消息内容不能为空");
      }
      const task = get().activeTask;
      if (!task) {
        throw new Error("当前没有活动任务");
      }
      if (get().isChatting) {
        throw new Error("请等待当前回答完成后再编辑");
      }
      if (!modelApi) {
        throw new Error("模型能力尚未连接");
      }

      const currentMessages = get().messages;
      const targetIndex = currentMessages.findIndex(
        (message) => message.messageId === messageId,
      );
      const latestUserMessage = [...currentMessages]
        .reverse()
        .find((message) => message.role === "user");
      if (
        targetIndex < 0 ||
        currentMessages[targetIndex]?.role !== "user" ||
        latestUserMessage?.messageId !== messageId
      ) {
        throw new Error("只能编辑最后一条用户消息");
      }

      const messages: ChatMessage[] = [
        ...currentMessages.slice(0, targetIndex),
        {
          ...currentMessages[targetIndex],
          content: normalizedContent,
          createdAt: new Date().toISOString(),
        },
        { role: "assistant", content: "" },
      ];
      set({
        messages,
        taskEvents: [],
        isChatting: true,
        chatWasStopped: false,
        chatError: undefined,
        chatStartedAt: Date.now(),
        lastChatDurationMs: undefined,
      });

      await new Promise<void>((resolve) => {
        resolveChat = resolve;
        unsubscribeChat?.();
        unsubscribeChat = modelApi.regenerateMessage(
          task.taskId,
          messageId,
          normalizedContent,
          (event) => {
            applyChatEvent(event, task.taskId, modelApi, get, set, resolve);
          },
          options,
        );
      });
      resolveChat = undefined;
      unsubscribeChat?.();
      unsubscribeChat = undefined;
      await get().loadRecentTasks();
    },

    async decideApproval(decision) {
      const task = get().activeTask;
      if (!task?.approval) {
        throw new Error("当前任务没有待处理的审批");
      }

      const updated = await api.decideApproval({
        taskId: task.taskId,
        approvalId: task.approval.approvalId,
        decision,
      });
      // 审批接口只返回任务状态时，继续保留创建阶段得到的完整计划。
      const merged = {
        ...updated,
        planSteps:
          updated.planSteps.length > 0 ? updated.planSteps : task.planSteps,
      };
      set({ activeTask: merged });
      return merged;
    },

    archiveTask(taskId) {
      const archivedTaskIds = [
        taskId,
        ...get().archivedTaskIds.filter((item) => item !== taskId),
      ];
      saveArchivedTaskIds(archivedTaskIds);
      if (get().activeTask?.taskId === taskId) {
        unsubscribe?.();
        unsubscribe = undefined;
        unsubscribeChat?.();
        unsubscribeChat = undefined;
        resolveChat?.();
        resolveChat = undefined;
        set({
          archivedTaskIds,
          activeTask: undefined,
          messages: [],
          taskEvents: [],
          isChatting: false,
          chatWasStopped: false,
          chatStartedAt: undefined,
          lastChatDurationMs: undefined,
          chatError: undefined,
        });
        return;
      }
      set({ archivedTaskIds });
    },

    restoreTask(taskId) {
      const archivedTaskIds = get().archivedTaskIds.filter(
        (item) => item !== taskId,
      );
      saveArchivedTaskIds(archivedTaskIds);
      set({ archivedTaskIds });
    },

    deleteArchivedTask(taskId) {
      if (!get().archivedTaskIds.includes(taskId)) {
        return;
      }
      const archivedTaskIds = get().archivedTaskIds.filter(
        (item) => item !== taskId,
      );
      const deletedTaskIds = [
        taskId,
        ...get().deletedTaskIds.filter((item) => item !== taskId),
      ];
      saveArchivedTaskIds(archivedTaskIds);
      saveDeletedTaskIds(deletedTaskIds);
      const taskProjectPaths = { ...get().taskProjectPaths };
      delete taskProjectPaths[taskId];
      saveTaskProjectPaths(taskProjectPaths);
      set({
        archivedTaskIds,
        deletedTaskIds,
        taskProjectPaths,
        recentTasks: get().recentTasks.filter(
          (task) => task.taskId !== taskId,
        ),
      });
    },

    deleteAllArchivedTasks() {
      const archivedTaskIdSet = new Set(get().archivedTaskIds);
      const deletedTaskIds = [
        ...get().archivedTaskIds,
        ...get().deletedTaskIds.filter(
          (taskId) => !archivedTaskIdSet.has(taskId),
        ),
      ];
      saveArchivedTaskIds([]);
      saveDeletedTaskIds(deletedTaskIds);
      const taskProjectPaths = Object.fromEntries(
        Object.entries(get().taskProjectPaths).filter(
          ([taskId]) => !archivedTaskIdSet.has(taskId),
        ),
      );
      saveTaskProjectPaths(taskProjectPaths);
      set({
        archivedTaskIds: [],
        deletedTaskIds,
        taskProjectPaths,
        recentTasks: get().recentTasks.filter(
          (task) => !archivedTaskIdSet.has(task.taskId),
        ),
      });
    },

    clearActiveTask() {
      unsubscribe?.();
      unsubscribe = undefined;
      unsubscribeChat?.();
      unsubscribeChat = undefined;
      resolveChat?.();
      resolveChat = undefined;
      set({
        activeTask: undefined,
        error: undefined,
        chatError: undefined,
        messages: [],
        taskEvents: [],
        isChatting: false,
        chatWasStopped: false,
        chatStartedAt: undefined,
        lastChatDurationMs: undefined,
      });
    },

    clearError() {
      set({ error: undefined });
    },
  }));
}

function applyChatEvent(
  event: ChatStreamEvent,
  taskId: string,
  modelApi: LumoraModelApi,
  get: () => TaskState,
  set: (partial: Partial<TaskState>) => void,
  resolve: () => void,
): void {
  if (event.type === "text_delta") {
    const messages = [...get().messages];
    const last = messages.at(-1);
    if (last?.role === "assistant") {
      messages[messages.length - 1] = {
        ...last,
        content: last.content + event.delta,
        model: event.model || last.model,
      };
      set({ messages });
    }
    return;
  }
  if (event.type === "reasoning_delta") {
    const messages = [...get().messages];
    const last = messages.at(-1);
    if (last?.role === "assistant") {
      messages[messages.length - 1] = {
        ...last,
        reasoningContent:
          (last.reasoningContent ?? "") + event.delta,
        model: event.model || last.model,
      };
      set({ messages });
    }
    return;
  }
  if (event.type === "usage") {
    const messages = [...get().messages];
    const last = messages.at(-1);
    if (last?.role === "assistant") {
      messages[messages.length - 1] = {
        ...last,
        usage: event.usage,
        model: event.model || last.model,
      };
      set({ messages });
    }
    return;
  }
  if (event.type === "completed") {
    const chatStartedAt = get().chatStartedAt;
    const lastChatDurationMs = chatStartedAt
      ? Date.now() - chatStartedAt
      : undefined;
    void modelApi
      .listMessages(taskId)
      .then((messages) =>
        set({
          messages,
          isChatting: false,
          chatWasStopped: false,
          chatStartedAt: undefined,
          lastChatDurationMs,
        }),
      )
      .catch(() =>
        set({
          isChatting: false,
          chatWasStopped: false,
          chatStartedAt: undefined,
          lastChatDurationMs,
        }),
      )
      .finally(resolve);
    return;
  }
  if (event.type === "failed") {
    const chatStartedAt = get().chatStartedAt;
    const lastChatDurationMs = chatStartedAt
      ? Date.now() - chatStartedAt
      : undefined;
    void modelApi
      .listMessages(taskId)
      .then((messages) =>
        set({
          messages,
          isChatting: false,
          chatWasStopped: false,
          chatStartedAt: undefined,
          lastChatDurationMs,
          chatError: event.errorMessage || "模型流式响应失败",
        }),
      )
      .catch(() =>
        set({
          isChatting: false,
          chatWasStopped: false,
          chatStartedAt: undefined,
          lastChatDurationMs,
          chatError: event.errorMessage || "模型流式响应失败",
        }),
      )
      .finally(resolve);
  }
}

function applyEvent(
  event: TaskEvent,
  get: () => TaskState,
  set: (partial: Partial<TaskState>) => void,
): void {
  const current = get().activeTask;
  // 事件可在断线后重放，序号检查防止旧事件覆盖当前任务快照。
  if (
    !current ||
    current.taskId !== event.taskId ||
    event.sequence <= current.lastEventSequence
  ) {
    return;
  }

  set({
    activeTask: {
      ...current,
      status: event.status,
      lastEventSequence: event.sequence,
      activeStep: event.title,
      approval:
        event.status === "WAITING_APPROVAL"
          ? event.approval ?? current.approval
          : undefined,
      errorMessage: event.errorMessage,
      resultSummary:
        event.type === "RESULT_AVAILABLE"
          ? event.userMessage
          : current.resultSummary,
    },
    recentTasks: get().recentTasks.map((task) =>
      task.taskId === event.taskId
        ? {
            ...task,
            status: event.status,
            updatedAt: new Date().toISOString(),
          }
        : task,
    ),
    taskEvents: [
      ...get().taskEvents.filter(
        (currentEvent) => currentEvent.sequence !== event.sequence,
      ),
      event,
    ].sort((first, second) => first.sequence - second.sequence),
  });
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "任务创建失败";
}
