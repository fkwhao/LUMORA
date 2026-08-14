import type { ChatMessage } from "../../../../shared/model-contract";
import { normalizeTokenUsage } from "./token-usage";

export interface ContextUsageSnapshot {
  tokens: number;
  estimated: boolean;
}

export interface ContextBreakdownPart {
  kind: "user" | "assistant" | "tools" | "other";
  label: string;
  percent: number;
}

/**
 * Project the next request's prompt pressure from the newest provider anchor.
 *
 * Provider usage describes the prompt that produced an assistant message, so
 * that assistant message and everything after it are estimated as additions to
 * the next prompt. This intentionally stays separate from durable cumulative
 * billing totals, which repeatedly include earlier conversation history.
 */
export function resolveContextUsage(
  messages: ChatMessage[],
): ContextUsageSnapshot {
  const projectionMessages = contextProjectionMessages(messages);
  for (let index = projectionMessages.length - 1; index >= 0; index -= 1) {
    const anchorTokens = providerPromptAnchor(projectionMessages[index]);
    if (anchorTokens > 0) {
      return {
        tokens: anchorTokens
          + estimateConversationTokens(projectionMessages.slice(index)),
        estimated: true,
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
  });
  messages.forEach((message) => {
    message.threadMessages
      ?.filter((candidate) => candidate.usageRecordOnly === true)
      .forEach(visit);
  });
  return result.sort(
    (left, right) =>
      (left.sequence ?? Number.MAX_SAFE_INTEGER)
      - (right.sequence ?? Number.MAX_SAFE_INTEGER),
  );
}

function providerPromptAnchor(message: ChatMessage | undefined): number {
  if (!message || message.role !== "assistant") return 0;
  const activeContextTokens = positive(message.activeContextTokens);
  if (activeContextTokens > 0) return activeContextTokens;
  const usage = normalizeTokenUsage(message.usage);
  return usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
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
