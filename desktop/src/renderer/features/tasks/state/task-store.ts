import { createStore } from "zustand/vanilla";

import type {
  ChatMessage,
  ChatRequestOptions,
  LumoraModelApi,
  ToolApprovalDecision,
  ToolApprovalRequest,
} from "../../../../shared/model-contract";
import type {
  ApprovalDecision,
  LumoraTaskApi,
  TaskEvent,
  TaskSnapshot,
  TaskSummary,
} from "../../../../shared/task-contract";
import { applyChatEvent } from "./chat-event-handler";
import { reconcilePersistedMessages } from "./chat-message-reconciliation";
import {
  createChatEventBatcher,
  type ChatEventBatcher,
} from "./chat-event-batcher";
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
import { reduceTaskEvent } from "./task-event-reducer";

export interface TaskState {
  activeTask?: TaskSnapshot;
  recentTasks: TaskSummary[];
  archivedTaskIds: string[];
  deletedTaskIds: string[];
  isCreating: boolean;
  isLoadingHistory: boolean;
  isHydratingHistory: boolean;
  historyHydrationProgress: number;
  isChatting: boolean;
  isCompacting: boolean;
  chatWasStopped: boolean;
  chatStartedAt?: number;
  lastChatDurationMs?: number;
  error?: string;
  chatError?: string;
  messages: ChatMessage[];
  taskEvents: TaskEvent[];
  taskProjectPaths: Record<string, string>;
  pendingToolApproval?: ToolApprovalRequest;
  isDecidingToolApproval: boolean;
  loadRecentTasks(): Promise<void>;
  openTask(taskId: string): Promise<void>;
  createTask(goal: string, projectPath?: string): Promise<TaskSnapshot>;
  sendMessage(content: string, options?: ChatRequestOptions): Promise<void>;
  updateComposerPreferences(
    model: string,
    reasoningEffort: string,
  ): Promise<void>;
  compactContext(model?: string): Promise<void>;
  stopChat(): void;
  regenerateMessage(
    messageId: string,
    content: string,
    options?: ChatRequestOptions,
  ): Promise<void>;
  switchMessageBranch(messageId: string): Promise<void>;
  decideApproval(decision: ApprovalDecision): Promise<TaskSnapshot>;
  decideToolApproval(decision: ToolApprovalDecision): Promise<void>;
  archiveTask(taskId: string): void;
  restoreTask(taskId: string): void;
  deleteArchivedTask(taskId: string): void;
  deleteAllArchivedTasks(): void;
  clearActiveTask(): void;
  clearError(): void;
}

export type TaskStore = ReturnType<typeof createTaskStore>;

const HISTORY_INITIAL_MESSAGE_COUNT = 18;
const HISTORY_MIN_CHUNK_SIZE = 32;
const HISTORY_MAX_RENDER_PASSES = 12;

function findHistoryChunkStart(messages: ChatMessage[], candidate: number) {
  let startIndex = candidate;
  while (startIndex > 0 && messages[startIndex]?.role !== "user") {
    startIndex -= 1;
  }
  return startIndex;
}

function getInitialHistoryWindow(messages: ChatMessage[]) {
  const candidate = Math.max(0, messages.length - HISTORY_INITIAL_MESSAGE_COUNT);
  const startIndex = findHistoryChunkStart(messages, candidate);
  return {
    messages: messages.slice(startIndex),
    startIndex,
    hasEarlierMessages: startIndex > 0,
    progress:
      messages.length === 0
        ? 1
        : (messages.length - startIndex) / messages.length,
  };
}

function waitForHistoryRenderFrame() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 18);
  });
}

