import { describe, expect, it } from "vitest";

import { reconcilePersistedMessages } from "../../src/renderer/features/tasks/state/chat-message-reconciliation";

describe("completed chat reconciliation", () => {
  it("keeps optimistic renderer IDs while accepting persisted message IDs", () => {
    const messages = reconcilePersistedMessages(
      [
        {
          runtimeId: "lumora-live-user",
          role: "user",
          content: "解释这个问题",
        },
        {
          runtimeId: "lumora-live-assistant",
          role: "assistant",
          content: "流式回答",
        },
      ],
      [
        {
          messageId: "persisted-user",
          role: "user",
          content: "解释这个问题",
        },
        {
          messageId: "persisted-assistant",
          role: "assistant",
          content: "流式回答",
          durationMs: 1_200,
        },
      ],
    );

    expect(messages).toEqual([
      expect.objectContaining({
        messageId: "persisted-user",
        runtimeId: "lumora-live-user",
      }),
      expect.objectContaining({
        messageId: "persisted-assistant",
        runtimeId: "lumora-live-assistant",
        durationMs: 1_200,
      }),
    ]);
  });

  it("preserves older message objects instead of rebuilding the conversation", () => {
    const earlier = {
      messageId: "earlier-user",
      role: "user" as const,
      content: "较早的问题",
    };
    const result = reconcilePersistedMessages(
      [
        earlier,
        {
          messageId: "earlier-assistant",
          role: "assistant",
          content: "较早的回答",
        },
        { runtimeId: "live-user", role: "user", content: "新问题" },
        {
          runtimeId: "live-assistant",
          role: "assistant",
          content: "新回答",
        },
      ],
      [
        { ...earlier },
        {
          messageId: "earlier-assistant",
          role: "assistant",
          content: "较早的回答",
        },
        { messageId: "new-user", role: "user", content: "新问题" },
        {
          messageId: "new-assistant",
          role: "assistant",
          content: "新回答",
        },
      ],
    );

    expect(result[0]).toBe(earlier);
    expect(result.at(-1)?.runtimeId).toBe("live-assistant");
  });
});
