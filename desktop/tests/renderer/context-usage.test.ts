import { describe, expect, it } from "vitest";

import {
  resolveContextBreakdown,
  resolveContextUsage,
} from "../../src/renderer/features/tasks/state/context-usage";

describe("context usage", () => {
  it("uses accumulated provider token totals across assistant messages", () => {
    const usage = resolveContextUsage([
      { role: "user", content: "第一问" },
      {
        role: "assistant",
        content: "第一答",
        usage: {
          promptTokens: 80,
          completionTokens: 20,
          totalTokens: 100,
        },
      },
      { role: "user", content: "第二问" },
      {
        role: "assistant",
        content: "第二答",
        usage: {
          promptTokens: 170,
          completionTokens: 30,
          totalTokens: 200,
        },
      },
    ]);

    expect(usage).toEqual({ tokens: 300, estimated: false });
  });

  it("keeps the accumulated total stable before a new run reports usage", () => {
    const usage = resolveContextUsage([
      {
        role: "assistant",
        content: "上一轮完成",
        usage: {
          promptTokens: 80,
          completionTokens: 20,
          totalTokens: 100,
        },
      },
      { role: "user", content: "继续" },
      { role: "assistant", content: "" },
    ]);

    expect(usage).toEqual({ tokens: 100, estimated: false });
  });

  it("uses the current run's latest cumulative usage without double counting it", () => {
    const usage = resolveContextUsage([
      {
        role: "assistant",
        content: "上一轮完成",
        usage: {
          promptTokens: 80,
          completionTokens: 20,
          totalTokens: 100,
        },
      },
      { role: "user", content: "联网查一下" },
      {
        role: "assistant",
        content: "正在处理",
        usage: {
          promptTokens: 250,
          completionTokens: 50,
          totalTokens: 300,
        },
      },
    ]);

    expect(usage).toEqual({ tokens: 400, estimated: false });
  });

  it("falls back to a local estimate before any provider usage exists", () => {
    const usage = resolveContextUsage([
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好，有什么可以帮你？" },
    ]);

    expect(usage.estimated).toBe(true);
    expect(usage.tokens).toBeGreaterThan(0);
  });

  it("does not assign accumulated provider usage differences to other", () => {
    const messages = [
      {
        role: "user" as const,
        content: "请写一个很长的故事",
      },
      {
        role: "assistant" as const,
        content: "故事正文".repeat(1_000),
        usage: {
          promptTokens: 450_000,
          completionTokens: 12_079,
          totalTokens: 462_079,
        },
      },
    ];

    const breakdown = resolveContextBreakdown(messages);
    const other = breakdown.find((part) => part.kind === "other")!;
    const assistant = breakdown.find((part) => part.kind === "assistant")!;

    expect(breakdown.reduce((total, part) => total + part.percent, 0)).toBeCloseTo(100);
    expect(other.percent).toBeLessThan(1);
    expect(assistant.percent).toBeGreaterThan(98);
  });
});
