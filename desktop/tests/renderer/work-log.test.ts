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

describe("subagent work log", () => {
  it("keeps the child session identity and nested event type", () => {
    const lifecycle = workLogItemFromEvent({
      type: "agent_completed",
      delta: "",
      model: "deepseek-v4",
      errorMessage: "",
      itemId: "agent-1",
      title: "架构检查",
      output: "入口位于 ChatService。",
      metadata: {
        agentId: "agent-1",
        sessionId: "run-1:agent:agent-1",
        agentStatus: "completed",
      },
    });
    const nested = workLogItemFromEvent({
      type: "agent_event",
      delta: "正在读取文件",
      model: "deepseek-v4",
      errorMessage: "",
      itemId: "agent-1:tool-1",
      toolName: "read_file",
      metadata: {
        agentId: "agent-1",
        childEventType: "tool_started",
      },
    });

    expect(lifecycle).toMatchObject({
      kind: "agent",
      status: "completed",
      model: "deepseek-v4",
      output: "入口位于 ChatService。",
    });
    expect(nested).toMatchObject({
      kind: "agent",
      status: "running",
      toolName: "read_file",
      metadata: { childEventType: "tool_started" },
    });
  });

  it("projects Team mailbox delivery as a dedicated communication item", () => {
    const message = workLogItemFromEvent({
      type: "agent_peer_message_delivered",
      delta: "请复核接口契约。",
      model: "deepseek-v4",
      errorMessage: "",
      itemId: "message-1",
      metadata: {
        messageId: "message-1",
        agentId: "agent-b",
        senderAgentId: "agent-a",
        senderAgentLabel: "架构研究",
        targetAgentId: "agent-b",
        targetAgentLabel: "后端实现",
        messageStatus: "delivered",
        deliveryMode: "quiet",
      },
    });

    expect(message).toMatchObject({
      itemId: "message-1",
      kind: "message",
      status: "running",
      content: "请复核接口契约。",
      metadata: {
        senderAgentId: "agent-a",
        targetAgentId: "agent-b",
        messageStatus: "delivered",
      },
    });
  });
});
