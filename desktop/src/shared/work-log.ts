import type { ChatStreamEvent, WorkLogItem } from "./model-contract";

export function workLogItemFromEvent(
  event: ChatStreamEvent,
  createId: () => string = () => globalThis.crypto.randomUUID(),
): WorkLogItem | undefined {
  if (event.type === "progress_message") {
    return {
      itemId: event.itemId || createId(),
      kind: "progress",
      status: "completed",
      content: event.delta,
    };
  }
  if (
    event.type !== "tool_started" &&
    event.type !== "tool_completed" &&
    event.type !== "tool_failed"
  ) {
    return undefined;
  }
  return {
    itemId: event.itemId || event.toolCallId || createId(),
    kind: "tool",
    status:
      event.type === "tool_started"
        ? "running"
        : event.type === "tool_completed"
          ? "completed"
          : "failed",
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    title: event.title,
    arguments: event.arguments,
    output: event.output,
    durationMs: event.durationMs,
    exitCode: event.exitCode,
    errorMessage: event.errorMessage,
    metadata: event.metadata,
  };
}

export function workLogFromEvents(events: ChatStreamEvent[]): WorkLogItem[] {
  return events
    .map((event) => workLogItemFromEvent(event))
    .filter((item): item is WorkLogItem => item !== undefined);
}
