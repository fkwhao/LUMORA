import type {
  ChatMessage,
  TokenUsage,
} from "../../../../shared/model-contract";

export interface NormalizedTokenUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  cacheMetricsAvailable: boolean;
}

export function normalizeTokenUsage(
  usage?: TokenUsage,
): NormalizedTokenUsage {
  if (!usage) return emptyTokenUsage();
  const cacheReadTokens = positive(usage.cacheReadTokens);
  const cacheWriteTokens = positive(usage.cacheWriteTokens);
  const reasoningTokens = positive(usage.reasoningTokens);
  const inputTokens = usage.inputTokens === undefined
    ? Math.max(0, positive(usage.promptTokens) - cacheReadTokens - cacheWriteTokens)
    : positive(usage.inputTokens);
  const outputTokens = usage.outputTokens === undefined
    ? Math.max(0, positive(usage.completionTokens) - reasoningTokens)
    : positive(usage.outputTokens);
  const detailedTotal = inputTokens + outputTokens + reasoningTokens
    + cacheReadTokens + cacheWriteTokens;
  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: Math.max(detailedTotal, positive(usage.totalTokens)),
    cacheMetricsAvailable: usage.cacheMetricsAvailable === true,
  };
}

export function aggregateMessageUsage(
  messages: ChatMessage[],
): NormalizedTokenUsage {
  return durableMessages(messages)
    .filter((message) => message.role === "assistant")
    .map((message) => normalizeTokenUsage(message.usage))
    .reduce(addTokenUsage, emptyTokenUsage());
}

export function countModelRequests(messages: ChatMessage[]): number {
  return durableMessages(messages).filter(
    (message) =>
      message.role === "assistant"
      && normalizeTokenUsage(message.usage).totalTokens > 0,
  ).length;
}

export function cacheHitRate(
  usage: Pick<
    NormalizedTokenUsage,
    "inputTokens" | "cacheReadTokens" | "cacheWriteTokens" | "cacheMetricsAvailable"
  >,
): number | undefined {
  if (!usage.cacheMetricsAvailable) return undefined;
  const totalInput = usage.inputTokens + usage.cacheReadTokens
    + usage.cacheWriteTokens;
  return totalInput > 0 ? usage.cacheReadTokens / totalInput : 0;
}

function addTokenUsage(
  left: NormalizedTokenUsage,
  right: NormalizedTokenUsage,
): NormalizedTokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningTokens: left.reasoningTokens + right.reasoningTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    cacheMetricsAvailable:
      left.cacheMetricsAvailable || right.cacheMetricsAvailable,
  };
}

function emptyTokenUsage(): NormalizedTokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    cacheMetricsAvailable: false,
  };
}

function durableMessages(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  const seenIds = new Set<string>();
  const seenObjects = new Set<ChatMessage>();
  const failedUsageParents = new Set(
    messages.flatMap((message) =>
      (message.threadMessages ?? []).flatMap((candidate) =>
        candidate.usageRecordOnly === true && candidate.parentMessageId
          ? [candidate.parentMessageId]
          : [],
      ),
    ),
  );
  const visit = (message: ChatMessage) => {
    const id = message.messageId ?? message.runtimeId;
    if (id ? seenIds.has(id) : seenObjects.has(message)) return;
    if (id) seenIds.add(id);
    seenObjects.add(message);
    result.push(message);
  };
  messages.forEach((message, index) => {
    const previous = messages[index - 1];
    const duplicatesFailedRecord =
      message.role === "assistant"
      && !message.messageId
      && previous?.role === "user"
      && Boolean(previous.messageId)
      && failedUsageParents.has(previous.messageId!);
    if (!duplicatesFailedRecord) visit(message);
    message.threadMessages?.forEach(visit);
  });
  return result;
}

function positive(value?: number): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}
