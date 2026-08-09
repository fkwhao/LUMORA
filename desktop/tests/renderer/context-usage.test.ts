import { describe, expect, it } from "vitest";

import { resolveContextUsage } from "../../src/renderer/features/tasks/state/context-usage";

describe("context usage", () => {
  it("does not reuse a previous turn's tool-heavy measurement for a new run", () => {
    const usage = resolveContextUsage([
      {
        role: "assistant",
        content: "上一轮完成",
        activeContextTokens: 26_280,
      },
      { role: "user", content: "继续" },
      { role: "assistant", content: "" },
    ]);

    expect(usage.estimated).toBe(true);
    expect(usage.tokens).toBeLessThan(26_280);
  });

  it("uses the newest assistant measurement as soon as the provider reports it", () => {
    const usage = resolveContextUsage([
      {
        role: "assistant",
        content: "上一轮完成",
        activeContextTokens: 26_280,
      },
      { role: "user", content: "继续" },
      {
        role: "assistant",
        content: "正在处理",
        activeContextTokens: 10_822,
      },
    ]);

    expect(usage).toEqual({ tokens: 10_822, estimated: false });
  });
});
