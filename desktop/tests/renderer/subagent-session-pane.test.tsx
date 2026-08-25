import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SubagentSessionPane,
  type SubagentSession,
} from "../../src/renderer/features/tasks/components/SubagentSessionPane";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const COMPLETED_SESSION: SubagentSession = {
  agentId: "agent-1",
  sessionId: "run-1:agent:aba45844-1234-5678-90ab-f596",
  parentAgentId: "supervisor",
  teamId: "task-1",
  delegationDepth: 1,
  label: "测试子Agent功能",
  status: "completed",
  model: "deepseek-v4-flash",
  durationMs: 11_000,
  totalTokens: 12_615,
  createdAt: "2026-08-19T10:30:00",
  activations: [
    {
      activationId: "activation-1",
      status: "completed",
      activationStatus: "completed",
      durationMs: 3_000,
      totalTokens: 4_000,
      createdAt: "2026-08-19T10:20:00",
      inputs: [{
        messageId: "input-1",
        sequence: 1,
        senderAgentId: "supervisor",
        senderLabel: "",
        kind: "task",
        content: "先检查项目结构。",
      }],
      answer: "第一轮完成。",
      events: [],
    },
    {
      activationId: "activation-2",
      status: "completed",
      activationStatus: "completed",
      durationMs: 8_000,
      totalTokens: 8_615,
      activeContextTokens: 2_048,
      createdAt: "2026-08-19T10:30:00",
      inputs: [{
        messageId: "input-2",
        sequence: 2,
        senderAgentId: "supervisor",
        senderLabel: "",
        kind: "task",
        content: "继续验证 Agent 页面。",
      }],
      answer: "已经完成子 Agent 功能检查。",
      events: [{
        itemId: "agent-1:tool-1",
        kind: "tool",
        status: "completed",
        toolName: "read_file",
        title: "检查项目结构",
        output: "src/main.ts\nsrc/renderer/TaskPage.tsx",
        durationMs: 1_000,
      }],
    },
  ],
  pendingPeerMessages: [],
  children: [],
};

function renderPane(session: SubagentSession = COMPLETED_SESSION) {
  return render(
    <SubagentSessionPane
      session={session}
      onOpenAgent={vi.fn()}
    />,
  );
}

describe("SubagentSessionPane", () => {
  it("keeps historical Activations folded and opens the latest conversation", () => {
    renderPane();

    const first = screen.getByRole("button", { name: /Activation 1/ });
    const second = screen.getByRole("button", { name: /Activation 2/ });
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(first.closest(".subagent-activation"))
      .not.toHaveAttribute("data-terminal");
    expect(second.closest(".subagent-activation"))
      .toHaveAttribute("data-terminal", "true");
    expect(screen.getByText("继续验证 Agent 页面。")).toBeVisible();
    expect(screen.getByText("先检查项目结构。")
      .closest(".subagent-activation-region"))
      .toHaveAttribute("aria-hidden", "true");

    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("先检查项目结构。")
      .closest(".subagent-activation-region"))
      .toHaveAttribute("aria-hidden", "false");
  });

  it("reuses the main run summary for tool details and copies the current answer", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderPane();

    expect(screen.getByText("已处理 8s")).toBeVisible();
    fireEvent.click(screen.getByText("已处理 8s"));
    expect(screen.getByText("正在定位相关内容")).toBeVisible();

    const copyButtons = screen.getAllByRole("button", { name: "复制子 Agent 回复" });
    fireEvent.click(copyButtons.at(-1)!);
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("已经完成子 Agent 功能检查。");
    });
    expect(screen.getByText("上下文 2,048")).toBeVisible();
  });

  it("renders rich Markdown structure inside the latest Agent answer", () => {
    const latest = COMPLETED_SESSION.activations.at(-1)!;
    const { container } = renderPane({
      ...COMPLETED_SESSION,
      activations: [
        COMPLETED_SESSION.activations[0]!,
        {
          ...latest,
          answer: [
            "### 验证结果",
            "",
            "- 第一项",
            "- 第二项包含 `inline code`",
            "",
            "1. 第一步",
            "2. 第二步",
            "",
            "```ts",
            "const ok = true;",
            "```",
          ].join("\n"),
        },
      ],
    });

    const heading = screen.getByRole("heading", { level: 3, name: "验证结果" });
    expect(heading).toBeVisible();
    expect(heading).toHaveClass("aui-md-h3");
    const lists = screen.getAllByRole("list");
    const unorderedList = lists[0]!;
    const orderedList = lists[1]!;
    expect(unorderedList).toHaveClass("aui-md-ul", "list-disc");
    expect(within(unorderedList).getAllByRole("listitem")).toHaveLength(2);
    expect(orderedList).toHaveClass("aui-md-ol", "list-decimal");
    expect(within(orderedList).getAllByRole("listitem")).toHaveLength(2);
    const inlineCode = screen.getByText("inline code");
    expect(inlineCode.tagName).toBe("CODE");
    expect(inlineCode).toHaveClass("aui-md-inline-code");
    expect(inlineCode.closest("pre")).toBeNull();
    expect(container.querySelector(".subagent-answer .aui-md-pre code"))
      .toHaveTextContent("const ok = true;");
    expect(container.querySelector(".subagent-answer > .aui-md")).toBeTruthy();
  });

  it("shows quiet Team messages without adding management controls", () => {
    renderPane({
      ...COMPLETED_SESSION,
      mode: "continuable",
      pendingInboxCount: 1,
      checkpointSequence: 3,
      recovered: true,
      pendingPeerMessages: [{
        itemId: "peer-1",
        kind: "message",
        status: "running",
        content: "后端事件已经补齐。",
        metadata: {
          senderAgentId: "peer",
          senderAgentLabel: "后端实现",
          targetAgentId: "agent-1",
          targetAgentLabel: "测试子Agent功能",
          messageStatus: "delivered",
        },
      }],
    });

    expect(screen.getByText("Session 可续接")).toBeVisible();
    expect(screen.getByText("Inbox 1 待处理")).toBeVisible();
    expect(screen.getByText("Checkpoint #3")).toBeVisible();
    expect(screen.getByText("已从 Checkpoint 恢复")).toBeVisible();
    expect(screen.getByText("后端实现 → 测试子Agent功能")).toBeVisible();
    expect(screen.getByText("后端事件已经补齐。")).toBeVisible();
    expect(screen.queryByRole("button", { name: /继续|中止/ }))
      .not.toBeInTheDocument();
  });
});
