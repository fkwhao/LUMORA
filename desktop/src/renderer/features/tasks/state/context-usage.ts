import type { ChatMessage, ChatStreamEvent } from "../../../../shared/model-contract";

export interface ContextUsageSnapshot {
  tokens: number;
  estimated: boolean;
}

/** Renderer-only state; never used for billing or the Agent's compaction policy. */
export interface ContextUsageState {
  snapshot: ContextUsageSnapshot;
  awaitingModelUsage: boolean;
  updatedDuringRun: boolean;
}

export function createContextUsageState(
  messages: ChatMessage[],
  snapshot = resolveContextUsage(messages),
): ContextUsageState {
  return { snapshot, awaitingModelUsage: false, updatedDuringRun: false };
}

export function beginContextUsage(
  state: ContextUsageState,
  messages: ChatMessage[],
): ContextUsageState {
  return createContextUsageState(
    messages,
    state.snapshot.tokens > 0 ? state.snapshot : undefined,
  );
}

/**
 * Explicit samples are emitted only for settled main requests and compaction.
 * Protocol boundaries support older Agent events without accepting temporary
 * tool estimates or cumulative billing snapshots.
 */
export function reduceContextUsage(
  state: ContextUsageState,
  event: ChatStreamEvent,
): ContextUsageState {
  if (event.type === "protocol_message") {
    const message = event.metadata?.message;
    if (!message || typeof message !== "object" || !("role" in message)) {
      return state;
    }
    const awaitingModelUsage = message.role === "assistant";
    return awaitingModelUsage === state.awaitingModelUsage
      ? state
      : { ...state, awaitingModelUsage };
  }
  const compacted = event.type === "context_compacted";
  if (!compacted && (
    event.type !== "usage" || event.metadata?.usageProvisional === true
  )) return state;

  if (event.metadata && "contextUsage" in event.metadata) {
    const snapshot = parseContextSnapshot(event.metadata.contextUsage);
    return snapshot
      ? settledContextUsage(snapshot)
      : { ...state, awaitingModelUsage: false };
  }
  if (!compacted && !state.awaitingModelUsage) return state;
  const tokens = positive(event.activeContextTokens)
    || (compacted ? positiveNumber(event.metadata?.afterTokens) : 0);
  return tokens > 0
    ? settledContextUsage({ tokens, estimated: true })
    : { ...state, awaitingModelUsage: false };
}

function parseContextSnapshot(value: unknown): ContextUsageSnapshot | undefined {
  if (!value || typeof value !== "object" || !("tokens" in value)) return;
  const tokens = value.tokens;
  if (typeof tokens !== "number" || !Number.isInteger(tokens)
    || tokens <= 0 || tokens > 2_147_483_647) return;
  return {
    tokens,
    estimated: !("estimated" in value) || value.estimated !== false,
  };
}

/**
 * New Core histories persist the same sample and accuracy flag as live events.
 * This also picks up safe settlements received by Core after the UI pauses.
 * Legacy histories may still contain tool estimates, so retain live samples
 * when their accuracy/provenance is unavailable.
 */
export function reconcileContextUsage(
  state: ContextUsageState,
  messages: ChatMessage[],
): ContextUsageState {
  const recorded = contextProjectionMessages(messages).reverse().find(
    (message) => providerPromptAnchor(message) > 0,
  );
  if (recorded && typeof recorded.activeContextEstimated === "boolean") {
    const snapshot = {
      tokens: recorded.activeContextTokens!,
      estimated: recorded.activeContextEstimated,
    };
    return snapshot.tokens === state.snapshot.tokens
      && snapshot.estimated === state.snapshot.estimated
      ? { ...state, awaitingModelUsage: false }
      : settledContextUsage(snapshot);
  }
  return state.updatedDuringRun
    ? { ...state, awaitingModelUsage: false }
    : createContextUsageState(messages);
}

function settledContextUsage(snapshot: ContextUsageSnapshot): ContextUsageState {
  return {
    snapshot,
    awaitingModelUsage: false,
    updatedDuringRun: true,
  };
}

function positiveNumber(value: unknown): number {
  return typeof value === "number" ? positive(value) : 0;
}

export interface ContextBreakdownPart {
  kind: "user" | "assistant" | "tools" | "other";
  label: string;
  percent: number;
}

