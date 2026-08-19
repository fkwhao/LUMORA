import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentRunSummary } from "../../src/renderer/features/tasks/AgentRunSummary";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AgentRunSummary", () => {
  it("renders a child Agent as a clickable avatar and hides nested trace rows", () => {
    const onOpenAgent = vi.fn();
    render(
      <AgentRunSummary
        running
        onOpenAgent={onOpenAgent}
        workLog={[
          {
            itemId: "agent-1",
            kind: "agent",
            status: "running",
            title: "架构检查",
            metadata: {
              agentId: "agent-1",
              agentLabel: "架构检查",
              parentAgentId: "supervisor",
            },
          },
          {
            itemId: "agent-1:tool-1",
            kind: "agent",
            status: "running",
            toolName: "read_file",
            title: "读取 architecture.md",
            metadata: {
              agentId: "agent-1",
              childEventType: "tool_started",
            },
          },
          {
            itemId: "agent-2",
            kind: "agent",
            status: "running",
            title: "继续检查测试",
            metadata: {
              agentId: "agent-2",
              agentLabel: "继续检查测试",
              parentAgentId: "agent-1",
            },
          },
        ]}
      />,
    );

    const avatarCall = screen.getByRole("button", {
      name: "查看 架构检查 的执行过程",
    });
    expect(avatarCall.querySelector(".agent-call-avatar")).toBeInTheDocument();
    expect(screen.queryByText("读取 architecture.md")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "查看 继续检查测试 的执行过程" }),
    ).not.toBeInTheDocument();
    fireEvent.click(avatarCall);
    expect(onOpenAgent).toHaveBeenCalledWith("agent-1");
  });

  it("reveals a semantic phase and its shell script on demand", () => {
    render(
      <AgentRunSummary
        durationMs={4_000}
        running={false}
        workLog={[
          {
            itemId: "progress-1",
            kind: "progress",
            status: "completed",
            content: "我先检查现有实现。",
          },
          {
            itemId: "tool-1",
            kind: "tool",
            status: "completed",
            toolName: "shell_command",
            title: "pnpm typecheck",
            arguments: { command: "pnpm typecheck" },
            output: "tsc --noEmit",
            durationMs: 900,
            exitCode: 0,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /已处理 4s/ }));
    expect(screen.getByText("正在检查现有实现")).toBeInTheDocument();

    expect(screen.getByText("正在检查现有实现")).toBeVisible();
    const group = screen.getByRole("button", { name: "验证更新结果" });
    expect(group).toHaveAttribute("aria-expanded", "false");
    expect(group.querySelector(".lucide-chevron-right")).toBeInTheDocument();
    fireEvent.click(group);
    expect(group).toHaveAttribute("aria-expanded", "true");
    expect(group.querySelector(".lucide-chevron-down")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /已在 1s 内运行 pnpm typecheck/ }));

    expect(screen.getByText("Shell 脚本")).toBeInTheDocument();
    expect(screen.getByText("pnpm typecheck")).toBeInTheDocument();
    expect(screen.getByText("tsc --noEmit")).toBeInTheDocument();
  });

  it("keeps the complete multi-sentence phase text", () => {
    const content =
      "我先读取现有源码，确认当前状态。现有代码已确认：组件、工具和接口均已就绪，接下来继续检查配置与测试。";

    render(
      <AgentRunSummary
        durationMs={3_000}
        running={false}
        workLog={[
          {
            itemId: "progress-long",
            kind: "progress",
            status: "completed",
            content,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /已处理 3s/ }));
    expect(
      screen.getByText(
        "正在读取现有源码，确认当前状态。现有代码已确认：组件、工具和接口均已就绪，接下来继续检查配置与测试",
      ),
    ).toBeInTheDocument();
  });

  it("keeps an active tool call compact until the user opens its details", () => {
    render(
      <AgentRunSummary
        running
        startedAt={Date.now() - 1_000}
        workLog={[
          {
            itemId: "tool-running",
            kind: "tool",
            status: "running",
            toolName: "list_files",
            title: "**/*",
            arguments: { pattern: "**/*" },
          },
        ]}
      />,
    );

    expect(screen.getByRole("status", { name: /正在处理/ })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /正在处理/ }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /正在搜索 \*\*\/\*/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("正在检查项目结构")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "检查相关文件" }));
    expect(screen.getByRole("button", { name: /正在搜索 \*\*\/\*/ })).toBeInTheDocument();
    expect(screen.getByText("调用参数").closest(".tool-call-detail-region"))
      .toHaveAttribute("aria-hidden", "true");

    fireEvent.click(screen.getByRole("button", { name: /正在搜索 \*\*\/\*/ }));
    expect(screen.getByText("调用参数").closest(".tool-call-detail-region"))
      .toHaveAttribute("aria-hidden", "false");
  });

  it("keeps approval review compact under the phase and distinguishes denial", () => {
    render(
      <AgentRunSummary
        running
        workLog={[
          {
            itemId: "progress-approval",
            kind: "progress",
            status: "completed",
            content: "接下来提交当前分支。",
          },
          {
            itemId: "approval-review-1",
            kind: "approval",
            status: "failed",
            toolName: "shell_command",
            title: "git push --force origin main",
            arguments: { command: "git push --force origin main" },
            output: "Force pushes require human approval.",
            metadata: {
              approvalReviewDecision: "deny",
              approvalReviewRiskLevel: "HIGH",
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("正在提交当前分支")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /智能审批未通过/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "提交当前分支" }));
    const review = screen.getByRole("button", {
      name: /智能审批未通过，本次未执行 git push --force origin main/,
    });
    expect(review.closest(".tool-call-item")).toHaveAttribute(
      "data-kind",
      "approval",
    );
    expect(
      screen.queryByRole("button", { name: /运行失败/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(review);
    expect(screen.getByText("审批结果")).toBeVisible();
    expect(screen.getByText("风险 HIGH")).toBeVisible();
  });

  it("shows a direct answer duration without an empty disclosure", () => {
    render(
      <AgentRunSummary
        durationMs={1_500}
        running={false}
        workLog={[]}
      />,
    );

    expect(screen.getByText(/已处理 2s/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /已处理/ })).not.toBeInTheDocument();
  });

  it("starts from the real elapsed time and does not round a running second up", () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);

    render(
      <AgentRunSummary
        running
        startedAt={4_100}
        workLog={[
          {
            itemId: "tool-running-timer",
            kind: "tool",
            status: "running",
            toolName: "list_files",
          },
        ]}
      />,
    );

    expect(screen.getByRole("status", { name: /正在处理 5s/ })).toBeVisible();
    expect(screen.queryByText(/正在处理 0s/)).not.toBeInTheDocument();
  });

  it("catches up immediately when a running conversation is restored", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(10_000);
      render(
        <AgentRunSummary
          running
          startedAt={4_000}
          workLog={[
            {
              itemId: "progress-restored-timer",
              kind: "progress",
              status: "running",
              content: "正在恢复会话",
            },
          ]}
        />,
      );
      expect(screen.getByRole("status", { name: /正在处理 6s/ })).toBeVisible();

      vi.setSystemTime(18_000);
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.getByRole("status", { name: /正在处理 14s/ })).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps live details stable through provisional text and folds on completion", () => {
    const workLog = [
      {
        itemId: "progress-stable",
        kind: "progress" as const,
        status: "completed" as const,
        content: "我先检查现有实现。",
      },
    ];
    const { rerender } = render(
      <AgentRunSummary running workLog={workLog} />,
    );
    const runningSummary = screen.getByRole("status", {
      name: /正在处理/,
    });

    rerender(
      <AgentRunSummary answerStarted running workLog={workLog} />,
    );
    expect(document.querySelector(".agent-run-events")).toHaveAttribute(
      "aria-hidden",
      "false",
    );

    rerender(
      <AgentRunSummary
        running
        workLog={[
          ...workLog,
          {
            itemId: "hosted-search-after-stage",
            kind: "search",
            status: "running",
            toolName: "web_search",
            arguments: { query: "official docs" },
          },
        ]}
      />,
    );
    expect(document.querySelector(".agent-run-events")).toHaveAttribute(
      "aria-hidden",
      "false",
    );

    rerender(
      <AgentRunSummary
        answerStarted
        durationMs={2_000}
        running={false}
        workLog={workLog}
      />,
    );
    expect(screen.getByRole("button", { name: /已处理 2s/ })).toBe(
      runningSummary,
    );
    expect(document.querySelector(".agent-run-events")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("presents large-file search and patch calls as file work", () => {
    const onReviewChange = vi.fn();
    render(
      <AgentRunSummary
        durationMs={2_000}
        onReviewChange={onReviewChange}
        running={false}
        workLog={[
          {
            itemId: "search-1",
            kind: "tool",
            status: "completed",
            toolName: "search_in_file",
            arguments: { path: "src/large.ts", query: "render" },
          },
          {
            itemId: "patch-1",
            kind: "tool",
            status: "completed",
            toolName: "apply_patch",
            arguments: { path: "src/large.ts", oldText: "old", newText: "new" },
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /已处理 2s/ }));
    expect(screen.getByText("正在定位相关内容")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "更新相关文件" }));

    expect(
      screen.getByRole("button", { name: "已搜索 src/large.ts" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "已编辑 large.ts" }));
    expect(onReviewChange).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "patch-1" }),
    );
  });

  it("keeps hosted web search inside the collapsed tool group and links real sources", () => {
    render(
      <AgentRunSummary
        durationMs={2_000}
        running={false}
        workLog={[{
          itemId: "hosted-search-1",
          kind: "search",
          status: "completed",
          toolName: "web_search",
          arguments: { query: "Responses API web search" },
          metadata: {
            sources: [{
              title: "Web search guide",
              url: "https://developers.openai.com/api/docs/guides/tools-web-search",
            }],
          },
        }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /已处理 2s/ }));
    expect(screen.getByText("正在搜索网络资料")).toBeVisible();
    expect(document.querySelector(".tool-call-list"))
      .toHaveAttribute("aria-hidden", "true");

    fireEvent.click(screen.getByRole("button", { name: "搜索网络资料" }));
    expect(screen.getByText(/已搜索/)).toBeVisible();
    expect(screen.getByRole("link", { name: /Web search guide/ }))
      .toHaveAttribute(
        "href",
        "https://developers.openai.com/api/docs/guides/tools-web-search",
      );
  });

  it("expands hosted web search calls while the search is running", () => {
    render(
      <AgentRunSummary
        running
        workLog={[{
          itemId: "hosted-search-running",
          kind: "search",
          status: "running",
          toolName: "web_search",
          arguments: { query: "opencode official GUI" },
        }]}
      />,
    );

    expect(screen.getByText("正在搜索网络资料")).toBeVisible();
    expect(screen.getByRole("button", { name: "搜索网络资料" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/opencode official GUI/)).toBeVisible();
  });

  it("explains reviewer fallback and does not mistake a parent test folder for tests", () => {
    const workspace = "F:\\project\\test\\java-microservice";
    const path = `${workspace}\\src\\main\\java\\MicroserviceApplication.java`;
    render(
      <AgentRunSummary
        durationMs={2_000}
        running={false}
        workLog={[
          {
            itemId: "progress-write",
            kind: "progress",
            status: "completed",
            content: "现在写入项目源码。",
          },
          {
            itemId: "approval-fallback",
            kind: "approval",
            status: "completed",
            toolName: "write_file",
            title: path,
            arguments: { path },
            output: "自动审批调用连续失败，本次未执行。",
            metadata: {
              approvalReviewDecision: "require_human",
              approvalReviewFallback: true,
              workspacePath: workspace,
            },
          },
          {
            itemId: "tool-write",
            kind: "tool",
            status: "completed",
            toolName: "write_file",
            title: path,
            arguments: { path },
            metadata: { workspacePath: workspace },
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /已处理 2s/ }));
    expect(
      screen.getByRole("button", { name: "更新相关文件" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "更新相关测试" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "更新相关文件" }));
    expect(
      screen.getByRole("button", {
        name: /智能审批暂不可用，本次未执行.*MicroserviceApplication\.java/,
      }),
    ).toBeInTheDocument();
  });
});
