// @vitest-environment node

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(async () => ({ ok: true })),
  on: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
}));

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener,
    send: electron.send,
  },
  webUtils: { getPathForFile: vi.fn(() => "") },
}));

import type { LumoraApi } from "../../src/shared/task-contract";

describe("workspace preload contract", () => {
  let api: LumoraApi;

  beforeAll(async () => {
    await import("../../src/preload/index");
    api = electron.exposeInMainWorld.mock.calls.find(
      ([name]) => name === "lumora",
    )?.[1] as LumoraApi;
  });

  beforeEach(() => {
    electron.invoke.mockClear();
  });

  it("maps concrete Git review and Handoff methods without exposing ipcRenderer", async () => {
    expect(api).toBeDefined();
    expect("invoke" in api).toBe(false);

    await api.workspace.getChanges({
      taskId: "task-1",
      scope: { scope: "BRANCH_COMPARE", baseRef: "main", headRef: "feature" },
    });
    expect(electron.invoke).toHaveBeenCalledWith(
      "workspace-git:get-changes",
      {
        taskId: "task-1",
        scope: { scope: "BRANCH_COMPARE", baseRef: "main", headRef: "feature" },
      },
    );

    await api.workspace.handoff({
      taskId: "task-1",
      target: "NEW_WORKTREE",
      expectedRevision: 4,
    });
    expect(electron.invoke).toHaveBeenCalledWith(
      "workspace-git:handoff",
      {
        taskId: "task-1",
        target: "NEW_WORKTREE",
        expectedRevision: 4,
      },
    );
  });
});
