// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    electron.handlers.set(channel, handler);
  }),
  removeHandler: vi.fn((channel: string) => {
    electron.handlers.delete(channel);
  }),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: electron.handle,
    removeHandler: electron.removeHandler,
  },
}));

import { registerWorkspaceGitIpc } from "../../src/main/workspace-git-ipc";
import type { WorkspaceGateway } from "../../src/main/workspace-gateway";

describe("workspace Git IPC", () => {
  beforeEach(() => {
    electron.handlers.clear();
    electron.handle.mockClear();
    electron.removeHandler.mockClear();
  });

  it("exposes only bounded workspace actions and validates Handoff input", async () => {
    const handoff = vi.fn(async () => ({ workspaceRevision: 9 }));
    const gateway = {
      inspect: vi.fn(),
      handoff,
      listBranches: vi.fn(),
      checkoutBranch: vi.fn(),
      createBranch: vi.fn(),
      listHistory: vi.fn(),
      getChanges: vi.fn(),
      listWorktrees: vi.fn(),
      removeWorktree: vi.fn(),
      pruneWorktrees: vi.fn(),
      setWorktreeAutoApply: vi.fn(),
    } as unknown as WorkspaceGateway;

    const unregister = registerWorkspaceGitIpc(gateway);
    const handler = electron.handlers.get("workspace-git:handoff");
    expect(handler).toBeTypeOf("function");

    await handler?.({}, {
      taskId: "task-1",
      target: "EXISTING_WORKTREE",
      worktreePath: " F:\\worktrees\\auth ",
      expectedRevision: 8,
    });
    expect(handoff).toHaveBeenCalledWith({
      taskId: "task-1",
      target: "EXISTING_WORKTREE",
      worktreePath: "F:\\worktrees\\auth",
      expectedRevision: 8,
    });

    expect(() => handler?.({}, {
      taskId: "../task",
      target: "LOCAL",
    })).toThrow("任务 ID 格式无效");

    unregister();
    expect(electron.handlers.size).toBe(0);
  });
});
