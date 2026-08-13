import type { ChatMessage } from "../../../../shared/model-contract";
import { aggregateMessageUsage } from "./token-usage";

export interface ContextUsageSnapshot {
  tokens: number;
  estimated: boolean;
}

export interface ContextBreakdownPart {
  kind: "user" | "assistant" | "tools" | "other";
  label: string;
  percent: number;
}

/** Use the conversation's accumulated provider usage as the displayed total. */
export function resolveContextUsage(
  messages: ChatMessage[],
): ContextUsageSnapshot {
  const accumulatedTokens = aggregateMessageUsage(messages).totalTokens;
  if (accumulatedTokens > 0) {
    return { tokens: accumulatedTokens, estimated: false };
  }
  return {
    tokens: estimateConversationTokens(messages),
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
    (total, message) => total + 6 + estimateTextTokens(message.content),
    0,
  );
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
