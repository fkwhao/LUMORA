import type {
  ChatStreamEvent,
  LumoraModelApi,
} from "../../../../shared/model-contract";
import { workLogItemFromEvent } from "../../../../shared/work-log";
import { reconcilePersistedMessages } from "./chat-message-reconciliation";
import type { TaskState } from "./task-store";

export function applyChatEvent(
  event: ChatStreamEvent,
  taskId: string,
  modelApi: LumoraModelApi,
  get: () => TaskState,
  set: (partial: Partial<TaskState>) => void,
  resolve: () => void,
): void {
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
      activeContextTokens:
        event.activeContextTokens || last.activeContextTokens,
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
  if (event.type === "reasoning_delta") return;
  if (event.type === "usage") {
    const messages = [...get().messages];
    const last = messages.at(-1);
    if (last?.role === "assistant") {
      messages[messages.length - 1] = {
        ...last,
        usage: event.usage,
        model: event.model || last.model,
        activeContextTokens:
          event.activeContextTokens || last.activeContextTokens,
      };
      set({ messages });
    }
    return;
  }
  const chatStartedAt = get().chatStartedAt;
  const lastChatDurationMs = chatStartedAt
    ? Date.now() - chatStartedAt
    : undefined;
  if (event.type === "completed") {
    set({
      isChatting: false,
      chatWasStopped: false,
      chatStartedAt: undefined,
      lastChatDurationMs,
      pendingToolApproval: undefined,
      isDecidingToolApproval: false,
    });
    void modelApi
      .listMessages(taskId)
      .then((persistedMessages) =>
        set({
          messages: reconcilePersistedMessages(
            get().messages,
            persistedMessages,
          ),
        }),
      )
      .catch(() => undefined)
      .finally(resolve);
    return;
  }
  if (event.type === "failed") {
    void modelApi
      .listMessages(taskId)
      .then((persistedMessages) => {
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
          messages,
          isChatting: false,
          chatWasStopped: false,
          chatStartedAt: undefined,
          lastChatDurationMs,
          chatError: event.errorMessage || "模型流式响应失败",
          pendingToolApproval: undefined,
          isDecidingToolApproval: false,
        });
      })
      .catch(() =>
        set({
          isChatting: false,
          chatWasStopped: false,
          chatStartedAt: undefined,
          lastChatDurationMs,
          chatError: event.errorMessage || "模型流式响应失败",
          pendingToolApproval: undefined,
          isDecidingToolApproval: false,
        }),
      )
      .finally(resolve);
  }
}
