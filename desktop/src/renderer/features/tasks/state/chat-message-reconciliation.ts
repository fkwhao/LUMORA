import type { ChatMessage } from "../../../../shared/model-contract";

/**
 * Merge server-assigned IDs and metadata into a streamed conversation without
 * changing the renderer identity of optimistic messages.
 */
export function reconcilePersistedMessages(
  liveMessages: ChatMessage[],
  persistedMessages: ChatMessage[],
): ChatMessage[] {
  const liveByPersistedId = new Map(
    liveMessages.flatMap((message) =>
      message.messageId ? [[message.messageId, message] as const] : [],
    ),
  );
  const mutableTailStart = Math.max(0, persistedMessages.length - 2);
  return persistedMessages.map((persisted, index) => {
    const liveById = persisted.messageId
      ? liveByPersistedId.get(persisted.messageId)
      : undefined;
    if (liveById && index < mutableTailStart) return liveById;
    const liveAtIndex = liveMessages[index];
    const live =
      liveById ??
      (liveAtIndex?.role === persisted.role ? liveAtIndex : undefined);
    return live?.runtimeId
      ? { ...persisted, runtimeId: live.runtimeId }
      : persisted;
  });
}
