import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../../src/shared/model-contract";
import {
  resolveContextBreakdown,
  resolveContextUsage,
} from "../../src/renderer/features/tasks/state/context-usage";
import { aggregateMessageUsage } from "../../src/renderer/features/tasks/state/token-usage";

describe("context usage", () => {
  it("anchors context pressure to the latest provider prompt", () => {
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

    expect(usage.estimated).toBe(true);
    expect(usage.tokens).toBeGreaterThan(170);
    expect(usage.tokens).toBeLessThan(200);
  });

  it("projects messages added after the latest provider sample", () => {
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

    expect(usage.estimated).toBe(true);
    expect(usage.tokens).toBeGreaterThan(80);
    expect(usage.tokens).toBeLessThan(120);
  });

  it("uses the current run's latest prompt sample without double counting it", () => {
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

    expect(usage.estimated).toBe(true);
    expect(usage.tokens).toBeGreaterThan(250);
    expect(usage.tokens).toBeLessThan(300);
  });

  it("uses a compaction result immediately as the newest context anchor", () => {
    const usage = resolveContextUsage([
      {
        role: "assistant",
        content: "old answer",
        activeContextTokens: 8_000,
      },
      {
        role: "assistant",
        content: "",
        activeContextTokens: 2_800,
      },
    ]);

    expect(usage).toEqual({ tokens: 2_800, estimated: true });
  });

  it("uses a later failed request as the durable provider anchor", () => {
    const threadMessages: ChatMessage[] = [
      {
        messageId: "assistant-active",
        sequence: 2,
        role: "assistant" as const,
        content: "old answer",
        usage: { promptTokens: 80, completionTokens: 20, totalTokens: 100 },
      },
      {
        messageId: "failed-usage",
        sequence: 4,
        role: "assistant" as const,
        content: "",
        activePath: false,
        usageRecordOnly: true,
        parentMessageId: "user-current",
        durationMs: 1,
        usage: { promptTokens: 250, completionTokens: 10, totalTokens: 260 },
      },
    ];
    const usage = resolveContextUsage([
      {
        ...threadMessages[0]!,
        threadMessages,
      },
      {
        messageId: "user-current",
        sequence: 3,
        role: "user",
        content: "current request",
        threadMessages,
      },
      {
        runtimeId: "failed-live-assistant",
        role: "assistant",
        content: "partial response",
        usage: { promptTokens: 250, completionTokens: 10, totalTokens: 260 },
      },
    ]);

    expect(usage).toEqual({ tokens: 250, estimated: true });
  });

  it("does not replace the main context anchor with delayed memory usage", () => {
    const user: ChatMessage = {
      messageId: "user-1",
      sequence: 1,
      role: "user",
      content: "remember this",
    };
    const assistant: ChatMessage = {
      messageId: "assistant-1",
      sequence: 2,
      parentMessageId: "user-1",
      role: "assistant",
      content: "完成",
      activeContextTokens: 20_000,
      usage: {
        promptTokens: 20_000,
        completionTokens: 500,
        totalTokens: 20_500,
      },
    };
    const memoryUsage: ChatMessage = {
      messageId: "memory-usage-1",
      sequence: 3,
      parentMessageId: "user-1",
      role: "assistant",
      content: "",
      activePath: false,
      usageRecordOnly: true,
      activeContextTokens: 0,
      durationMs: 0,
      usage: {
        promptTokens: 3_800,
        completionTokens: 200,
        totalTokens: 4_000,
      },
    };
    const beforeRefresh = resolveContextUsage([user, assistant]);
    const threadMessages = [user, assistant, memoryUsage];
    const refreshedMessages = [
      { ...user, threadMessages },
      { ...assistant, threadMessages },
    ];
    const afterRefresh = resolveContextUsage(refreshedMessages);

    expect(beforeRefresh).toEqual({ tokens: 20_008, estimated: true });
    expect(afterRefresh).toEqual(beforeRefresh);
    expect(aggregateMessageUsage(refreshedMessages).totalTokens).toBe(24_500);
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
