import { describe, expect, it } from "vitest";

import { workLogItemFromEvent } from "../../src/shared/work-log";

describe("approval review work log", () => {
  it("projects live and denied review events without treating them as commands", () => {
    const running = workLogItemFromEvent({
      type: "approval_review_started",
      delta: "",
      model: "demo",
      errorMessage: "",
      itemId: "approval-review-1",
      toolCallId: "call-1",
      toolName: "shell_command",
      title: "git push origin main",
      arguments: { command: "git push origin main" },
      metadata: { approvalReviewDecision: "reviewing" },
    });
    const denied = workLogItemFromEvent({
      type: "approval_review_completed",
      delta: "",
      model: "demo",
      errorMessage: "",
      itemId: "approval-review-1",
      toolCallId: "call-1",
      toolName: "shell_command",
      title: "git push origin main",
      arguments: { command: "git push origin main" },
      output: "The destination is ambiguous.",
      durationMs: 240,
      metadata: { approvalReviewDecision: "deny" },
    });
    const humanBoundary = workLogItemFromEvent({
      type: "approval_review_completed",
      delta: "",
      model: "demo",
      errorMessage: "",
      itemId: "approval-review-2",
      toolCallId: "call-2",
      toolName: "shell_command",
      title: "deploy production",
      arguments: { command: "deploy production" },
      output: "Production deployment needs confirmation.",
      metadata: { approvalReviewDecision: "require_human" },
    });

    expect(running).toMatchObject({ kind: "approval", status: "running" });
    expect(denied).toMatchObject({
      kind: "approval",
      status: "failed",
      output: "The destination is ambiguous.",
      durationMs: 240,
    });
    expect(humanBoundary).toMatchObject({
      kind: "approval",
      status: "failed",
    });
  });
});

describe("hosted web search work log", () => {
  it("keeps provider search state and clickable source metadata separate from local tools", () => {
    const search = workLogItemFromEvent({
      type: "web_search_completed",
      delta: "",
      model: "demo",
      errorMessage: "",
      itemId: "search-1",
      toolCallId: "search-1",
      toolName: "web_search",
      title: "网络搜索",
      arguments: { query: "OpenAI Responses web search" },
      output: "已获取 1 个来源",
      metadata: {
        executionLocation: "provider",
        sources: [{ title: "Web search guide", url: "https://example.com/guide" }],
      },
    });

    expect(search).toMatchObject({
      kind: "search",
      status: "completed",
      arguments: { query: "OpenAI Responses web search" },
      metadata: { executionLocation: "provider" },
    });
  });
});

describe("hidden protocol work log", () => {
  it("does not render internal replay metadata as a progress row", () => {
    const item = workLogItemFromEvent({
      type: "progress_message",
      delta: "",
      model: "demo",
      errorMessage: "",
      itemId: "lumora-model-protocol",
      metadata: {
        hidden: true,
        protocolMessages: [{ role: "tool", content: "result" }],
      },
    });

    expect(item).toBeUndefined();
  });
});
