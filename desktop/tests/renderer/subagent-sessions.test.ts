import { describe, expect, it } from "vitest";

import { subagentSessionsFromMessages } from "../../src/renderer/features/tasks/state/subagent-sessions";

describe("subagent activation projection", () => {
  it("restores the one-shot input from the terminal event after live upsert", () => {
    const sessions = subagentSessionsFromMessages([{
      role: "assistant",
      content: "",
      workLog: [lifecycle("agent-one-shot", "agent_completed", {
        agentId: "agent-one-shot",
        sessionId: "session-one-shot",
        parentAgentId: "supervisor",
        agentLabel: "快速核验",
        sessionMode: "one_shot",
        activationId: "agent-one-shot:activation:1",
        activationInput: "核验接口契约并报告。",
        agentStatus: "completed",
      }, "契约一致。")],
    }]);

    const activation = sessions.get("agent-one-shot")?.activations[0];
    expect(activation?.inputs[0]?.content).toBe("核验接口契约并报告。");
    expect(activation?.answer).toBe("契约一致。");
  });

  it("groups inputs, shared work-log events, answers and nested sessions per Activation", () => {
    const sessions = subagentSessionsFromMessages([{
      role: "assistant",
      content: "",
      createdAt: "2026-08-19T10:30:00",
      workLog: [
        lifecycle("parent:create", "agent_session_created", {
          agentId: "parent",
          sessionId: "session-parent",
          parentAgentId: "supervisor",
          agentLabel: "实现后端",
          sessionMode: "continuable",
          teamId: "task-1",
          delegationDepth: 1,
        }),
        lifecycle("message-1", "agent_inbox_enqueued", {
          agentId: "parent",
          sessionId: "session-parent",
          parentAgentId: "supervisor",
          agentLabel: "实现后端",
          sessionMode: "continuable",
          inboxSequence: 1,
          senderAgentId: "supervisor",
        }, "先检查架构入口"),
        lifecycle("activation-1", "agent_activation_started", {
          agentId: "parent",
          sessionId: "session-parent",
          parentAgentId: "supervisor",
          agentLabel: "实现后端",
          sessionMode: "continuable",
          activationId: "activation-1",
          consumedInboxSequence: 1,
          agentStatus: "running",
        }),
        child("parent:progress", "progress_message", "activation-1", 1),
        child("parent:tool", "tool_completed", "activation-1", 2),
        lifecycle("parent:done-1", "agent_completed", {
          agentId: "parent",
          sessionId: "session-parent",
          parentAgentId: "supervisor",
          agentLabel: "实现后端",
          sessionMode: "continuable",
          activationId: "activation-1",
          activationStatus: "completed",
          agentStatus: "idle",
          totalTokens: 120,
        }, "第一轮完成"),
        {
          itemId: "peer-message",
          kind: "message",
          status: "completed",
          content: "前端已经更新事件类型。",
          metadata: {
            agentId: "parent",
            sessionId: "session-parent",
            targetAgentId: "parent",
            targetAgentLabel: "实现后端",
            senderAgentId: "peer",
            senderAgentLabel: "前端实现",
            activationId: "activation-2",
            messageStatus: "consumed",
            inboxSequence: 2,
          },
        },
        lifecycle("message-3", "agent_inbox_enqueued", {
          agentId: "parent",
          sessionId: "session-parent",
          parentAgentId: "supervisor",
          agentLabel: "实现后端",
          sessionMode: "continuable",
          inboxSequence: 3,
          senderAgentId: "supervisor",
        }, "继续补充测试"),
        lifecycle("activation-2", "agent_activation_started", {
          agentId: "parent",
          sessionId: "session-parent",
          parentAgentId: "supervisor",
          agentLabel: "实现后端",
          sessionMode: "continuable",
          activationId: "activation-2",
          consumedInboxSequence: 3,
          agentStatus: "running",
        }),
        lifecycle("parent:done-2", "agent_completed", {
          agentId: "parent",
          sessionId: "session-parent",
          parentAgentId: "supervisor",
          agentLabel: "实现后端",
          sessionMode: "continuable",
          activationId: "activation-2",
          activationStatus: "completed",
          agentStatus: "idle",
          totalTokens: 80,
        }, "第二轮完成"),
        lifecycle("child", "agent_started", {
          agentId: "child",
          sessionId: "session-child",
          parentAgentId: "parent",
          agentLabel: "边界测试",
          activationId: "child:activation:1",
          delegationDepth: 2,
          agentStatus: "running",
        }),
      ],
    }]);

    const parent = sessions.get("parent");
    const nested = sessions.get("child");
    expect(parent?.activations).toHaveLength(2);
    expect(parent?.activations[0]?.inputs[0]?.content).toBe("先检查架构入口");
    expect(parent?.activations[0]?.events.map((event) => event.kind)).toEqual([
      "progress",
      "tool",
    ]);
    expect(parent?.activations[0]?.answer).toBe("第一轮完成");
    expect(parent?.activations[1]?.answer).toBe("第二轮完成");
    expect(parent?.activations[1]?.events[0]?.kind).toBe("message");
    expect(parent?.activations[1]?.inputs.map((input) => input.kind)).toEqual([
      "peer",
      "task",
    ]);
    expect(parent?.activations[1]?.inputs[0]?.content).toBe("前端已经更新事件类型。");
    expect(parent?.totalTokens).toBe(200);
    expect(parent?.teamId).toBe("task-1");
    expect(parent?.children.map((session) => session.agentId)).toEqual(["child"]);
    expect(nested?.parent).toEqual({ agentId: "parent", label: "实现后端" });
  });
});

function lifecycle(
  itemId: string,
  sessionEventType: string,
  metadata: Record<string, unknown>,
  outputOrContent = "",
) {
  return {
    itemId,
    kind: "agent" as const,
    status: sessionEventType.includes("failed") ? "failed" as const : "completed" as const,
    content: sessionEventType === "agent_inbox_enqueued" ? outputOrContent : "",
    output: sessionEventType !== "agent_inbox_enqueued" ? outputOrContent : "",
    title: typeof metadata.agentLabel === "string" ? metadata.agentLabel : "Agent",
    metadata: { ...metadata, sessionEventType },
  };
}

function child(
  itemId: string,
  childEventType: string,
  activationId: string,
  childSequence: number,
) {
  return {
    itemId,
    kind: "agent" as const,
    status: "completed" as const,
    toolName: childEventType.startsWith("tool_") ? "read_file" : undefined,
    title: childEventType === "progress_message" ? "定位入口" : "读取文件",
    metadata: {
      agentId: "parent",
      parentAgentId: "supervisor",
      agentLabel: "实现后端",
      activationId,
      childEventType,
      childSequence,
    },
  };
}
