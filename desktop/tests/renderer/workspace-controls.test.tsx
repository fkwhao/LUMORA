import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  LumoraWorkspaceApi,
  WorkspaceContext,
} from "../../src/shared/workspace-contract";
import { WorkspaceControls } from "../../src/renderer/features/tasks/components/WorkspaceControls";
import { DraftEnvironmentPicker } from "../../src/renderer/features/tasks/components/DraftEnvironmentPicker";
import type { WorkspaceEnvironmentSelection } from "../../src/shared/workspace-contract";

afterEach(cleanup);

describe("WorkspaceControls", () => {
  it("Handoffs explicitly, toggles safe auto-apply, and renders the compact Git graph", async () => {
    const local = context("LOCAL");
    const worktree = context("WORKTREE");
    const api = workspaceApi({ local, worktree });

    render(
      <WorkspaceControls
        api={api}
        taskId="task-1"
        workspacePath="F:\\project\\lumora"
        notify={vi.fn()}
      />,
    );

    const localTrigger = await screen.findByRole("button", { name: /Local/ });
    fireEvent.click(localTrigger);
    fireEvent.click(screen.getByRole("menuitemradio", { name: /新建 Worktree/ }));

    await waitFor(() => expect(api.handoff).toHaveBeenCalledWith({
      taskId: "task-1",
      target: "NEW_WORKTREE",
      worktreePath: undefined,
      expectedRevision: 7,
    }));
    const worktreeTrigger = await screen.findByRole("button", { name: /Worktree/ });
    fireEvent.click(worktreeTrigger);
    fireEvent.click(screen.getByRole("switch", { name: /无冲突时自动应用/ }));
    await waitFor(() => expect(api.setWorktreeAutoApply).toHaveBeenCalledWith({
      taskId: "task-1",
      enabled: true,
      expectedSettingsRevision: 3,
    }));

    fireEvent.click(screen.getByRole("button", { name: /main/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交图" }));
    expect(await screen.findByText("建立工作环境协调器")).toBeInTheDocument();
    expect(screen.getByText("abc1234")).toBeInTheDocument();
  });

  it("disables environment and branch mutations while a Run is active", async () => {
    const value = context("LOCAL");
    const api = workspaceApi({ local: value, worktree: context("WORKTREE") });
    render(
      <WorkspaceControls
        api={api}
        taskId="task-1"
        workspacePath="F:\\project\\lumora"
        disabled
        notify={vi.fn()}
      />,
    );

    expect(await screen.findByRole("button", { name: /Local/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /main/ })).toBeDisabled();
    expect(api.handoff).not.toHaveBeenCalled();
  });

  it("checks out and creates branches with optimistic revisions, then closes the menu", async () => {
    const local = context("LOCAL");
    const checkedOut = {
      ...local,
      workspaceRevision: 8,
      branch: { name: "feature/auth", current: true, headSha: "123456abc" },
      headSha: "123456abc",
      branches: local.branches.map((branch) => ({
        ...branch,
        current: branch.name === "feature/auth",
      })),
    } satisfies WorkspaceContext;
    const created = {
      ...checkedOut,
      workspaceRevision: 9,
      branch: { name: "feature/session", current: true, headSha: "123456abc" },
    } satisfies WorkspaceContext;
    const api = workspaceApi({ local, worktree: context("WORKTREE") });
    vi.mocked(api.checkoutBranch).mockResolvedValue(checkedOut);
    vi.mocked(api.createBranch).mockResolvedValue(created);

    render(
      <WorkspaceControls
        api={api}
        taskId="task-1"
        workspacePath="F:\\project\\lumora"
        notify={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /main/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /feature\/auth/ }));
    await waitFor(() => expect(api.checkoutBranch).toHaveBeenCalledWith({
      taskId: "task-1",
      branchName: "feature/auth",
      expectedHead: "abcdef123",
      expectedRevision: 7,
    }));
    expect(screen.queryByRole("menuitemradio", { name: /feature\/auth/ }))
      .not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /feature\/auth/ }));
    fireEvent.click(screen.getByRole("button", { name: "新建分支" }));
    fireEvent.change(screen.getByRole("textbox", { name: "新分支名称" }), {
      target: { value: "feature/session" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建并检出" }));

    await waitFor(() => expect(api.createBranch).toHaveBeenCalledWith({
      taskId: "task-1",
      branchName: "feature/session",
      checkout: true,
      expectedRevision: 8,
    }));
    expect(screen.queryByRole("textbox", { name: "新分支名称" }))
      .not.toBeInTheDocument();
  });

  it("keeps draft Worktree selection explicit and defaults safe auto-apply to off", async () => {
    const local = context("LOCAL");
    local.worktrees = [
      {
        mode: "LOCAL",
        label: "Local",
        path: "F:/project/lumora",
        current: true,
      },
      {
        mode: "WORKTREE",
        label: "Auth Worktree",
        path: "F:/worktrees/auth",
        worktreePath: "F:/worktrees/auth",
        current: false,
      },
    ];
    const api = workspaceApi({ local, worktree: context("WORKTREE") });
    const onChange = vi.fn();

    function Harness() {
      const [value, setValue] = useState<WorkspaceEnvironmentSelection>({
        target: "LOCAL",
      });
      return (
        <DraftEnvironmentPicker
          api={api}
          workspacePath="F:/project/lumora"
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: /Local/ }));
    expect(screen.queryByText("Local", { selector: ".workspace-menu-item strong" }))
      .toBeInTheDocument();
    expect(screen.queryByText("Local", { selector: ".workspace-menu-item small" }))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitemradio", { name: /新建 Worktree/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      target: "NEW_WORKTREE",
      autoApplyWhenClean: false,
    });
    expect(screen.queryByRole("menuitemradio", { name: /新建 Worktree/ }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /新 Worktree/ }));
    fireEvent.click(screen.getByRole("switch", { name: /无冲突时自动应用/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      target: "NEW_WORKTREE",
      autoApplyWhenClean: true,
    });
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Auth Worktree/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      target: "EXISTING_WORKTREE",
      worktreePath: "F:/worktrees/auth",
    });
    expect(screen.queryByRole("switch", { name: /无冲突时自动应用/ }))
      .not.toBeInTheDocument();
  });

  it("does not expose auto-apply for an adopted existing Worktree", async () => {
    const adopted = context("WORKTREE");
    adopted.environment = {
      ...adopted.environment,
      managedByLumora: false,
      canAutoApply: false,
    };
    const api = workspaceApi({
      local: context("LOCAL"),
      worktree: adopted,
    });
    vi.mocked(api.inspect).mockResolvedValue(adopted);

    render(
      <WorkspaceControls
        api={api}
        taskId="task-1"
        workspacePath="F:/project/lumora"
        notify={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Worktree/ }));
    expect(screen.queryByRole("switch", { name: /无冲突时自动应用/ }))
      .not.toBeInTheDocument();
  });

  it.each([
    ["非 Git 项目", async () => ({ ...context("LOCAL"), repositoryRoot: "" })],
    ["检查失败", async () => { throw new Error("inspect failed"); }],
  ])("does not offer Worktree for %s", async (_label, inspect) => {
    const local = context("LOCAL");
    const api = workspaceApi({ local, worktree: context("WORKTREE") });
    vi.mocked(api.inspect).mockImplementation(inspect);
    const onChange = vi.fn();

    render(
      <DraftEnvironmentPicker
        api={api}
        workspacePath="F:/project/lumora"
        value={{ target: "LOCAL" }}
        onChange={onChange}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Local/ }));
    const worktreeOption = await screen.findByRole("menuitemradio", {
      name: /新建 Worktree/,
    });
    expect(worktreeOption).toBeDisabled();
    expect(screen.getByText(/当前项目不是 Git 仓库/)).toBeInTheDocument();
    fireEvent.click(worktreeOption);
    expect(onChange).not.toHaveBeenCalled();
  });
});

