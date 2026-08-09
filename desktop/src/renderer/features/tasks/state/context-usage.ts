import type { ChatMessage } from "../../../../shared/model-contract";

export interface ContextUsageSnapshot {
  tokens: number;
  estimated: boolean;
}

/**
 * Use only the newest assistant message's measurement. During a new run the
 * placeholder has no provider usage yet, so reusing an older turn's larger
 * tool context would leave a stale value visible until completion.
 */
export function resolveContextUsage(
  messages: ChatMessage[],
): ContextUsageSnapshot {
  const latestAssistant = [...messages].reverse().find(
    (message) => message.role === "assistant",
  );
  const reportedTokens = latestAssistant?.activeContextTokens;
  if (reportedTokens !== undefined && reportedTokens > 0) {
    return { tokens: reportedTokens, estimated: false };
  }
  return {
    tokens: estimateConversationTokens(messages),
    estimated: true,
  };
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
