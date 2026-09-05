import { describe, expect, it } from "vitest";

import type { ChatMessage, ChatStreamEvent } from "../../src/shared/model-contract";
import {
  beginContextUsage,
  createContextUsageState,
  reconcileContextUsage,
  reduceContextUsage,
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
        activeContextTokens: 80,
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
        activeContextTokens: 170,
        usage: {
          promptTokens: 170,
          completionTokens: 30,
          totalTokens: 200,
        },
      },
    ]);

    expect(usage.estimated).toBe(true);
    expect(usage.tokens).toBe(170);
  });

  it("keeps the latest sample without projecting new messages or drafts", () => {
    const usage = resolveContextUsage([
      {
        role: "assistant",
        content: "上一轮完成",
        activeContextTokens: 80,
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
    expect(usage.tokens).toBe(80);
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
        activeContextTokens: 250,
        usage: {
          promptTokens: 250,
          completionTokens: 50,
          totalTokens: 300,
        },
      },
    ]);

    expect(usage.estimated).toBe(true);
    expect(usage.tokens).toBe(250);
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
        activeContextTokens: 250,
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

    expect(beforeRefresh).toEqual({ tokens: 20_000, estimated: true });
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

  it("never uses cumulative billing tokens as a missing context sample", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "继续" },
      {
        role: "assistant",
        content: "完成",
        usage: { promptTokens: 450_000, completionTokens: 800, totalTokens: 450_800 },
      },
    ];
    expect(resolveContextUsage(messages)).toEqual({ tokens: 16, estimated: true });
    expect(aggregateMessageUsage(messages).totalTokens).toBe(450_800);
  });
});

