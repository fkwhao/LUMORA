import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatStreamEvent } from "../../src/shared/model-contract";
import { createChatEventBatcher } from "../../src/renderer/features/tasks/state/chat-event-batcher";

function textEvent(delta: string): ChatStreamEvent {
  return {
    type: "text_delta",
    delta,
    model: "test-model",
    errorMessage: "",
  };
}

describe("chat event batcher", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces rapid text deltas into one renderer update", () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const batcher = createChatEventBatcher(dispatch, 40);

    batcher.push(textEvent("你"));
    batcher.push(textEvent("好"));
    batcher.push(textEvent("。"));

    expect(dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0].delta).toBe("你好。");
  });

  it("flushes pending text before a terminal event", () => {
    vi.useFakeTimers();
    const dispatched: ChatStreamEvent[] = [];
    const batcher = createChatEventBatcher((event) => dispatched.push(event));

    batcher.push(textEvent("完成"));
    batcher.push({
      type: "completed",
      delta: "",
      model: "test-model",
      errorMessage: "",
    });

    expect(dispatched.map((event) => event.type)).toEqual([
      "text_delta",
      "completed",
    ]);
    expect(dispatched[0]?.delta).toBe("完成");
  });

  it("drops non-visible reasoning deltas", () => {
    const dispatch = vi.fn();
    const batcher = createChatEventBatcher(dispatch);

    batcher.push({
      type: "reasoning_delta",
      delta: "内部推理",
      model: "test-model",
      errorMessage: "",
    });

    expect(dispatch).not.toHaveBeenCalled();
  });
});
