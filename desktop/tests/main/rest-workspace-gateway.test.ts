// @vitest-environment node

import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { RestWorkspaceGateway } from "../../src/main/rest-workspace-gateway";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>(
    (resolve, reject) => server.close((error) => error ? reject(error) : resolve()),
  )));
});

describe("Java REST workspace gateway", () => {
  it("inspects the selected workspace through the authenticated boundary", async () => {
    let requestPath = "";
    let requestBody = "";
    let authorization = "";
    const response = workspaceContext();
    const baseUrl = await listen(async (request) => {
      requestPath = request.url ?? "";
      requestBody = await readBody(request);
      authorization = request.headers.authorization ?? "";
      return response;
    });
    const gateway = new RestWorkspaceGateway({
      baseUrl,
      sessionToken: "workspace-token",
    });

    const context = await gateway.inspect({
      workspacePath: "F:\\project\\lumora",
      taskId: "task-1",
    });

    expect(requestPath).toBe("/api/v1/workspaces/inspect");
    expect(authorization).toBe("Bearer workspace-token");
    expect(JSON.parse(requestBody)).toEqual({
      workspacePath: "F:\\project\\lumora",
      taskId: "task-1",
    });
    expect(context.workspaceRevision).toBe(7);
  });

  it("forwards Handoff and optimistic Worktree settings revisions", async () => {
    const requests: Array<{ method: string; path: string; body: unknown }> = [];
    const baseUrl = await listen(async (request) => {
      requests.push({
        method: request.method ?? "",
        path: request.url ?? "",
        body: JSON.parse(await readBody(request) || "{}"),
      });
      return workspaceContext("WORKTREE");
    });
    const gateway = new RestWorkspaceGateway({ baseUrl, sessionToken: "token" });

    await gateway.handoff({
      taskId: "task-1",
      target: "EXISTING_WORKTREE",
      worktreePath: "F:\\worktrees\\auth",
      expectedRevision: 7,
    });
    await gateway.setWorktreeAutoApply({
      taskId: "task-1",
      enabled: true,
      expectedSettingsRevision: 3,
    });

    expect(requests).toEqual([
      {
        method: "POST",
        path: "/api/v1/tasks/task-1/workspace/handoff",
        body: {
          target: "EXISTING_WORKTREE",
          worktreePath: "F:\\worktrees\\auth",
          expectedRevision: 7,
        },
      },
      {
        method: "PUT",
        path: "/api/v1/tasks/task-1/workspace/worktree-settings",
        body: {
          autoApplyWhenClean: true,
          expectedSettingsRevision: 3,
        },
      },
    ]);
  });

  it("queries concrete commit and branch comparison ranges without checkout", async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    const baseUrl = await listen(async (request) => {
      requests.push({
        path: request.url ?? "",
        body: JSON.parse(await readBody(request) || "{}"),
      });
      return {
        scope: "COMMIT",
        commitSha: "abc123",
        label: "abc123",
        repositoryRoot: "F:/project/lumora",
        reason: "",
        additions: 2,
        deletions: 1,
        files: [],
      };
    });
    const gateway = new RestWorkspaceGateway({ baseUrl, sessionToken: "token" });

    await gateway.getChanges({
      taskId: "task-1",
      scope: { scope: "COMMIT", commitSha: "abc123" },
    });
    await gateway.getChanges({
      taskId: "task-1",
      scope: { scope: "BRANCH_COMPARE", baseRef: "main", headRef: "feature" },
    });

    expect(requests).toEqual([
      {
        path: "/api/v1/tasks/task-1/git/changes",
        body: { scope: "COMMIT", commitSha: "abc123" },
      },
      {
        path: "/api/v1/tasks/task-1/git/changes",
        body: {
          scope: "BRANCH_COMPARE",
          baseRef: "main",
          headRef: "feature",
        },
      },
    ]);
  });
});

function workspaceContext(mode: "LOCAL" | "WORKTREE" = "LOCAL") {
  return {
    workspaceRevision: 7,
    repositoryRoot: "F:/project/lumora",
    sourceWorkspacePath: "F:/project/lumora",
    effectiveWorkspacePath: mode === "LOCAL"
      ? "F:/project/lumora"
      : "F:/worktrees/auth",
    environment: {
      mode,
      label: mode === "LOCAL" ? "Local" : "Auth",
      path: mode === "LOCAL" ? "F:/project/lumora" : "F:/worktrees/auth",
      autoApplyWhenClean: false,
      settingsRevision: 3,
    },
    branch: { name: "main", current: true },
    headSha: "abcdef123456",
    detached: false,
    status: {
      clean: true,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      conflicted: 0,
    },
    worktrees: [],
    branches: [{ name: "main", current: true }],
  };
}

async function listen(
  handler: (request: IncomingMessage) => Promise<unknown>,
): Promise<string> {
  const server = createServer(async (request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(await handler(request)));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
