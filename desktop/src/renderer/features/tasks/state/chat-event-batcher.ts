import type { ChatStreamEvent } from "../../../../shared/model-contract";

const DEFAULT_FLUSH_INTERVAL_MS = 40;

export interface ChatEventBatcher {
  push(event: ChatStreamEvent): void;
  flush(): void;
  cancel(): void;
}

export function createChatEventBatcher(
  dispatch: (event: ChatStreamEvent) => void,
  flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
): ChatEventBatcher {
  let pendingTextEvent: ChatStreamEvent | undefined;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    if (flushTimer === undefined) return;
    clearTimeout(flushTimer);
    flushTimer = undefined;
  };

  const flush = () => {
    clearTimer();
    if (!pendingTextEvent) return;
    const event = pendingTextEvent;
    pendingTextEvent = undefined;
    dispatch(event);
  };

  return {
    push(event) {
      if (event.type === "reasoning_delta") return;
      if (event.type !== "text_delta") {
        flush();
        dispatch(event);
        return;
      }
      pendingTextEvent = pendingTextEvent
        ? {
            ...event,
            delta: pendingTextEvent.delta + event.delta,
          }
        : event;
      if (flushTimer !== undefined) return;
      flushTimer = setTimeout(flush, flushIntervalMs);
    },
    flush,
    cancel() {
      clearTimer();
      pendingTextEvent = undefined;
    },
  };
}
