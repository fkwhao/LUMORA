import type { JavaConnection } from "../../core/java-connection";
import { validateJavaConnection } from "../../core/java-connection";
import type {
  CreateGitBranchInput,
  GetGitChangesInput,
  GitBranchSummary,
  GitCheckoutInput,
  GitHistoryInput,
  GitHistoryPage,
  GitReviewChanges,
  InspectWorkspaceInput,
  ListWorktreesInput,
  RemoveWorktreeInput,
  SetWorktreeAutoApplyInput,
  WorkspaceContext,
  WorkspaceEnvironmentSummary,
  WorkspaceHandoffInput,
} from "../../../shared/workspace-contract";
import {
  validateCreateGitBranchInput,
  validateGetGitChangesInput,
  validateGitCheckoutInput,
  validateGitHistoryInput,
  validateInspectWorkspaceInput,
  validateListWorktreesInput,
  validateRemoveWorktreeInput,
  validateSetWorktreeAutoApplyInput,
  validateTaskId,
  validateWorkspaceHandoffInput,
} from "../../../shared/validation";
import type { WorkspaceGateway } from "./workspace-gateway";

type JavaError = { message?: string };

export class RestWorkspaceGateway implements WorkspaceGateway {
  private readonly connection: JavaConnection;

  constructor(
    connection: JavaConnection,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.connection = validateJavaConnection(connection);
  }

  inspect(input: InspectWorkspaceInput): Promise<WorkspaceContext> {
    return this.request("/api/v1/workspaces/inspect", {
      method: "POST",
      body: JSON.stringify(validateInspectWorkspaceInput(input)),
    });
  }

  handoff(input: WorkspaceHandoffInput): Promise<WorkspaceContext> {
    const value = validateWorkspaceHandoffInput(input);
    return this.request(`/api/v1/tasks/${encodeURIComponent(value.taskId)}/workspace/handoff`, {
      method: "POST",
      body: JSON.stringify({
        target: value.target,
        worktreePath: value.worktreePath,
        expectedRevision: value.expectedRevision,
      }),
    }, 90_000);
  }

  listBranches(taskId: string): Promise<GitBranchSummary[]> {
    const id = validateTaskId(taskId);
    return this.request(`/api/v1/tasks/${encodeURIComponent(id)}/git/branches`);
  }

  checkoutBranch(input: GitCheckoutInput): Promise<WorkspaceContext> {
    const value = validateGitCheckoutInput(input);
    return this.request(`/api/v1/tasks/${encodeURIComponent(value.taskId)}/git/checkout`, {
      method: "POST",
      body: JSON.stringify({
        branchName: value.branchName,
        expectedHead: value.expectedHead,
        expectedRevision: value.expectedRevision,
      }),
    }, 60_000);
  }

  createBranch(input: CreateGitBranchInput): Promise<WorkspaceContext> {
    const value = validateCreateGitBranchInput(input);
    return this.request(`/api/v1/tasks/${encodeURIComponent(value.taskId)}/git/branches`, {
      method: "POST",
      body: JSON.stringify({
        branchName: value.branchName,
        startPoint: value.startPoint,
        checkout: value.checkout,
        expectedRevision: value.expectedRevision,
      }),
    }, 60_000);
  }

  listHistory(input: GitHistoryInput): Promise<GitHistoryPage> {
    const value = validateGitHistoryInput(input);
    const query = new URLSearchParams({ limit: String(value.limit ?? 30) });
    if (value.cursor) query.set("cursor", value.cursor);
    return this.request(
      `/api/v1/tasks/${encodeURIComponent(value.taskId)}/git/history?${query}`,
    );
  }

  getChanges(input: GetGitChangesInput): Promise<GitReviewChanges> {
    const value = validateGetGitChangesInput(input);
    return this.request(`/api/v1/tasks/${encodeURIComponent(value.taskId)}/git/changes`, {
      method: "POST",
      body: JSON.stringify(value.scope),
    }, 30_000);
  }

  listWorktrees(input: ListWorktreesInput): Promise<WorkspaceEnvironmentSummary[]> {
    const value = validateListWorktreesInput(input);
    return this.request(`/api/v1/tasks/${encodeURIComponent(value.taskId)}/git/worktrees`);
  }

  removeWorktree(input: RemoveWorktreeInput): Promise<WorkspaceEnvironmentSummary[]> {
    const value = validateRemoveWorktreeInput(input);
    return this.request(`/api/v1/tasks/${encodeURIComponent(value.taskId)}/git/worktrees`, {
      method: "DELETE",
      body: JSON.stringify({ worktreePath: value.worktreePath }),
    }, 60_000);
  }

  pruneWorktrees(input: ListWorktreesInput): Promise<WorkspaceEnvironmentSummary[]> {
    const value = validateListWorktreesInput(input);
    return this.request(`/api/v1/tasks/${encodeURIComponent(value.taskId)}/git/worktrees/prune`, {
      method: "POST",
    }, 60_000);
  }

  setWorktreeAutoApply(input: SetWorktreeAutoApplyInput): Promise<WorkspaceContext> {
    const value = validateSetWorktreeAutoApplyInput(input);
    return this.request(`/api/v1/tasks/${encodeURIComponent(value.taskId)}/workspace/worktree-settings`, {
      method: "PUT",
      body: JSON.stringify({
        autoApplyWhenClean: value.enabled,
        expectedSettingsRevision: value.expectedSettingsRevision,
      }),
    });
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    timeout = 10_000,
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.connection.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.connection.sessionToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) {
      const error = await readJavaError(response);
      throw new Error(error.message ?? `Java Core 请求失败: HTTP ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

async function readJavaError(response: Response): Promise<JavaError> {
  try {
    return (await response.json()) as JavaError;
  } catch {
    return {};
  }
}
