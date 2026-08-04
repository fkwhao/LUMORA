import type {
  ChatStreamEvent,
  LumoraModelApi,
} from "../../../shared/model-contract";
import { workLogItemFromEvent } from "../../../shared/work-log";
import type { TaskState } from "./task-store";

export function applyChatEvent(
  event: ChatStreamEvent,
  taskId: string,
  modelApi: LumoraModelApi,
  get: () => TaskState,
  set: (partial: Partial<TaskState>) => void,
  resolve: () => void,
): void {
  if (
    event.type === "progress_message" ||
    event.type === "tool_started" ||
    event.type === "tool_completed" ||
    event.type === "tool_failed"
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
      model: event.model || last.model,
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
  if (event.type === "reasoning_delta") return;
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
  const chatStartedAt = get().chatStartedAt;
  const lastChatDurationMs = chatStartedAt
    ? Date.now() - chatStartedAt
    : undefined;
  if (event.type === "completed") {
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
    void modelApi
      .listMessages(taskId)
      .then((persistedMessages) => {
        const liveAssistant = get().messages.at(-1);
        const messages =
          persistedMessages.at(-1)?.role === "assistant" ||
          liveAssistant?.role !== "assistant"
            ? persistedMessages
            : [...persistedMessages, liveAssistant];
        set({
          messages,
          isChatting: false,
          chatWasStopped: false,
          chatStartedAt: undefined,
          lastChatDurationMs,
          chatError: event.errorMessage || "模型流式响应失败",
        });
      })
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
