import { createStore } from "zustand/vanilla";

import type {
  ChatMessage,
  ChatRequestOptions,
  ConversationInput,
  ConversationInputTarget,
  UpdateConversationInput,
  ConversationRunEvent,
  ConversationRunSnapshot,
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
import {
  applyChatEvent,
  cancelSupplementalUsageRefresh,
  insertSteerUserMessage,
} from "./chat-event-handler";
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
  activeRun?: ConversationRunSnapshot;
  pendingInputs: ConversationInput[];
  recentTasks: TaskSummary[];
  archivedTaskIds: string[];
  deletedTaskIds: string[];
  isCreating: boolean;
  isLoadingHistory: boolean;
  isHydratingHistory: boolean;
  historyHydrationProgress: number;
  isChatting: boolean;
  isPausing: boolean;
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
  enqueueInput(
    content: string,
    target: ConversationInputTarget,
    options?: ChatRequestOptions,
  ): Promise<void>;
  updateInput(
    inputId: string,
    input: UpdateConversationInput,
  ): Promise<void>;
  deleteInput(inputId: string): Promise<void>;
  moveInput(inputId: string, direction: -1 | 1): Promise<void>;
  updateComposerPreferences(
    model: string,
    reasoningEffort: string,
  ): Promise<void>;
  compactContext(model?: string): Promise<void>;
  stopChat(): Promise<void>;
  resumeChat(): Promise<void>;
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

interface ConversationCacheEntry {
  task: TaskSnapshot;
  messages: ChatMessage[];
  activeRun?: ConversationRunSnapshot;
  pendingInputs: ConversationInput[];
  taskEvents: TaskEvent[];
  isChatting: boolean;
  isPausing: boolean;
  chatWasStopped: boolean;
  chatStartedAt?: number;
  lastChatDurationMs?: number;
  pendingToolApproval?: ToolApprovalRequest;
}

function conversationCacheEntry(
  state: TaskState,
  previous?: ConversationCacheEntry,
): ConversationCacheEntry {
  if (!state.activeTask) {
    throw new Error("缓存会话前必须存在活动任务");
  }
  return {
    task: state.activeTask,
    messages: state.isHydratingHistory
      ? (previous?.messages ?? state.messages)
      : state.messages,
    activeRun: state.activeRun,
    pendingInputs: state.pendingInputs,
    taskEvents: state.taskEvents,
    isChatting: state.isChatting,
    isPausing: state.isPausing,
    chatWasStopped: state.chatWasStopped,
    chatStartedAt: state.isChatting
      ? runStartedAt(state.activeRun, state.chatStartedAt)
      : state.chatStartedAt,
    lastChatDurationMs: state.lastChatDurationMs,
    pendingToolApproval: state.pendingToolApproval,
  };
}

function isRunProcessing(run?: ConversationRunSnapshot): boolean {
  return Boolean(
    run &&
    run.status !== "PAUSED" &&
    run.status !== "CANCELLED" &&
    run.status !== "COMPLETED" &&
    run.status !== "FAILED",
  );
}

function runStartedAt(
  run: ConversationRunSnapshot | undefined,
  fallback?: number,
): number {
  for (const value of [run?.startedAt, run?.createdAt]) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback ?? Date.now();
}

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
  const conversationCache = new Map<string, ConversationCacheEntry>();
  const clearChatEventBatcher = (flush: boolean) => {
    if (flush) chatEventBatcher?.flush();
    chatEventBatcher?.cancel();
    chatEventBatcher = undefined;
  };

  return createStore<TaskState>((set, get) => ({
    activeTask: undefined,
    activeRun: undefined,
    pendingInputs: [],
    recentTasks: [],
    archivedTaskIds: loadArchivedTaskIds(),
    deletedTaskIds: loadDeletedTaskIds(),
    isCreating: false,
    isLoadingHistory: false,
    isHydratingHistory: false,
    historyHydrationProgress: 1,
    isChatting: false,
    isPausing: false,
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
        conversationCache.set(
          current.activeTask.taskId,
          conversationCacheEntry(current, currentCached),
        );
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
        activeRun: cached?.activeRun,
        pendingInputs: cached?.pendingInputs ?? [],
        messages: cachedWindow?.messages ?? [],
        taskEvents: cached?.taskEvents ?? [],
        isLoadingHistory: !cached,
        isHydratingHistory: Boolean(cachedWindow?.hasEarlierMessages),
        historyHydrationProgress: cachedWindow?.progress ?? 0,
        isChatting: cached?.isChatting ?? false,
        isPausing: cached?.isPausing ?? false,
        isCompacting: false,
        chatWasStopped: cached?.chatWasStopped ?? false,
        chatStartedAt: cached?.chatStartedAt,
        lastChatDurationMs: cached?.lastChatDurationMs,
        chatError: undefined,
        pendingToolApproval: cached?.pendingToolApproval,
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
        const [task, messages, activeRun, pendingInputs] = await Promise.all([
          api.get(taskId),
          modelApi?.listMessages(taskId) ?? Promise.resolve([]),
          modelApi?.getActiveRun(taskId) ?? Promise.resolve(undefined),
          modelApi?.listInputs(taskId) ?? Promise.resolve([]),
        ]);
        const restoredCache = conversationCache.get(taskId) ?? cached;
        const runIsProcessing = isRunProcessing(activeRun);
        const sameCachedRun = Boolean(
          restoredCache?.activeRun &&
          activeRun &&
          restoredCache.activeRun.runId === activeRun.runId,
        );
        const resumeCachedRun = Boolean(
          sameCachedRun && runIsProcessing && restoredCache?.isChatting,
        );
        const resumeFromSequence =
          resumeCachedRun && restoredCache?.activeRun
            ? Math.max(
                activeRun?.replayFromSequence ?? 0,
                restoredCache.activeRun.lastEventSequence,
              )
            : activeRun?.replayFromSequence ?? 0;
        const persistedRunMessages = ensureRunAssistant(
          messages,
          runIsProcessing,
        );
        const runMessages = resumeCachedRun && restoredCache
          ? ensureRunAssistant(restoredCache.messages, runIsProcessing)
          : restoredCache
            ? reconcilePersistedMessages(
                restoredCache.messages,
                persistedRunMessages,
              )
            : persistedRunMessages;
        const restoredStartedAt = runIsProcessing
          ? runStartedAt(
              activeRun,
              resumeCachedRun ? restoredCache?.chatStartedAt : undefined,
            )
          : undefined;
        const restoredTaskEvents = resumeCachedRun
          ? (restoredCache?.taskEvents ?? [])
          : [];
        const restoredApproval = resumeCachedRun
          ? restoredCache?.pendingToolApproval
          : undefined;
        const restoredRun = activeRun && runIsProcessing
          ? {
              ...activeRun,
              lastEventSequence: resumeFromSequence,
            }
          : activeRun;
        const historyWindow = restoredCache
          ? {
              messages: runMessages,
              startIndex: 0,
              hasEarlierMessages: false,
              progress: 1,
            }
          : getInitialHistoryWindow(runMessages);
        conversationCache.set(taskId, {
          task,
          messages: runMessages,
          activeRun: restoredRun,
          pendingInputs,
          taskEvents: restoredTaskEvents,
          isChatting: runIsProcessing,
          isPausing: activeRun?.status === "PAUSING",
          chatWasStopped: activeRun?.status === "PAUSED",
          chatStartedAt: restoredStartedAt,
          lastChatDurationMs: runIsProcessing
            ? undefined
            : restoredCache?.lastChatDurationMs,
          pendingToolApproval: restoredApproval,
        });
        if (requestId !== openTaskRequest) {
          return;
        }
        unsubscribe?.();
        unsubscribe = api.subscribe(task.taskId, (event) => {
          applyEvent(event, get, set);
        });
        set({
          activeTask: task,
          activeRun: restoredRun,
          pendingInputs,
          messages: historyWindow.messages,
          taskEvents: restoredTaskEvents,
          isLoadingHistory: false,
          isHydratingHistory: historyWindow.hasEarlierMessages,
          historyHydrationProgress: historyWindow.progress,
          isChatting: runIsProcessing,
          isPausing: activeRun?.status === "PAUSING",
          isCompacting: false,
          chatWasStopped: activeRun?.status === "PAUSED",
          chatStartedAt: restoredStartedAt,
          lastChatDurationMs: runIsProcessing
            ? undefined
            : restoredCache?.lastChatDurationMs,
          pendingToolApproval: restoredApproval,
          isDecidingToolApproval: false,
        });
        if (runIsProcessing && activeRun && modelApi) {
          clearChatEventBatcher(false);
          const runBatcher = createChatEventBatcher((event) => {
            applyChatEvent(event, taskId, modelApi, get, set, () => undefined);
          });
          chatEventBatcher = runBatcher;
          unsubscribeChat = modelApi.subscribeRun(
            taskId,
            activeRun.runId,
            resumeFromSequence,
            (runEvent) => {
              if (get().activeTask?.taskId !== taskId) return;
              if (applyRunEnvelope(runEvent, get, set)) {
                runBatcher.push(runEvent.event);
              }
              if (
                runEvent.event.type === "completed" ||
                runEvent.event.type === "failed"
              ) {
                void followNextRun(
                  modelApi, taskId, get, set, activeRun.runId,
                );
              }
            },
          );
        }
        if (!cached) {
          await hydrateHistory(runMessages, historyWindow.startIndex);
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
          activeRun: undefined,
          pendingInputs: [],
          isCreating: false,
          messages: [],
          isLoadingHistory: false,
          isHydratingHistory: false,
          historyHydrationProgress: 1,
          taskEvents: [],
          isPausing: false,
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
      cancelSupplementalUsageRefresh(task.taskId);
      set({
        activeRun: undefined,
        messages,
        taskEvents: [],
        isChatting: true,
        isPausing: false,
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
      let ownSubscription: (() => void) | undefined;
      let ownBatcher: ChatEventBatcher | undefined;
      let ownResolve: (() => void) | undefined;
      await new Promise<void>((resolve) => {
        ownResolve = resolve;
        resolveChat = ownResolve;
        unsubscribeChat?.();
        clearChatEventBatcher(false);
        ownBatcher = createChatEventBatcher((event) => {
          applyChatEvent(event, task.taskId, modelApi, get, set, resolve);
        });
        chatEventBatcher = ownBatcher;
        ownSubscription = modelApi.streamMessage(
          task.taskId,
          normalizedContent,
          (event) => {
            ownBatcher?.push(event);
          },
          {
            ...options,
            workspacePath:
              options?.workspacePath ?? get().taskProjectPaths[task.taskId],
          },
        );
        unsubscribeChat = ownSubscription;
        void modelApi.getActiveRun(task.taskId).then((run) => {
          if (run && get().activeTask?.taskId === task.taskId) {
            set({ activeRun: run });
          }
        }).catch(() => undefined);
      });
      if (chatEventBatcher === ownBatcher) {
        ownBatcher?.flush();
        ownBatcher?.cancel();
        chatEventBatcher = undefined;
      }
      if (resolveChat === ownResolve) resolveChat = undefined;
      if (unsubscribeChat === ownSubscription) {
        ownSubscription?.();
        unsubscribeChat = undefined;
      }
      await get().loadRecentTasks();
      if (modelApi && get().activeTask?.taskId === task.taskId) {
        const pendingInputs = await modelApi.listInputs(task.taskId)
          .catch(() => get().pendingInputs);
        set({ pendingInputs });
        void followNextRun(modelApi, task.taskId, get, set);
      }
    },

    async enqueueInput(content, target, options) {
      const normalizedContent = content.trim();
      const taskId = get().activeTask?.taskId;
      if (!taskId || !modelApi) {
        throw new Error("当前任务无法加入问题队列");
      }
      if (!normalizedContent) {
        throw new Error("消息内容不能为空");
      }
      if (target === "NEXT_STEP") {
        const activeRun = get().activeRun
          ?? await waitForActiveRun(modelApi, taskId);
        if (!activeRun || !isPausableRun(activeRun)) {
          throw new Error("当前没有可引导的活动运行");
        }
      }
      const created = await modelApi.createInput(taskId, {
        content: normalizedContent,
        target,
        ...options,
        workspacePath:
          options?.workspacePath ?? get().taskProjectPaths[taskId],
      });
      const pendingInputs = await modelApi.listInputs(taskId);
      if (get().activeTask?.taskId === taskId) set({ pendingInputs });
      if (created.status === "CLAIMED") {
        void followNextRun(
          modelApi,
          taskId,
          get,
          set,
          get().activeRun?.runId,
        );
      }
    },

    async updateInput(inputId, input) {
      const taskId = get().activeTask?.taskId;
      if (!taskId || !modelApi) {
        throw new Error("当前任务无法编辑问题队列");
      }
      const previous = get().pendingInputs.find(
        (item) => item.inputId === inputId,
      );
      const wasPaused = get().activeRun?.status === "PAUSED";
      const updated = await modelApi.updateInput(taskId, inputId, input);
      if (
        previous?.target === "NEXT_TURN" &&
        updated.target === "NEXT_STEP"
      ) {
        set({
          messages: insertSteerUserMessage(
            get().messages,
            updated.inputId,
            updated.content,
            !wasPaused,
          ),
        });
      }
      const pendingInputs = await modelApi.listInputs(taskId);
      if (get().activeTask?.taskId === taskId) set({ pendingInputs });
      if (updated.status === "CLAIMED") {
        void followNextRun(
          modelApi,
          taskId,
          get,
          set,
          get().activeRun?.runId,
        );
      }
    },

    async deleteInput(inputId) {
      const taskId = get().activeTask?.taskId;
      if (!taskId || !modelApi) {
        throw new Error("当前任务无法删除问题队列内容");
      }
      await modelApi.deleteInput(taskId, inputId);
      const pendingInputs = await modelApi.listInputs(taskId);
      if (get().activeTask?.taskId === taskId) set({ pendingInputs });
    },

    async moveInput(inputId, direction) {
      const taskId = get().activeTask?.taskId;
      if (!taskId || !modelApi) return;
      const allItems = [...get().pendingInputs].sort(
        (left, right) => left.position - right.position,
      );
      const selected = allItems.find((item) => item.inputId === inputId);
      if (!selected) return;
      const items = allItems.filter(
        (item) => item.target === selected.target,
      );
      const index = items.findIndex((item) => item.inputId === inputId);
      const swapIndex = index + direction;
      if (index < 0 || swapIndex < 0 || swapIndex >= items.length) return;
      const current = items[index]!;
      const swap = items[swapIndex]!;
      await modelApi.updateInput(taskId, current.inputId, {
        position: swap.position,
      });
      await modelApi.updateInput(taskId, swap.inputId, {
        position: current.position,
      });
      const pendingInputs = await modelApi.listInputs(taskId);
      if (get().activeTask?.taskId === taskId) set({ pendingInputs });
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

    async stopChat() {
      if (!get().isChatting) {
        return;
      }
      const chatStartedAt = get().chatStartedAt;
      const taskId = get().activeTask?.taskId;
      if (!modelApi || !taskId) {
        throw new Error("当前运行无法暂停");
      }
      set({ isPausing: true, chatError: undefined });
      try {
        const cachedRun = get().activeRun;
        const currentRun = cachedRun && isPausableRun(cachedRun)
          ? cachedRun
          : await waitForActiveRun(modelApi, taskId);
        if (!currentRun) {
          throw new Error("运行状态尚未建立，请稍后重试");
        }
        const pausedRun = await modelApi.pauseRun(taskId, currentRun.runId);
        if (get().activeTask?.taskId === taskId) {
          set({
            activeRun: pausedRun,
            isPausing: pausedRun.status === "PAUSING",
          });
        }
        if (pausedRun.status === "PAUSED") {
          clearChatEventBatcher(true);
          unsubscribeChat?.();
          unsubscribeChat = undefined;
          if (get().activeTask?.taskId === taskId) {
            set({
              isChatting: false,
              isPausing: false,
              chatWasStopped: true,
              chatStartedAt: undefined,
              lastChatDurationMs: chatStartedAt
                ? Date.now() - chatStartedAt
                : undefined,
              pendingToolApproval: undefined,
              isDecidingToolApproval: false,
            });
          }
          try {
            const persistedMessages = await modelApi.listMessages(taskId);
            if (get().activeTask?.taskId === taskId) {
              set({
                messages: reconcilePausedMessages(
                  get().messages,
                  persistedMessages,
                ),
              });
            }
          } catch {
            // Run 已成功暂停；历史刷新失败不应把状态回滚为运行中。
          }
          const resolve = resolveChat;
          resolveChat = undefined;
          resolve?.();
        }
      } catch (error) {
        set({ isPausing: false, chatError: toErrorMessage(error) });
        throw error;
      }
    },

    async resumeChat() {
      const taskId = get().activeTask?.taskId;
      if (!taskId || !modelApi) {
        throw new Error("当前运行无法继续");
      }
      const pausedRun = get().activeRun
        ?? await modelApi.getActiveRun(taskId);
      if (!pausedRun || pausedRun.status !== "PAUSED") {
        throw new Error("当前没有已暂停的运行");
      }
      const previousMessages = get().messages;
      cancelSupplementalUsageRefresh(taskId);
      set({
        messages: appendContinuationAssistant(previousMessages),
        isChatting: true,
        isPausing: false,
        chatWasStopped: false,
        chatError: undefined,
        chatStartedAt: Date.now(),
      });
      let ownSubscription: (() => void) | undefined;
      let ownBatcher: ChatEventBatcher | undefined;
      let ownResolve: (() => void) | undefined;
      let resumedRun: ConversationRunSnapshot | undefined;
      try {
        const acceptedRun = await modelApi.resumeRun(
          taskId,
          pausedRun.runId,
        );
        resumedRun = acceptedRun;
        set({
          activeRun: {
            ...acceptedRun,
            lastEventSequence: acceptedRun.replayFromSequence,
          },
        });
        await new Promise<void>((resolve) => {
          ownResolve = resolve;
          resolveChat = ownResolve;
          clearChatEventBatcher(false);
          ownBatcher = createChatEventBatcher((event) => {
            applyChatEvent(event, taskId, modelApi, get, set, resolve);
          });
          chatEventBatcher = ownBatcher;
          ownSubscription = modelApi.subscribeRun(
            taskId,
            acceptedRun.runId,
            acceptedRun.replayFromSequence,
            (runEvent) => {
              if (get().activeTask?.taskId !== taskId) return;
              if (applyRunEnvelope(runEvent, get, set)) {
                ownBatcher?.push(runEvent.event);
              }
            },
          );
          unsubscribeChat = ownSubscription;
        });
        if (chatEventBatcher === ownBatcher) {
          ownBatcher?.flush();
          ownBatcher?.cancel();
          chatEventBatcher = undefined;
        }
        if (resolveChat === ownResolve) resolveChat = undefined;
        if (unsubscribeChat === ownSubscription) {
          ownSubscription?.();
          unsubscribeChat = undefined;
        }
        await get().loadRecentTasks();
      } catch (error) {
        if (chatEventBatcher === ownBatcher) {
          ownBatcher?.cancel();
          chatEventBatcher = undefined;
        }
        if (resolveChat === ownResolve) resolveChat = undefined;
        if (unsubscribeChat === ownSubscription) {
          ownSubscription?.();
          unsubscribeChat = undefined;
        }
        if (resumedRun) {
          await get().openTask(taskId);
          return;
        }
        if (get().activeTask?.taskId === taskId) {
          set({
            activeRun: pausedRun,
            messages: previousMessages,
            isChatting: false,
            chatWasStopped: true,
            chatStartedAt: undefined,
            chatError: toErrorMessage(error),
          });
        }
        throw error;
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
      cancelSupplementalUsageRefresh(task.taskId);
      set({
        activeRun: undefined,
        messages,
        taskEvents: [],
        isChatting: true,
        isPausing: false,
        chatWasStopped: false,
        chatError: undefined,
        chatStartedAt: Date.now(),
        lastChatDurationMs: undefined,
      });

      let ownSubscription: (() => void) | undefined;
      let ownBatcher: ChatEventBatcher | undefined;
      let ownResolve: (() => void) | undefined;
      await new Promise<void>((resolve) => {
        ownResolve = resolve;
        resolveChat = ownResolve;
        unsubscribeChat?.();
        clearChatEventBatcher(false);
        ownBatcher = createChatEventBatcher((event) => {
          applyChatEvent(event, task.taskId, modelApi, get, set, resolve);
        });
        chatEventBatcher = ownBatcher;
        ownSubscription = modelApi.regenerateMessage(
          task.taskId,
          messageId,
          normalizedContent,
          (event) => {
            ownBatcher?.push(event);
          },
          {
            ...options,
            workspacePath:
              options?.workspacePath ?? get().taskProjectPaths[task.taskId],
          },
        );
        unsubscribeChat = ownSubscription;
        void modelApi.getActiveRun(task.taskId).then((run) => {
          if (run && get().activeTask?.taskId === task.taskId) {
            set({ activeRun: run });
          }
        }).catch(() => undefined);
      });
      if (chatEventBatcher === ownBatcher) {
        ownBatcher?.flush();
        ownBatcher?.cancel();
        chatEventBatcher = undefined;
      }
      if (resolveChat === ownResolve) resolveChat = undefined;
      if (unsubscribeChat === ownSubscription) {
        ownSubscription?.();
        unsubscribeChat = undefined;
      }
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
          activeRun: undefined,
          pendingInputs: [],
          messages: [],
          taskEvents: [],
          isChatting: false,
          isPausing: false,
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
        activeRun: undefined,
        pendingInputs: [],
        error: undefined,
        chatError: undefined,
        messages: [],
        taskEvents: [],
        isLoadingHistory: false,
        isHydratingHistory: false,
        historyHydrationProgress: 1,
        isChatting: false,
        isPausing: false,
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

function ensureRunAssistant(
  messages: ChatMessage[],
  runIsProcessing: boolean,
): ChatMessage[] {
  if (!runIsProcessing || messages.at(-1)?.role === "assistant") {
    return messages;
  }
  return [
    ...messages,
    {
      runtimeId: createOptimisticMessageId(),
      role: "assistant",
      content: "",
    },
  ];
}

function appendContinuationAssistant(
  messages: ChatMessage[],
): ChatMessage[] {
  return [
    ...messages,
    {
      runtimeId: createOptimisticMessageId(),
      role: "assistant",
      content: "",
    },
  ];
}

function applyRunEnvelope(
  runEvent: ConversationRunEvent,
  get: () => TaskState,
  set: (partial: Partial<TaskState>) => void,
): boolean {
  const currentRun = get().activeRun;
  if (!currentRun || currentRun.runId !== runEvent.runId) return false;
  if (runEvent.sequence <= currentRun.lastEventSequence) return false;

  const status = resolveRunStatus(runEvent, currentRun.status);
  const terminal =
    status === "COMPLETED" ||
    status === "FAILED" ||
    status === "CANCELLED";
  set({
    activeRun: {
      ...currentRun,
      status,
      lastEventSequence: Math.max(
        currentRun.lastEventSequence,
        runEvent.sequence,
      ),
      updatedAt: runEvent.occurredAt,
    },
    isPausing: status === "PAUSING",
    isChatting: terminal || status === "PAUSED" ? false : get().isChatting,
    chatWasStopped: status === "PAUSED",
  });
  return true;
}

function resolveRunStatus(
  runEvent: ConversationRunEvent,
  currentStatus: ConversationRunSnapshot["status"],
): ConversationRunSnapshot["status"] {
  const metadataStatus = runEvent.event.metadata?.runStatus;
  if (isConversationRunStatus(metadataStatus)) return metadataStatus;
  if (runEvent.event.type === "tool_approval_requested") {
    return "WAITING_APPROVAL";
  }
  if (runEvent.event.type === "tool_approval_resolved") return "RUNNING";
  if (runEvent.event.type === "completed") return "COMPLETED";
  if (runEvent.event.type === "failed") return "FAILED";
  if (runEvent.event.type === "paused") return "PAUSED";
  return currentStatus;
}

function isConversationRunStatus(
  value: unknown,
): value is ConversationRunSnapshot["status"] {
  return (
    value === "QUEUED" ||
    value === "RUNNING" ||
    value === "PAUSING" ||
    value === "PAUSED" ||
    value === "WAITING_APPROVAL" ||
    value === "COMPLETED" ||
    value === "FAILED" ||
    value === "CANCELLED"
  );
}

async function waitForActiveRun(
  modelApi: LumoraModelApi,
  taskId: string,
): Promise<ConversationRunSnapshot | undefined> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const run = await modelApi.getActiveRun(taskId);
    if (run && isPausableRun(run)) return run;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  return undefined;
}

async function followNextRun(
  modelApi: LumoraModelApi,
  taskId: string,
  get: () => TaskState,
  set: (partial: Partial<TaskState>) => void,
  finishedRunId?: string,
): Promise<void> {
  const delays = [40, 80, 140, 240, 360];
  for (const delay of delays) {
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    if (get().activeTask?.taskId !== taskId) return;
    const [activeRun, pendingInputs] = await Promise.all([
      modelApi.getActiveRun(taskId),
      modelApi.listInputs(taskId),
    ]);
    if (get().activeTask?.taskId !== taskId) return;
    set({ pendingInputs });
    if (
      activeRun &&
      isPausableRun(activeRun) &&
      activeRun.runId !== finishedRunId &&
      activeRun.runId !== get().activeRun?.runId
    ) {
      await get().openTask(taskId);
      return;
    }
    if (!activeRun && pendingInputs.length === 0) return;
  }
}

function isPausableRun(run: ConversationRunSnapshot): boolean {
  return (
    run.status === "QUEUED" ||
    run.status === "RUNNING" ||
    run.status === "WAITING_APPROVAL"
  );
}

function reconcilePausedMessages(
  liveMessages: ChatMessage[],
  persistedMessages: ChatMessage[],
): ChatMessage[] {
  const liveAssistant = liveMessages.at(-1);
  if (
    persistedMessages.at(-1)?.role === "assistant" ||
    liveAssistant?.role !== "assistant"
  ) {
    return reconcilePersistedMessages(liveMessages, persistedMessages);
  }
  return [...persistedMessages, liveAssistant];
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
