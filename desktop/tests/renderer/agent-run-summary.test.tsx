import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentRunSummary } from "../../src/renderer/features/tasks/AgentRunSummary";

describe("AgentRunSummary", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "正在检查现有实现" }));
    fireEvent.click(screen.getByRole("button", { name: /已在 1s 内运行 pnpm typecheck/ }));

    expect(screen.getByText("Shell 脚本")).toBeInTheDocument();
    expect(screen.getByText("pnpm typecheck")).toBeInTheDocument();
    expect(screen.getByText("tsc --noEmit")).toBeInTheDocument();
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

    expect(screen.getByRole("button", { name: /正在搜索 \*\*\/\*/ })).toBeInTheDocument();
    expect(screen.getByText("调用参数").closest(".tool-call-detail-region"))
      .toHaveAttribute("aria-hidden", "true");

    fireEvent.click(screen.getByRole("button", { name: /正在搜索 \*\*\/\*/ }));
    expect(screen.getByText("调用参数").closest(".tool-call-detail-region"))
      .toHaveAttribute("aria-hidden", "false");
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
    fireEvent.click(
      screen.getByRole("button", { name: "正在定位相关内容" }),
    );

    expect(
      screen.getByRole("button", { name: "已搜索 src/large.ts" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "已编辑 large.ts" }));
    expect(onReviewChange).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "patch-1" }),
    );
  });
});
