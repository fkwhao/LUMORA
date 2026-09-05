import type {
  ChatMessage,
  ChatStreamEvent,
  LumoraModelApi,
} from "../../../../shared/model-contract";
import { workLogItemFromEvent } from "../../../../shared/work-log";
import { reconcilePersistedMessages } from "./chat-message-reconciliation";
import { reconcileContextUsage, reduceContextUsage } from "./context-usage";
import type { TaskState } from "./task-store";

const supplementalUsageRefreshDelaysMs = [5_000, 15_000, 30_000, 60_000, 120_000];
interface SupplementalUsageRefresh {
  timer?: ReturnType<typeof setTimeout>;
}

const supplementalUsageRefreshes = new Map<
  string,
  SupplementalUsageRefresh
>();

export function cancelSupplementalUsageRefresh(taskId: string): void {
  const refresh = supplementalUsageRefreshes.get(taskId);
  if (refresh?.timer) clearTimeout(refresh.timer);
  supplementalUsageRefreshes.delete(taskId);
}

export function applyChatEvent(
  event: ChatStreamEvent,
  taskId: string,
  modelApi: LumoraModelApi,
  get: () => TaskState,
  set: (partial: Partial<TaskState>) => void,
  resolve: () => void,
): void {
  if (get().activeTask?.taskId !== taskId) return;
  if (
    get().isPausing &&
    event.type !== "paused" &&
    event.type !== "completed" &&
    event.type !== "failed"
  ) {
    // The user-facing answer freezes at click time. Core continues consuming
    // and persisting safe-settlement events; the terminal refresh below then
    // reconciles the complete resumable state.
    return;
  }
  const contextUsage = reduceContextUsage(get().contextUsage, event);
  if (contextUsage !== get().contextUsage) set({ contextUsage });
  const contextMessageFields = contextUsage.updatedDuringRun ? {
    activeContextTokens: contextUsage.snapshot.tokens,
    activeContextEstimated: contextUsage.snapshot.estimated,
  } : {};
  if (event.type === "steer_claimed") {
    if (event.itemId && event.delta.trim()) {
      set({
        pendingInputs: get().pendingInputs.filter(
          (input) => input.inputId !== event.itemId,
        ),
        messages: insertSteerUserMessage(
          get().messages,
          event.itemId,
          event.delta,
        ),
      });
    }
    return;
  }
  if (event.type === "tool_approval_requested") {
    if (!event.approvalId || !event.itemId || !event.toolName) return;
    set({
      pendingToolApproval: {
        approvalId: event.approvalId,
        itemId: event.itemId,
        toolCallId: event.toolCallId ?? "",
        toolName: event.toolName,
        title: event.title || event.toolName,
        arguments: event.arguments ?? {},
        permissionLayer: event.permissionLayer ?? "mode",
        reason: event.reason ?? "当前权限模式需要用户确认",
        riskLevel: event.riskLevel ?? "MEDIUM",
        reversible: event.reversible,
      },
      isDecidingToolApproval: false,
    });
    return;
  }
  if (event.type === "tool_approval_resolved") {
    if (
      !event.approvalId ||
      get().pendingToolApproval?.approvalId === event.approvalId
    ) {
      set({
        pendingToolApproval: undefined,
        isDecidingToolApproval: false,
      });
    }
    return;
  }
  if (
    event.type === "progress_message" ||
    event.type === "agent_started" ||
    event.type === "agent_event" ||
    event.type === "agent_completed" ||
    event.type === "agent_failed" ||
    event.type === "agent_session_created" ||
    event.type === "agent_inbox_enqueued" ||
    event.type === "agent_activation_started" ||
    event.type === "agent_activation_interrupted" ||
    event.type === "agent_reported" ||
    event.type === "agent_checkpointed" ||
    event.type === "agent_peer_message_queued" ||
    event.type === "agent_peer_message_delivered" ||
    event.type === "agent_peer_message_consumed" ||
    event.type === "tool_started" ||
    event.type === "tool_completed" ||
    event.type === "tool_failed" ||
    event.type === "approval_review_started" ||
    event.type === "approval_review_completed" ||
    event.type === "context_compaction_started" ||
    event.type === "context_compaction_progress" ||
    event.type === "context_compacted" ||
    event.type === "context_compaction_failed" ||
    event.type === "web_search_started" ||
    event.type === "web_search_progress" ||
    event.type === "web_search_completed" ||
    event.type === "web_search_failed"
  ) {
    const messages = [...get().messages];
    const last = messages.at(-1);
    if (last?.role !== "assistant") return;
    const workLog = [...(last.workLog ?? [])];
    const item = workLogItemFromEvent(event);
    if (!item) return;
    const existingIndex = workLog.findIndex(
      (current) => current.itemId === item.itemId,
    );
    if (existingIndex >= 0) workLog[existingIndex] = item;
    else workLog.push(item);
    messages[messages.length - 1] = {
      ...last,
      workLog,
      content:
        event.type === "progress_message" &&
        event.metadata?.replacesAssistantContent === true
          ? ""
          : last.content,
      model: event.model || last.model,
      ...contextMessageFields,
    };
    set({ messages });
    return;
  }
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
  if (event.type === "text_reset") {
    const messages = [...get().messages];
    const last = messages.at(-1);
    if (last?.role === "assistant") {
      messages[messages.length - 1] = {
        ...last,
        content: "",
        model: event.model || last.model,
      };
      set({ messages });
    }
    return;
  }
  if (event.type === "reasoning_delta" || event.type === "protocol_message") return;
  if (event.type === "usage") {
    const messages = [...get().messages];
    const last = messages.at(-1);
    if (last?.role === "assistant") {
      messages[messages.length - 1] = {
        ...last,
        usage: event.usage,
        model: event.model || last.model,
        ...contextMessageFields,
      };
      set({ messages });
    }
    return;
  }
  const chatStartedAt = get().chatStartedAt;
  const lastChatDurationMs = chatStartedAt
    ? Date.now() - chatStartedAt
    : undefined;
  // A task switch or a new run replaces this state object. Do not let an old
  // terminal history request overwrite that newer conversation or snapshot.
  const terminalContextUsage = get().contextUsage;
  const isCurrentSettlement = () =>
    get().activeTask?.taskId === taskId
    && get().contextUsage === terminalContextUsage;
  if (event.type === "paused") {
    const currentRun = get().activeRun;
    set({
      activeRun: currentRun
        ? { ...currentRun, status: "PAUSED", updatedAt: new Date().toISOString() }
        : currentRun,
      isChatting: false,
      isPausing: false,
      chatWasStopped: true,
      chatStartedAt: undefined,
      lastChatDurationMs,
      pendingToolApproval: undefined,
      isDecidingToolApproval: false,
    });
    void modelApi
      .listMessages(taskId)
      .then((persistedMessages) => {
        if (!isCurrentSettlement()) return;
        set({
          messages: reconcilePersistedMessages(
            get().messages,
            persistedMessages,
          ),
          contextUsage: reconcileContextUsage(
            terminalContextUsage,
            persistedMessages,
          ),
        });
      })
      .catch(() => undefined)
      .finally(resolve);
    return;
  }
  if (event.type === "completed") {
    const currentRun = get().activeRun;
    set({
      activeRun: currentRun
        ? {
            ...currentRun,
            status: "COMPLETED",
            updatedAt: new Date().toISOString(),
          }
        : currentRun,
      isChatting: false,
      isPausing: false,
      chatWasStopped: false,
      chatStartedAt: undefined,
      lastChatDurationMs,
      pendingToolApproval: undefined,
      isDecidingToolApproval: false,
    });
    void modelApi
      .listMessages(taskId)
      .then((persistedMessages) => {
        if (!isCurrentSettlement()) return;
        set({
          messages: reconcilePersistedMessages(
            get().messages,
            persistedMessages,
          ),
          contextUsage: reconcileContextUsage(
            terminalContextUsage,
            persistedMessages,
          ),
        });
        scheduleSupplementalUsageRefresh(
          taskId,
          usageRecordCount(persistedMessages),
          modelApi,
          get,
          set,
        );
      })
      .catch(() => undefined)
      .finally(resolve);
    return;
  }
  if (event.type === "failed") {
    const currentRun = get().activeRun;
    const failedRun = currentRun
      ? {
          ...currentRun,
          status: "FAILED" as const,
          errorMessage: event.errorMessage || currentRun.errorMessage,
          updatedAt: new Date().toISOString(),
        }
      : currentRun;
    void modelApi
      .listMessages(taskId)
      .then((persistedMessages) => {
        if (!isCurrentSettlement()) return;
        const liveAssistant = get().messages.at(-1);
        const messages =
          persistedMessages.at(-1)?.role === "assistant" ||
          liveAssistant?.role !== "assistant"
            ? reconcilePersistedMessages(
                get().messages,
                persistedMessages,
              )
            : [...persistedMessages, liveAssistant];
        set({
          activeRun: failedRun,
          messages,
          contextUsage: reconcileContextUsage(terminalContextUsage, messages),
          isChatting: false,
          isPausing: false,
          chatWasStopped: false,
          chatStartedAt: undefined,
          lastChatDurationMs,
          chatError: event.errorMessage || "模型流式响应失败",
          pendingToolApproval: undefined,
          isDecidingToolApproval: false,
        });
      })
      .catch(() => {
        if (!isCurrentSettlement()) return;
        set({
          activeRun: failedRun,
          isChatting: false,
          isPausing: false,
          chatWasStopped: false,
          chatStartedAt: undefined,
          lastChatDurationMs,
          chatError: event.errorMessage || "模型流式响应失败",
          pendingToolApproval: undefined,
          isDecidingToolApproval: false,
        });
      })
      .finally(resolve);
  }
}

