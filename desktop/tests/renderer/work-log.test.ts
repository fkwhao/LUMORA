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
