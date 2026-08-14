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
    if (
      liveById
      && index < mutableTailStart
      && sameThreadMessages(liveById.threadMessages, persisted.threadMessages)
    ) return liveById;
    const liveAtIndex = liveMessages[index];
    const live =
      liveById ??
      (liveAtIndex?.role === persisted.role ? liveAtIndex : undefined);
    const threadMessages = mergeThreadMessages(
      live?.threadMessages,
      persisted.threadMessages,
    );
    const merged = live?.runtimeId
      ? { ...persisted, runtimeId: live.runtimeId }
      : persisted;
    return threadMessages === persisted.threadMessages
      ? merged
      : { ...merged, threadMessages };
  });
}

function mergeThreadMessages(
  liveMessages: ChatMessage[] | undefined,
  persistedMessages: ChatMessage[] | undefined,
): ChatMessage[] | undefined {
  if (!liveMessages?.length) return persistedMessages;
  if (!persistedMessages?.length) return liveMessages;
  const liveById = new Map(
    liveMessages.flatMap((message) =>
      message.messageId ? [[message.messageId, message] as const] : [],
    ),
  );
  const persistedIds = new Set(
    persistedMessages.flatMap((message) =>
      message.messageId ? [message.messageId] : [],
    ),
  );
  return [
    ...persistedMessages.map((persisted, index) => {
      const live = persisted.messageId
        ? liveById.get(persisted.messageId)
        : liveMessages[index];
      return live?.runtimeId
        ? { ...persisted, runtimeId: live.runtimeId }
        : persisted;
    }),
    ...liveMessages.filter(
      (message) => !message.messageId || !persistedIds.has(message.messageId),
    ),
  ];
}

function sameThreadMessages(
  left: ChatMessage[] | undefined,
  right: ChatMessage[] | undefined,
): boolean {
  if (left === right) return true;
  if ((left?.length ?? 0) !== (right?.length ?? 0)) return false;
  return (left ?? []).every(
    (message, index) =>
      message.messageId !== undefined
      && message.messageId === right?.[index]?.messageId,
  );
}