export function insertSteerUserMessage(
  messages: ChatMessage[],
  inputId: string,
  content: string,
  beforeTrailingAssistant = true,
): ChatMessage[] {
  const normalizedContent = content.trim();
  if (!normalizedContent) return messages;
  const runtimeId = `steer-${inputId}`;
  const existingIndex = messages.findIndex(
    (message) => message.runtimeId === runtimeId,
  );
  if (existingIndex >= 0) {
    const next = [...messages];
    next[existingIndex] = {
      ...next[existingIndex]!,
      content: normalizedContent,
    };
    return next;
  }
  const next = [...messages];
  const runningAssistant = beforeTrailingAssistant
    && next.at(-1)?.role === "assistant"
    ? next.pop()
    : undefined;
  next.push({
    runtimeId,
    role: "user",
    content: normalizedContent,
    createdAt: new Date().toISOString(),
  });
  if (runningAssistant) next.push(runningAssistant);
  return next;
}

/** Refresh delayed, billed background calls such as memory extraction. */
function scheduleSupplementalUsageRefresh(
  taskId: string,
  baselineUsageRecordCount: number,
  modelApi: LumoraModelApi,
  get: () => TaskState,
  set: (partial: Partial<TaskState>) => void,
): void {
  cancelSupplementalUsageRefresh(taskId);
  const refresh: SupplementalUsageRefresh = {};
  supplementalUsageRefreshes.set(taskId, refresh);
  let attempt = 0;

  const isCurrent = () => supplementalUsageRefreshes.get(taskId) === refresh;
  const stop = () => {
    if (!isCurrent()) return;
    cancelSupplementalUsageRefresh(taskId);
  };
  const scheduleNext = () => {
    if (!isCurrent()) return;
    if (attempt >= supplementalUsageRefreshDelaysMs.length) {
      stop();
      return;
    }
    const timer = setTimeout(() => {
      if (
        !isCurrent()
        || get().activeTask?.taskId !== taskId
        || get().isChatting
        || get().chatWasStopped
        || get().activeRun?.status === "PAUSED"
      ) {
        stop();
        return;
      }
      void modelApi
        .listMessages(taskId)
        .then((persistedMessages) => {
          if (
            !isCurrent()
            || get().activeTask?.taskId !== taskId
            || get().isChatting
            || get().chatWasStopped
            || get().activeRun?.status === "PAUSED"
          ) {
            stop();
            return;
          }
          if (usageRecordCount(persistedMessages) > baselineUsageRecordCount) {
            set({
              messages: reconcilePersistedMessages(
                get().messages,
                persistedMessages,
              ),
            });
            stop();
            return;
          }
          attempt += 1;
          scheduleNext();
        })
        .catch(() => {
          if (!isCurrent()) return;
          attempt += 1;
          scheduleNext();
        });
    }, supplementalUsageRefreshDelaysMs[attempt]);
    refresh.timer = timer;
  };

  scheduleNext();
}

function usageRecordCount(messages: TaskState["messages"]): number {
  const ids = new Set<string>();
  const records = new Set<object>();
  const visit = (message: TaskState["messages"][number]) => {
    if (message.usageRecordOnly !== true) return;
    const id = message.messageId ?? message.runtimeId;
    if (id) ids.add(id);
    else records.add(message);
  };
  messages.forEach((message) => {
    visit(message);
    message.threadMessages?.forEach(visit);
  });
  return ids.size + records.size;
}