export function createTaskStore(
  api: LumoraTaskApi,
  modelApi?: LumoraModelApi,
) {
  let unsubscribe: (() => void) | undefined;
  let unsubscribeChat: (() => void) | undefined;
  let resolveChat: (() => void) | undefined;
  let chatEventBatcher: ChatEventBatcher | undefined;
  let openTaskRequest = 0;
  let preferenceUpdateQueue = Promise.resolve<TaskSnapshot | undefined>(
    undefined,
  );
  const conversationCache = new Map<
    string,
    { task: TaskSnapshot; messages: ChatMessage[] }
  >();
  const clearChatEventBatcher = (flush: boolean) => {
    if (flush) chatEventBatcher?.flush();
    chatEventBatcher?.cancel();
    chatEventBatcher = undefined;
  };

  return createStore<TaskState>((set, get) => ({
    activeTask: undefined,
    recentTasks: [],
    archivedTaskIds: loadArchivedTaskIds(),
    deletedTaskIds: loadDeletedTaskIds(),
    isCreating: false,
    isLoadingHistory: false,
    isHydratingHistory: false,
    historyHydrationProgress: 1,
    isChatting: false,
    isCompacting: false,
    chatWasStopped: false,
    chatStartedAt: undefined,
    lastChatDurationMs: undefined,
    error: undefined,
    chatError: undefined,
    messages: [],
    taskEvents: [],
    taskProjectPaths: loadTaskProjectPaths(),
    pendingToolApproval: undefined,
    isDecidingToolApproval: false,

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

    async updateComposerPreferences(model, reasoningEffort) {
      const taskId = get().activeTask?.taskId;
      if (!taskId) return;
      const update = preferenceUpdateQueue.then(() =>
        api.updatePreferences({ taskId, model, reasoningEffort }),
      );
      preferenceUpdateQueue = update.catch(() => undefined);
      const updated = await update;
      if (get().activeTask?.taskId === taskId) {
        set((state) => ({
          activeTask: {
            ...state.activeTask!,
            selectedModel: updated.selectedModel,
            selectedReasoningEffort: updated.selectedReasoningEffort,
            updatedAt: updated.updatedAt ?? state.activeTask?.updatedAt,
          },
        }));
      }
      const cached = conversationCache.get(taskId);
      if (cached) {
        conversationCache.set(taskId, {
          ...cached,
          task: {
            ...cached.task,
            selectedModel: updated.selectedModel,
            selectedReasoningEffort: updated.selectedReasoningEffort,
          },
        });
      }
    },

    async openTask(taskId) {
      const requestId = ++openTaskRequest;
      const current = get();
      if (current.activeTask) {
        const currentCached = conversationCache.get(current.activeTask.taskId);
        conversationCache.set(current.activeTask.taskId, {
          task: current.activeTask,
          messages: current.isHydratingHistory
            ? (currentCached?.messages ?? current.messages)
            : current.messages,
        });
      }
      unsubscribeChat?.();
      unsubscribeChat = undefined;
      clearChatEventBatcher(false);
      resolveChat?.();
      resolveChat = undefined;
      unsubscribe?.();
      unsubscribe = undefined;
      const cached = conversationCache.get(taskId);
      const summary = current.recentTasks.find(
        (task) => task.taskId === taskId,
      );
      const optimisticTask = cached?.task ??
        (summary ? snapshotFromSummary(summary) : undefined);
      const cachedWindow = cached
        ? {
            messages: cached.messages,
            startIndex: 0,
            hasEarlierMessages: false,
            progress: 1,
          }
        : undefined;
      if (optimisticTask) {
        unsubscribe = api.subscribe(taskId, (event) => {
          applyEvent(event, get, set);
        });
      }
      set({
        activeTask: optimisticTask ?? current.activeTask,
        messages: cachedWindow?.messages ?? [],
        taskEvents: [],
        isLoadingHistory: !cached,
        isHydratingHistory: Boolean(cachedWindow?.hasEarlierMessages),
        historyHydrationProgress: cachedWindow?.progress ?? 0,
        isChatting: false,
        isCompacting: false,
        chatWasStopped: false,
        chatStartedAt: undefined,
        lastChatDurationMs: undefined,
        chatError: undefined,
        pendingToolApproval: undefined,
        isDecidingToolApproval: false,
      });
      const hydrateHistory = async (
        allMessages: ChatMessage[],
        initialStartIndex: number,
      ) => {
        let startIndex = initialStartIndex;
        if (startIndex <= 0) {
          if (requestId === openTaskRequest) {
            set({
              messages: allMessages,
              isHydratingHistory: false,
              historyHydrationProgress: 1,
            });
          }
          return;
        }

        const chunkSize = Math.max(
          HISTORY_MIN_CHUNK_SIZE,
          Math.ceil(allMessages.length / HISTORY_MAX_RENDER_PASSES),
        );
        while (startIndex > 0) {
          await waitForHistoryRenderFrame();
          if (requestId !== openTaskRequest) return;

          startIndex = findHistoryChunkStart(
            allMessages,
            Math.max(0, startIndex - chunkSize),
          );
          set({
            messages: allMessages.slice(startIndex),
            isHydratingHistory: startIndex > 0,
            historyHydrationProgress:
              allMessages.length === 0
                ? 1
                : (allMessages.length - startIndex) / allMessages.length,
          });
        }
      };
      try {
        const [task, messages] = await Promise.all([
          api.get(taskId),
          modelApi?.listMessages(taskId) ?? Promise.resolve([]),
        ]);
        conversationCache.set(taskId, { task, messages });
        if (requestId !== openTaskRequest) {
          return;
        }
        unsubscribe?.();
        unsubscribe = api.subscribe(task.taskId, (event) => {
          applyEvent(event, get, set);
        });
        const historyWindow = cached
          ? { messages, startIndex: 0, hasEarlierMessages: false, progress: 1 }
          : getInitialHistoryWindow(messages);
        set({
          activeTask: task,
          messages: historyWindow.messages,
          taskEvents: [],
          isLoadingHistory: false,
          isHydratingHistory: historyWindow.hasEarlierMessages,
          historyHydrationProgress: historyWindow.progress,
          isChatting: false,
          isCompacting: false,
          chatWasStopped: false,
          chatStartedAt: undefined,
          lastChatDurationMs: undefined,
          pendingToolApproval: undefined,
          isDecidingToolApproval: false,
        });
        if (!cached) {
          await hydrateHistory(messages, historyWindow.startIndex);
        }
      } catch (error) {
        if (requestId !== openTaskRequest) {
          return;
        }
        set({
          isLoadingHistory: false,
          isHydratingHistory: false,
          historyHydrationProgress: 1,
          error: toErrorMessage(error),
        });
      }
    },

    async createTask(goal, projectPath) {
      openTaskRequest += 1;
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
          isLoadingHistory: false,
          isHydratingHistory: false,
          historyHydrationProgress: 1,
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
      if (get().isCompacting) {
        throw new Error("正在压缩上下文，请稍候");
      }
      const userMessage: ChatMessage = {
        runtimeId: createOptimisticMessageId(),
        role: "user",
        content: normalizedContent,
        createdAt: new Date().toISOString(),
      };
      const messages = [
        ...get().messages,
        userMessage,
        {
          runtimeId: createOptimisticMessageId(),
          role: "assistant" as const,
          content: "",
        },
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
        clearChatEventBatcher(false);
        chatEventBatcher = createChatEventBatcher((event) => {
          applyChatEvent(event, task.taskId, modelApi, get, set, resolve);
        });
        unsubscribeChat = modelApi.streamMessage(
          task.taskId,
          normalizedContent,
          (event) => {
            chatEventBatcher?.push(event);
          },
          {
            ...options,
            workspacePath:
              options?.workspacePath ?? get().taskProjectPaths[task.taskId],
          },
        );
      });
      clearChatEventBatcher(true);
      resolveChat = undefined;
      unsubscribeChat?.();
      unsubscribeChat = undefined;
      await get().loadRecentTasks();
    },

    async compactContext(model) {
      const task = get().activeTask;
      if (!task || !modelApi) {
        throw new Error("当前任务无法压缩上下文");
      }
      if (get().isChatting || get().isCompacting) {
        throw new Error("当前任务正在处理，请稍候");
      }
      const itemId = `manual-context-compact-${crypto.randomUUID()}`;
      set({
        isCompacting: true,
        chatError: undefined,
        messages: updateContextWorkLog(get().messages, {
          itemId,
          kind: "context",
          status: "running",
          title: "正在压缩上下文",
          content: "正在分析历史消息…",
        }),
      });
      try {
        const result = await modelApi.compactContext(task.taskId, model);
        const messages = await modelApi.listMessages(task.taskId);
        set({ messages, isCompacting: false });
        if (messages.length === 0) {
          set({
            messages: updateContextWorkLog(get().messages, {
              itemId,
              kind: "context",
              status: "completed",
              title: "已压缩上下文",
              content: `已压缩上下文 · ${result.beforeTokens} → ${result.afterTokens} Token`,
              metadata: {
                beforeTokens: result.beforeTokens,
                afterTokens: result.afterTokens,
                throughSequence: result.throughSequence,
              },
            }),
          });
        }
      } catch (error) {
        const message = toErrorMessage(error);
        set({
          isCompacting: false,
          chatError: message,
          messages: updateContextWorkLog(get().messages, {
            itemId,
            kind: "context",
            status: "failed",
            title: "上下文压缩失败",
            content: message,
            errorMessage: message,
          }),
        });
        throw error;
      }
    },

    stopChat() {
      if (!get().isChatting) {
        return;
      }
      clearChatEventBatcher(true);
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
            const liveMessages = get().messages;
            const liveAssistant = liveMessages.at(-1);
            const persistedWithAssistant =
              persistedMessages.at(-1)?.role === "assistant"
                ? persistedMessages
                : [
                    ...persistedMessages,
                    liveAssistant?.role === "assistant"
                      ? liveAssistant
                      : { role: "assistant" as const, content: "" },
                  ];
            set({
              messages: reconcilePersistedMessages(
                liveMessages,
                persistedWithAssistant,
              ),
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
        {
          runtimeId: createOptimisticMessageId(),
          role: "assistant",
          content: "",
        },
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
        clearChatEventBatcher(false);
        chatEventBatcher = createChatEventBatcher((event) => {
          applyChatEvent(event, task.taskId, modelApi, get, set, resolve);
        });
        unsubscribeChat = modelApi.regenerateMessage(
          task.taskId,
          messageId,
          normalizedContent,
          (event) => {
            chatEventBatcher?.push(event);
          },
          {
            ...options,
            workspacePath:
              options?.workspacePath ?? get().taskProjectPaths[task.taskId],
          },
        );
      });
      clearChatEventBatcher(true);
      resolveChat = undefined;
      unsubscribeChat?.();
      unsubscribeChat = undefined;
      await get().loadRecentTasks();
    },

    async switchMessageBranch(messageId) {
      const taskId = get().activeTask?.taskId;
      if (!taskId || !modelApi?.activateMessageBranch) return;
      await modelApi.activateMessageBranch(taskId, messageId);
      const messages = await modelApi.listMessages(taskId);
      set({ messages });
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

    async decideToolApproval(decision) {
      const taskId = get().activeTask?.taskId;
      const approval = get().pendingToolApproval;
      if (!taskId || !approval || !modelApi) {
        throw new Error("当前没有待处理的工具审批");
      }
      set({ isDecidingToolApproval: true, chatError: undefined });
      try {
        await modelApi.decideToolApproval(
          taskId,
          approval.approvalId,
          decision,
        );
      } catch (error) {
        set({
          isDecidingToolApproval: false,
          chatError: toErrorMessage(error),
        });
        throw error;
      }
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
        clearChatEventBatcher(false);
        resolveChat?.();
        resolveChat = undefined;
        set({
          archivedTaskIds,
          activeTask: undefined,
          messages: [],
          taskEvents: [],
          isChatting: false,
          isCompacting: false,
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
      openTaskRequest += 1;
      unsubscribe?.();
      unsubscribe = undefined;
      unsubscribeChat?.();
      unsubscribeChat = undefined;
      clearChatEventBatcher(false);
      resolveChat?.();
      resolveChat = undefined;
      set({
        activeTask: undefined,
        error: undefined,
        chatError: undefined,
        messages: [],
        taskEvents: [],
        isLoadingHistory: false,
        isHydratingHistory: false,
        historyHydrationProgress: 1,
        isChatting: false,
        isCompacting: false,
        chatWasStopped: false,
        chatStartedAt: undefined,
        lastChatDurationMs: undefined,
        pendingToolApproval: undefined,
        isDecidingToolApproval: false,
      });
    },

    clearError() {
      set({ error: undefined });
    },
  }));
}

function snapshotFromSummary(summary: TaskSummary): TaskSnapshot {
  return {
    taskId: summary.taskId,
    goal: summary.goal,
    status: summary.status,
    lastEventSequence: 0,
    activeStep: "",
    resultSummary: "",
    planSteps: [],
    updatedAt: summary.updatedAt,
  };
}

function applyEvent(
  event: TaskEvent,
  get: () => TaskState,
  set: (partial: Partial<TaskState>) => void,
): void {
  const nextState = reduceTaskEvent(event, get());
  if (nextState) set(nextState);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "任务创建失败";
}

function createOptimisticMessageId(): string {
  return `lumora-live-${crypto.randomUUID()}`;
}

function updateContextWorkLog(
  messages: ChatMessage[],
  item: NonNullable<ChatMessage["workLog"]>[number],
): ChatMessage[] {
  const next = [...messages];
  let index = -1;
  for (let current = next.length - 1; current >= 0; current -= 1) {
    if (
      next[current]?.role === "assistant" &&
      next[current]?.workLog?.some((entry) => entry.itemId === item.itemId)
    ) {
      index = current;
      break;
    }
  }
  if (index < 0) {
    return [
      ...next,
      {
        role: "assistant",
        content: "",
        workLog: [item],
        createdAt: new Date().toISOString(),
      },
    ];
  }
  const message = next[index]!;
  const workLog = [...(message.workLog ?? [])];
  const itemIndex = workLog.findIndex((entry) => entry.itemId === item.itemId);
  if (itemIndex >= 0) workLog[itemIndex] = item;
  else workLog.push(item);
  next[index] = { ...message, workLog };
  return next;
}