describe("context usage display state", () => {
  it("restores explicit context samples with the same accuracy as live updates", () => {
    for (const estimated of [true, false]) {
      const event = streamEvent("usage", {
        activeContextTokens: 80_000,
        usage: { promptTokens: 90_000, completionTokens: 100, totalTokens: 90_100 },
        metadata: { contextUsage: { tokens: 4_000, estimated } },
      });
      const live = reduceContextUsage(createContextUsageState([]), event);
      const persisted: ChatMessage[] = [{
        role: "assistant", content: "完成",
        activeContextTokens: 4_000, activeContextEstimated: estimated,
        usage: event.usage,
      }];
      expect(live.snapshot).toEqual({ tokens: 4_000, estimated });
      expect(reconcileContextUsage(live, persisted).snapshot).toEqual(live.snapshot);
      expect(createContextUsageState(persisted).snapshot).toEqual(live.snapshot);
    }
  });

  it("rejects provisional and invalid explicit samples without using billing totals", () => {
    const state = createContextUsageState([{
      role: "assistant", content: "完成", activeContextTokens: 4_000,
      activeContextEstimated: false,
    }]);
    expect(reduceContextUsage(state, streamEvent("usage", {
      metadata: {
        usageProvisional: true,
        contextUsage: { tokens: 80_000, estimated: true },
      },
    }))).toBe(state);
    for (const tokens of [undefined, -1, 0, 1.5, NaN, Infinity, 2_147_483_648, "9000"]) {
      const next = reduceContextUsage(state, streamEvent("usage", {
        activeContextTokens: 90_000,
        metadata: { contextUsage: { tokens, estimated: false } },
      }));
      expect(next.snapshot).toBe(state.snapshot);
    }
  });

  const initial = () => createContextUsageState([
    { role: "assistant", content: "上一轮", activeContextTokens: 2_000 },
  ]);
  const assistantBoundary = () => streamEvent("protocol_message", {
    metadata: { message: { role: "assistant", content: "" }, hidden: true },
  });

  it("updates only at a settled model boundary, not text or tool estimates", () => {
    let state = initial();
    for (const event of [
      streamEvent("text_delta", { delta: "正在回复".repeat(1_000) }),
      streamEvent("usage", { activeContextTokens: 50_000, metadata: { usageProvisional: true } }),
      streamEvent("progress_message", { metadata: { replacesAssistantContent: true } }),
      streamEvent("text_reset"),
      streamEvent("usage", { activeContextTokens: 40_000 }),
    ]) {
      expect(reduceContextUsage(state, event)).toBe(state);
    }

    state = reduceContextUsage(state, assistantBoundary());
    const pending = state;
    state = reduceContextUsage(state, streamEvent("usage", {
      activeContextTokens: 60_000,
      metadata: { usageProvisional: true },
    }));
    expect(state).toBe(pending);
    state = reduceContextUsage(state, streamEvent("usage", { activeContextTokens: 4_000 }));
    expect(state.snapshot.tokens).toBe(4_000);
    const settled = state;
    state = reduceContextUsage(state, streamEvent("protocol_message", {
      metadata: { message: { role: "tool", content: "结果".repeat(10_000) } },
    }));
    state = reduceContextUsage(state, streamEvent("usage", { activeContextTokens: 24_000 }));
    expect(state).toBe(settled);

    state = reduceContextUsage(state, assistantBoundary());
    state = reduceContextUsage(state, streamEvent("usage", { activeContextTokens: 3_000 }));
    expect(state.snapshot.tokens).toBe(3_000);
  });

  it("accepts compaction immediately and keeps later tool estimates out", () => {
    for (const fields of [
      { activeContextTokens: 800 },
      { metadata: { afterTokens: 800 } },
    ]) {
      const pending = reduceContextUsage(initial(), assistantBoundary());
      const compacted = reduceContextUsage(pending, streamEvent("context_compacted", fields));
      expect(compacted.snapshot).toEqual({ tokens: 800, estimated: true });
      expect(reduceContextUsage(compacted, streamEvent("usage", { activeContextTokens: 9_000 })))
        .toBe(compacted);
    }
  });

  it("does not let missing usage, invalid samples or malformed boundaries inflate the display", () => {
    for (const value of [undefined, NaN, Infinity, -10, 0]) {
      const pending = reduceContextUsage(initial(), assistantBoundary());
      const next = reduceContextUsage(pending, streamEvent("usage", {
        activeContextTokens: value,
        usage: { promptTokens: 50_000, completionTokens: 200, totalTokens: 50_200 },
      }));
      expect(next.snapshot.tokens).toBe(2_000);
      expect(next.awaitingModelUsage).toBe(false);
    }
    for (const message of [undefined, null, "assistant", {}, []]) {
      const state = initial();
      expect(reduceContextUsage(state, streamEvent("protocol_message", { metadata: { message } })))
        .toBe(state);
    }
  });

  it("preserves a live settlement across persisted message refreshes", () => {
    const pending = reduceContextUsage(initial(), assistantBoundary());
    const settled = reduceContextUsage(pending, streamEvent("usage", { activeContextTokens: 4_000 }));
    const refreshed = reconcileContextUsage(settled, [
      { role: "assistant", content: "更短的最终回复", activeContextTokens: 24_000 },
    ]);
    expect(refreshed.snapshot).toBe(settled.snapshot);
    expect(reconcileContextUsage(initial(), [
      { role: "assistant", content: "历史", activeContextTokens: 3_000 },
    ]).snapshot.tokens).toBe(3_000);
  });

  it("resets settlement tracking for a new run without recalculating its snapshot", () => {
    const pending = reduceContextUsage(initial(), assistantBoundary());
    const state = beginContextUsage(pending, [
      { role: "assistant", content: "工具回复", activeContextTokens: 24_000 },
      { role: "user", content: "继续" },
    ]);
    expect(state.snapshot).toBe(pending.snapshot);
    expect(state.awaitingModelUsage).toBe(false);
    expect(state.updatedDuringRun).toBe(false);
    expect(beginContextUsage(createContextUsageState([]), [
      { role: "user", content: "你好" },
    ]).snapshot).toEqual({ tokens: 8, estimated: true });
  });
});

function streamEvent(
  type: ChatStreamEvent["type"],
  fields: Partial<ChatStreamEvent> = {},
): ChatStreamEvent {
  return { type, delta: "", model: "demo", errorMessage: "", ...fields };
}
