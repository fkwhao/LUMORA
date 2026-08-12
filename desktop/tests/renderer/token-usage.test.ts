import { describe, expect, it } from "vitest";

import {
  aggregateMessageUsage,
  cacheHitRate,
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
});
