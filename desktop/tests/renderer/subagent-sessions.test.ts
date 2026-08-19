import { describe, expect, it } from "vitest";

import { subagentSessionsFromMessages } from "../../src/renderer/features/tasks/state/subagent-sessions";

describe("subagent session hierarchy", () => {
  it("groups nested Agents under their actual parent session", () => {
    const sessions = subagentSessionsFromMessages([{
      role: "assistant",
      content: "",
      createdAt: "2026-08-19T10:30:00",
      workLog: [
        {
          itemId: "parent:tool-late",
          kind: "agent",
          status: "completed",
          toolName: "shell_command",
          title: "运行测试",
          metadata: {
            agentId: "parent",
            parentAgentId: "supervisor",
            childEventType: "tool_completed",
            childSequence: 4,
          },
        },
        {
          itemId: "parent",
          kind: "agent",
          status: "completed",
          title: "实现后端",
          output: "后端完成",
          metadata: {
            agentId: "parent",
            sessionId: "run:agent:parent",
            parentAgentId: "supervisor",
            agentLabel: "实现后端",
            delegationDepth: 1,
          },
        },
        {
          itemId: "child",
          kind: "agent",
          status: "running",
          title: "补充测试",
          metadata: {
            agentId: "child",
            sessionId: "run:agent:parent:agent:child",
            parentAgentId: "parent",
            agentLabel: "补充测试",
            delegationDepth: 2,
          },
        },
        {
          itemId: "parent:tool-early",
          kind: "agent",
          status: "completed",
          toolName: "write_file",
          title: "修改文件",
          metadata: {
            agentId: "parent",
            parentAgentId: "supervisor",
            childEventType: "tool_completed",
            childSequence: 2,
          },
        },
      ],
    }]);

    const parent = sessions.get("parent");
    const child = sessions.get("child");
    expect(parent?.children.map((session) => session.agentId)).toEqual([
      "child",
    ]);
    expect(child?.parent).toEqual({ agentId: "parent", label: "实现后端" });
    expect(child?.delegationDepth).toBe(2);
    expect(parent?.createdAt).toBe("2026-08-19T10:30:00");
    expect(parent?.events.map((event) => event.itemId)).toEqual([
      "parent:tool-early",
      "parent:tool-late",
    ]);
  });
});
