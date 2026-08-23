import {
  fireEvent,
  cleanup,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiffReviewPane } from "../../src/renderer/features/tasks/DiffReviewPane";

afterEach(cleanup);

describe("DiffReviewPane", () => {
  it("expands and collapses each changed file independently", () => {
    const onSelectChange = vi.fn();
    render(
      <DiffReviewPane
        changes={[
          {
            changeId: "change-1",
            path: "src/example.ts",
            oldText: "const count = 1;",
            newText: "const count = 2;",
            previewAvailable: true,
          },
          {
            changeId: "change-2",
            path: "src/other.ts",
            oldText: "old",
            newText: "new",
            previewAvailable: true,
          },
        ]}
        onSelectChange={onSelectChange}
        selectedChangeId="change-1"
      />,
    );

    expect(screen.getByText("const count = 1;")).toBeInTheDocument();
    expect(screen.getByText("const count = 2;")).toBeInTheDocument();
    const firstFile = screen.getByRole("button", { name: "折叠 src/example.ts" });
    expect(firstFile).toHaveAttribute("aria-expanded", "true");
    const otherFile = screen.getByRole("button", { name: "展开 src/other.ts" });
    expect(within(otherFile).getByText("src/")).toBeInTheDocument();
    expect(within(otherFile).getByText("other.ts")).toBeInTheDocument();
    fireEvent.click(otherFile);
    expect(onSelectChange).toHaveBeenCalledWith("change-2");
    expect(screen.getByText("old")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();
    fireEvent.click(firstFile);
    expect(screen.queryByText("const count = 1;")).not.toBeInTheDocument();
  });

  it("delegates expanded diff scrolling to the native file-list container", () => {
    const { container } = render(
      <DiffReviewPane
        changes={[{
          changeId: "change-1",
          path: "src/example.ts",
          oldText: "const count = 1;",
          newText: "const count = 2;",
          previewAvailable: true,
        }]}
        selectedChangeId="change-1"
        onSelectChange={vi.fn()}
      />,
    );

    const fileList = container.querySelector<HTMLElement>(
      ".review-file-accordion",
    );
    expect(fileList).not.toBeNull();
    if (!fileList) return;

    const diffScrollRegion = container.querySelector<HTMLElement>(
      "[data-diff-scroll-owner]",
    );
    expect(diffScrollRegion).toHaveAttribute("data-diff-scroll-owner", "parent");
    expect(fileList).not.toHaveAttribute("data-diff-scroll-owner");
  });

  it("renders unified Git rows and enables a safe Run revert", () => {
    const onRevert = vi.fn();
    render(
      <DiffReviewPane
        changes={[{
          changeId: "run-1:src/auth.ts",
          path: "src/auth.ts",
          status: "MODIFIED",
          additions: 1,
          deletions: 1,
          binary: false,
          patch: [
            "diff --git a/src/auth.ts b/src/auth.ts",
            "--- a/src/auth.ts",
            "+++ b/src/auth.ts",
            "@@ -12,2 +12,2 @@",
            " export function getToken() {",
            "-  return localStorage.token;",
            "+  return cookies.get(\"session\");",
          ].join("\n"),
          previewAvailable: true,
        }]}
        runChanges={{
          runId: "run-1",
          status: "CAPTURED",
          repositoryRoot: "C:/project",
          reason: "",
          additions: 1,
          deletions: 1,
          revertible: true,
          files: [],
        }}
        selectedChangeId="run-1:src/auth.ts"
        onSelectChange={vi.fn()}
        onRevert={onRevert}
      />,
    );

    expect(screen.getByText("return localStorage.token;")).toBeInTheDocument();
    expect(screen.getByText('return cookies.get("session");')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "撤回本轮" }));
    expect(onRevert).toHaveBeenCalledOnce();
  });

  it("offers explicit actions for an isolated Worktree result", () => {
    const onApply = vi.fn();
    const onCreateBranch = vi.fn();
    const onDiscard = vi.fn();
    render(
      <DiffReviewPane
        changes={[{
          changeId: "task:task-2:src/result.ts",
          path: "src/result.ts",
          additions: 3,
          deletions: 1,
          previewAvailable: false,
        }]}
        taskChanges={{
          taskId: "task-2",
          status: "WAITING_REVIEW",
          repositoryRoot: "C:/project",
          reason: "修改已隔离保存",
          additions: 3,
          deletions: 1,
          files: [],
        }}
        taskWorktree={{
          taskId: "task-2",
          workspaceMode: "WORKTREE",
          worktreeState: "CONFLICTED",
          sourceWorkspacePath: "C:/project",
          effectiveWorkspacePath: "C:/temp/task-2",
          repositoryRoot: "C:/project",
          baseCommit: "abc123",
          branchName: "",
          reason: "raw git conflict output",
          conflictPaths: ["src/result.ts", "src/other.ts"],
          canApply: true,
          canCreateBranch: true,
          canDiscard: true,
          updatedAt: "2026-08-22T00:00:00Z",
        }}
        onSelectChange={vi.fn()}
        onApplyWorktree={onApply}
        onCreateWorktreeBranch={onCreateBranch}
        onDiscardWorktree={onDiscard}
      />,
    );

    expect(screen.getByText("任务结果")).toBeInTheDocument();
    expect(screen.getByText(
      "2 个文件与 Local 修改存在冲突。请在下方展开标记文件进行审阅。",
    )).toBeInTheDocument();
    expect(screen.queryByText("raw git conflict output")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "应用到 Local" }));
    expect(onApply).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "创建分支" }));
    fireEvent.change(screen.getByRole("textbox", { name: "新分支名称" }), {
      target: { value: "agent/refactor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));
    expect(onCreateBranch).toHaveBeenCalledWith("agent/refactor");

    fireEvent.click(screen.getByRole("button", { name: "放弃修改" }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it("selects concrete commit and branch review ranges without switching branches", () => {
    const onScopeChange = vi.fn();
    render(
      <DiffReviewPane
        changes={[]}
        scope={{ scope: "LAST_RUN", runId: "run-1" }}
        lastRunId="run-1"
        currentBranch="main"
        commits={[{
          sha: "abc123456789",
          shortSha: "abc1234",
          summary: "调整审阅布局",
        }]}
        branches={[
          { name: "main", current: true },
          { name: "feature/auth", current: false },
        ]}
        onSelectChange={vi.fn()}
        onScopeChange={onScopeChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "审阅范围：本轮" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "本轮" }));
    expect(onScopeChange).toHaveBeenLastCalledWith({
      scope: "LAST_RUN",
      runId: "run-1",
    });
    expect(screen.queryByRole("menuitemradio", { name: "本轮" }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "审阅范围：本轮" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "全部未提交" }));
    expect(onScopeChange).toHaveBeenLastCalledWith({ scope: "UNCOMMITTED" });

    fireEvent.click(screen.getByRole("button", { name: "审阅范围：本轮" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "未暂存" }));
    expect(onScopeChange).toHaveBeenLastCalledWith({ scope: "UNSTAGED" });

    fireEvent.click(screen.getByRole("button", { name: "审阅范围：本轮" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "已暂存" }));
    expect(onScopeChange).toHaveBeenLastCalledWith({ scope: "STAGED" });

    fireEvent.click(screen.getByRole("button", { name: "审阅范围：本轮" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /调整审阅布局/ }));
    expect(onScopeChange).toHaveBeenLastCalledWith({
      scope: "COMMIT",
      commitSha: "abc123456789",
    });

    fireEvent.click(screen.getByRole("button", { name: "审阅范围：本轮" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /feature\/auth/ }));
    expect(onScopeChange).toHaveBeenLastCalledWith({
      scope: "BRANCH_COMPARE",
      baseRef: "feature/auth",
      headRef: "main",
    });
  });

  it("shows totals from the selected review scope instead of the last Run", () => {
    const { container } = render(
      <DiffReviewPane
        changes={[{
          changeId: "uncommitted:src/current.ts",
          path: "src/current.ts",
          additions: 7,
          deletions: 4,
          previewAvailable: false,
        }]}
        runChanges={{
          runId: "run-1",
          status: "CAPTURED",
          repositoryRoot: "C:/project",
          reason: "",
          additions: 1,
          deletions: 0,
          revertible: true,
          files: [],
        }}
        scope={{ scope: "UNCOMMITTED" }}
        scopeChanges={{
          scope: "UNCOMMITTED",
          label: "全部未提交",
          repositoryRoot: "C:/project",
          reason: "",
          additions: 7,
          deletions: 4,
          files: [],
        }}
        onSelectChange={vi.fn()}
      />,
    );

    expect(container.querySelector(".review-total-add")).toHaveTextContent("+7");
    expect(container.querySelector(".review-total-del")).toHaveTextContent("−4");
    expect(screen.queryByText("+1")).not.toBeInTheDocument();
  });

  it("does not leak the last Run warning into another review scope", () => {
    render(
      <DiffReviewPane
        changes={[]}
        runChanges={{
          runId: "run-1",
          status: "UNAVAILABLE",
          repositoryRoot: "C:/project",
          reason: "本轮变更追踪不可用",
          additions: 0,
          deletions: 0,
          revertible: false,
          files: [],
        }}
        scope={{ scope: "UNCOMMITTED" }}
        scopeChanges={{
          scope: "UNCOMMITTED",
          label: "全部未提交",
          repositoryRoot: "C:/project",
          reason: "",
          additions: 0,
          deletions: 0,
          files: [],
        }}
        onSelectChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("本轮变更追踪不可用")).not.toBeInTheDocument();
    expect(screen.getByText("当前环境没有未提交改动。")).toBeInTheDocument();
  });
});
