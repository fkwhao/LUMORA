import { describe, expect, it } from "vitest";

import {
  aggregateMessageUsage,
  cacheHitRate,
  countModelRequests,
  normalizeTokenUsage,
} from "../../src/renderer/features/tasks/state/token-usage";

describe("token usage", () => {
  it("keeps old three-field usage records compatible", () => {
    expect(normalizeTokenUsage({
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
    })).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 150,
      cacheMetricsAvailable: false,
    });
  });

  it("aggregates assistant usage and calculates cache hit rate", () => {
    const usage = aggregateMessageUsage([
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "hello",
        usage: {
          promptTokens: 100,
          completionTokens: 30,
          totalTokens: 130,
          inputTokens: 40,
          outputTokens: 20,
          reasoningTokens: 10,
          cacheReadTokens: 60,
          cacheWriteTokens: 0,
          cacheMetricsAvailable: true,
        },
      },
    ]);

    expect(usage.totalTokens).toBe(130);
    expect(cacheHitRate(usage)).toBe(0.6);
  });

  it("includes inactive and failed durable requests exactly once", () => {
    const threadMessages = [
      { messageId: "user-1", role: "user" as const, content: "hi" },
      {
        messageId: "assistant-active",
        role: "assistant" as const,
        content: "current",
        usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10 },
      },
      {
        messageId: "user-failed",
        role: "user" as const,
        content: "retry",
      },
      {
        messageId: "assistant-old-branch",
        role: "assistant" as const,
        content: "old",
        activePath: false,
        usage: { promptTokens: 16, completionTokens: 4, totalTokens: 20 },
      },
      {
        messageId: "failed-usage",
        role: "assistant" as const,
        content: "",
        activePath: false,
        usageRecordOnly: true,
        parentMessageId: "user-failed",
        usage: { promptTokens: 24, completionTokens: 6, totalTokens: 30 },
      },
    ];
    const messages = [
      ...threadMessages.slice(0, 3).map((message) => ({
        ...message,
        threadMessages,
      })),
      {
        runtimeId: "failed-live-assistant",
        role: "assistant" as const,
        content: "partial",
        usage: { promptTokens: 24, completionTokens: 6, totalTokens: 30 },
      },
    ];

    expect(aggregateMessageUsage(messages).totalTokens).toBe(60);
    expect(countModelRequests(messages)).toBe(3);
  });

  it("does not let an incomplete breakdown reduce provider totals", () => {
    expect(normalizeTokenUsage({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 100,
      inputTokens: 40,
      outputTokens: 10,
    }).totalTokens).toBe(100);
  });
});
