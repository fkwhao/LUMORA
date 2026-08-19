import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  delegationDepth: 1,
  label: "测试子Agent功能",
  status: "completed",
  model: "deepseek-v4-flash",
  durationMs: 8_000,
  totalTokens: 12_615,
  createdAt: "2026-08-19T10:30:00",
  answer: "已经完成子 Agent 功能检查。",
  events: [{
    itemId: "agent-1:tool-1",
    kind: "agent",
    status: "completed",
    title: "检查项目结构",
    output: "src/main.ts\nsrc/renderer/TaskPage.tsx",
    durationMs: 1_000,
    metadata: { childEventType: "tool_completed" },
  }],
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
  it("keeps completed execution steps compact and supports nested disclosure", () => {
    const { container } = renderPane();

    const toggle = screen.getByRole("button", { name: /执行步骤 1/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector(".subagent-trace-collapse"))
      .toHaveAttribute("aria-hidden", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector(".subagent-trace-collapse"))
      .toHaveAttribute("aria-hidden", "false");

    const detail = container.querySelector("details.subagent-trace-item");
    const summary = detail?.querySelector("summary");
    expect(detail).not.toHaveAttribute("open");
    expect(summary).not.toBeNull();
    fireEvent.click(summary!);
    expect(detail).toHaveAttribute("open");
    expect(screen.getByText(/src\/main\.ts/)).toBeVisible();
  });

  it("copies only the answer and shows the session response time", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderPane();

    expect(screen.queryByRole("button", { name: /喜欢|不喜欢|重新生成/ }))
      .not.toBeInTheDocument();
    const copy = screen.getByRole("button", { name: "复制子 Agent 回复" });
    fireEvent.click(copy);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("已经完成子 Agent 功能检查。");
    });
    expect(screen.getByRole("button", { name: "已复制子 Agent 回复" }))
      .toBeVisible();
    expect(screen.getByText(/10:30/).closest("time"))
      .toHaveAttribute("dateTime", COMPLETED_SESSION.createdAt);
  });

  it("opens steps while the child Agent is still running", () => {
    renderPane({
      ...COMPLETED_SESSION,
      status: "running",
      answer: "",
      durationMs: undefined,
      createdAt: undefined,
    });

    expect(screen.getByRole("button", { name: /执行步骤 1/ }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "复制子 Agent 回复" }))
      .toBeDisabled();
  });

  it("shows continuable runtime state without manual control buttons", () => {
    renderPane({
      ...COMPLETED_SESSION,
      mode: "continuable",
      activationStatus: "interrupted",
      pendingInboxCount: 2,
      checkpointSequence: 3,
      recovered: true,
    });

    expect(screen.getByText("Session 可续接")).toBeVisible();
    expect(screen.getByText("Activation 已中止，可续接")).toBeVisible();
    expect(screen.getByText("Inbox 2 待处理")).toBeVisible();
    expect(screen.getByText("Checkpoint #3")).toBeVisible();
    expect(screen.getByText("可恢复")).toBeVisible();
    expect(screen.queryByRole("button", { name: /继续|中止/ }))
      .not.toBeInTheDocument();
  });
});