function workspaceApi({
  local,
  worktree,
}: {
  local: WorkspaceContext;
  worktree: WorkspaceContext;
}): LumoraWorkspaceApi {
  return {
    inspect: vi.fn(async () => local),
    handoff: vi.fn(async () => worktree),
    listBranches: vi.fn(async () => local.branches),
    checkoutBranch: vi.fn(async () => local),
    createBranch: vi.fn(async () => local),
    listHistory: vi.fn(async () => ({
      commits: [{
        sha: "abc123456789",
        shortSha: "abc1234",
        summary: "建立工作环境协调器",
        authorName: "Lumora",
        authoredAt: "2026-08-23T00:00:00Z",
      }],
    })),
    getChanges: vi.fn(),
    listWorktrees: vi.fn(async () => []),
    removeWorktree: vi.fn(async () => []),
    pruneWorktrees: vi.fn(async () => []),
    setWorktreeAutoApply: vi.fn(async () => ({
      ...worktree,
      environment: { ...worktree.environment, autoApplyWhenClean: true },
    })),
  };
}

function context(mode: "LOCAL" | "WORKTREE"): WorkspaceContext {
  const worktree = mode === "WORKTREE";
  return {
    workspaceRevision: worktree ? 8 : 7,
    repositoryRoot: "F:/project/lumora",
    sourceWorkspacePath: "F:/project/lumora",
    effectiveWorkspacePath: worktree
      ? "F:/worktrees/task-1"
      : "F:/project/lumora",
    environment: {
      mode,
      label: worktree ? "Task task-1" : "Local",
      path: worktree ? "F:/worktrees/task-1" : "F:/project/lumora",
      current: true,
      autoApplyWhenClean: false,
      settingsRevision: 3,
      managedByLumora: true,
      canAutoApply: true,
    },
    branch: { name: "main", current: true, headSha: "abcdef123" },
    headSha: "abcdef123",
    detached: false,
    status: {
      clean: true,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      conflicted: 0,
    },
    worktrees: [],
    branches: [
      { name: "main", current: true, headSha: "abcdef123" },
      { name: "feature/auth", current: false, headSha: "123456abc" },
    ],
  };
}