/**
 * Restore the latest recorded context sample, not a projection of the next
 * request. Draft assistant text can move into the work log during tool calls;
 * adding it to the sample would make the indicator grow and shrink mid-turn.
 * Cumulative TokenUsage is billing data and must never be a context fallback.
 * Legacy samples without an accuracy flag remain labelled "约".
 */
export function resolveContextUsage(
  messages: ChatMessage[],
): ContextUsageSnapshot {
  const projectionMessages = contextProjectionMessages(messages);
  for (let index = projectionMessages.length - 1; index >= 0; index -= 1) {
    const anchorTokens = providerPromptAnchor(projectionMessages[index]);
    if (anchorTokens > 0) {
      return {
        tokens: anchorTokens,
        estimated: projectionMessages[index]?.activeContextEstimated !== false,
      };
    }
  }
  return {
    tokens: estimateConversationTokens(projectionMessages),
    estimated: true,
  };
}

/**
 * Breakdown ratios describe the locally persisted conversation contents.
 * They deliberately do not use accumulated provider usage as the denominator:
 * that value repeatedly counts history across requests and is not attributable
 * to individual message roles.
 */
export function resolveContextBreakdown(
  messages: ChatMessage[],
): ContextBreakdownPart[] {
  const user = messages
    .filter((message) => message.role === "user")
    .reduce((total, message) => total + estimateTextTokens(message.content), 0);
  const assistant = messages
    .filter((message) => message.role === "assistant")
    .reduce((total, message) => total + estimateTextTokens(message.content), 0);
  const tools = messages.reduce(
    (total, message) => total + (
      message.workLog?.length
        ? estimateTextTokens(JSON.stringify(message.workLog))
        : 0
    ),
    0,
  );
  const other = messages.length * 6;
  const total = user + assistant + tools + other;
  const percent = (tokens: number) => total > 0 ? (tokens / total) * 100 : 0;
  return [
    { kind: "user", label: "用户", percent: percent(user) },
    { kind: "assistant", label: "助手", percent: percent(assistant) },
    { kind: "tools", label: "工具调用", percent: percent(tools) },
    { kind: "other", label: "其他", percent: percent(other) },
  ];
}

function estimateConversationTokens(messages: ChatMessage[]): number {
  return messages.reduce(
    (total, message) => total + estimateMessageTokens(message),
    0,
  );
}

function contextProjectionMessages(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  const seenIds = new Set<string>();
  const seenObjects = new Set<ChatMessage>();
  const failedUsageParents = new Set(
    messages.flatMap((message) =>
      (message.threadMessages ?? []).flatMap((candidate) =>
        isFailedProviderUsageRecord(candidate) && candidate.parentMessageId
          ? [candidate.parentMessageId]
          : [],
      ),
    ),
  );
  const visit = (message: ChatMessage) => {
    if (message.usageRecordOnly && !isFailedProviderUsageRecord(message)) return;
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
  });
  messages.forEach((message) => {
    message.threadMessages
      ?.filter(isFailedProviderUsageRecord)
      .forEach(visit);
  });
  return result.sort(
    (left, right) =>
      (left.sequence ?? Number.MAX_SAFE_INTEGER)
      - (right.sequence ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * Failed root requests and supplemental memory calls are both persisted as
 * usage-only messages. Core records elapsed time for a failed root request,
 * while supplemental memory usage is deliberately stored with zero duration.
 * Only the former describes the main conversation's provider context.
 */
function isFailedProviderUsageRecord(message: ChatMessage): boolean {
  return message.usageRecordOnly === true && positive(message.durationMs) > 0;
}

function providerPromptAnchor(message: ChatMessage | undefined): number {
  if (!message || message.role !== "assistant") return 0;
  return positive(message.activeContextTokens);
}

function estimateMessageTokens(message: ChatMessage): number {
  if (!message.content) return 0;
  return 6 + estimateTextTokens(message.content);
}

function estimateTextTokens(content: string): number {
  let asciiCharacters = 0;
  let nonAsciiCharacters = 0;
  for (const character of content) {
    if (character.codePointAt(0)! <= 0x7f) {
      asciiCharacters += 1;
    } else {
      nonAsciiCharacters += 1;
    }
  }
  return nonAsciiCharacters + Math.ceil(asciiCharacters / 4);
}

function positive(value?: number): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}
