import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  provisionalRunChangesFromWorkLog,
  RunChangesCard,
} from "../../src/renderer/features/tasks/components/RunChangesCard";
import type { ConversationRunChanges } from "../../src/shared/model-contract";

const CHANGES: ConversationRunChanges = {
  runId: "run-1",
  status: "CAPTURED",
  repositoryRoot: "C:/project",
  reason: "",
  additions: 35,
  deletions: 8,
  revertible: true,
  files: [
    file("README.md", 6, 1),
    file("src/auth.ts", 20, 3),
    file("src/session.ts", 3, 2),
    file("src/cookies.ts", 4, 1),
    file("src/auth.test.ts", 2, 1),
  ],
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RunChangesCard", () => {
  it("builds an immediate bounded summary from completed file tools", () => {
    const changes = provisionalRunChangesFromWorkLog("run-live", [
      {
        itemId: "tool-1",
        kind: "tool",
        status: "completed",
        toolName: "apply_patch",
        arguments: {
          path: "src/auth.ts",
          oldText: "const token = legacy;",
          newText: "const token = session;\nreturn token;",
        },
      },
      {
        itemId: "tool-2",
        kind: "tool",
        status: "failed",
        toolName: "write_file",
        arguments: { path: "src/ignored.ts", content: "ignored" },
      },
    ]);

    expect(changes).toMatchObject({
      runId: "run-live",
      status: "TRACKING",
      additions: 2,
      deletions: 1,
      revertible: false,
    });
    expect(changes?.files).toHaveLength(1);
    expect(changes?.files[0]).toMatchObject({
      path: "src/auth.ts",
      additions: 2,
      deletions: 1,
      patchTruncated: false,
    });
    expect(changes?.files[0]?.patch).toContain("-const token = legacy;");
    expect(changes?.files[0]?.patch).toContain("+const token = session;");
  });

  it("shows the run totals, expands files, and exposes review and revert actions", () => {
    vi.useFakeTimers();
    const onReview = vi.fn();
    const onRevert = vi.fn();
    render(
      <RunChangesCard
        changes={CHANGES}
        onReview={onReview}
        onRevert={onRevert}
      />,
    );

    expect(screen.getByText("已编辑 5 个文件")).toBeInTheDocument();
    expect(screen.getByText("+35")).toBeInTheDocument();
    expect(screen.getByText("-8")).toBeInTheDocument();
    const rootFile = screen.getByRole("button", { name: "审核 README.md" });
    expect(within(rootFile).getByText("./")).toBeInTheDocument();
    expect(within(rootFile).getByText("README.md")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "审核 src/cookies.ts" }),
    ).not.toBeInTheDocument();

    const authFile = screen.getByRole("button", { name: "审核 src/auth.ts" });
    expect(within(authFile).getByText("src/")).toBeInTheDocument();
    expect(within(authFile).getByText("auth.ts")).toBeInTheDocument();
    vi.spyOn(authFile, "getBoundingClientRect").mockReturnValue({
      bottom: 542,
      height: 42,
      left: 100,
      right: 800,
      top: 500,
      width: 700,
      x: 100,
      y: 500,
      toJSON: () => ({}),
    });
    fireEvent.mouseEnter(authFile);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(319));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    const preview = screen.getByRole("tooltip");
    expect(preview.style.bottom).toBe(`${window.innerHeight - 500 + 9}px`);
    expect(preview.style.width).toBe("660px");
    expect(within(preview).getByText("src/")).toBeInTheDocument();
    expect(within(preview).getByText("auth.ts")).toBeInTheDocument();
    expect(hasCodeLine(preview, "const previous = true;")).toBe(true);
    expect(hasCodeLine(preview, "const current = true;")).toBe(true);
    expect(within(preview).queryByText(/点击|预览/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "再显示 2 个文件" }));
    expect(
      screen.getByRole("button", { name: "审核 src/cookies.ts" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起文件列表" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "审核" }));
    expect(onReview).toHaveBeenCalledWith();
    fireEvent.click(authFile);
    expect(onReview).toHaveBeenCalledWith("src/auth.ts");
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(onRevert).toHaveBeenCalledOnce();
  });

  it("disables undo when the run cannot be safely reverted", () => {
    render(
      <RunChangesCard
        changes={{ ...CHANGES, revertible: false, reason: "工作区已发生冲突" }}
        onReview={vi.fn()}
        onRevert={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "撤销" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "撤销" })).toHaveAttribute(
      "title",
      "工作区已发生冲突",
    );
  });
});

function hasCodeLine(root: ParentNode, source: string): boolean {
  return Array.from(root.querySelectorAll("code"))
    .some((code) => code.textContent === source);
}

function file(path: string, additions: number, deletions: number) {
  return {
    path,
    previousPath: "",
    status: "MODIFIED" as const,
    additions,
    deletions,
    binary: false,
    patch: [
      `diff --git a/${path} b/${path}`,
      `--- a/${path}`,
      `+++ b/${path}`,
      "@@ -12,1 +12,1 @@",
      "-const previous = true;",
      "+const current = true;",
    ].join("\n"),
    patchTruncated: false,
  };
}
