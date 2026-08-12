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
    event.type === "approval_review_started" ||
    event.type === "approval_review_completed"
  ) {
    const decision = event.metadata?.approvalReviewDecision;
    return {
      itemId: event.itemId || event.toolCallId || createId(),
      kind: "approval",
      status:
        event.type === "approval_review_started"
          ? "running"
          : decision === "deny" || decision === "require_human"
            ? "failed"
            : "completed",
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      title: event.title,
      arguments: event.arguments,
      output: event.output || event.reason,
      durationMs: event.durationMs,
      metadata: event.metadata,
    };
  }
  if (
    event.type === "web_search_started" ||
    event.type === "web_search_progress" ||
    event.type === "web_search_completed" ||
    event.type === "web_search_failed"
  ) {
    return {
      itemId: event.itemId || event.toolCallId || createId(),
      kind: "search",
      status:
        event.type === "web_search_failed"
          ? "failed"
          : event.type === "web_search_completed"
            ? "completed"
            : "running",
      toolCallId: event.toolCallId,
      toolName: event.toolName || "web_search",
      title: event.title || "网络搜索",
      arguments: event.arguments,
      content: event.delta,
      output: event.output,
      errorMessage: event.errorMessage,
      metadata: event.metadata,
    };
  }
  if (
    event.type === "context_compaction_started" ||
    event.type === "context_compaction_progress" ||
    event.type === "context_compacted" ||
    event.type === "context_compaction_failed"
  ) {
    return {
      itemId: event.itemId || "context-compact",
      kind: "context",
      status:
        event.type === "context_compaction_failed"
          ? "failed"
          : event.type === "context_compacted"
            ? "completed"
            : "running",
      title:
        event.type === "context_compaction_failed"
          ? "上下文压缩失败"
          : event.type === "context_compacted"
            ? "已压缩上下文"
            : "正在压缩上下文",
      content: event.delta,
      errorMessage: event.errorMessage,
      metadata: event.metadata,
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
