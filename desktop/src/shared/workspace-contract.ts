import type { ConversationFileChange } from "./model-contract";

export type WorkspaceEnvironmentMode = "LOCAL" | "WORKTREE";

export type WorkspaceEnvironmentTarget =
  | "LOCAL"
  | "NEW_WORKTREE"
  | "EXISTING_WORKTREE";

export interface WorkspaceEnvironmentSelection {
  target: WorkspaceEnvironmentTarget;
  worktreePath?: string;
  autoApplyWhenClean?: boolean;
}

export interface WorkspaceEnvironmentSummary {
  mode: WorkspaceEnvironmentMode;
  label: string;
  path: string;
  worktreePath?: string;
  branchName?: string;
  headSha?: string;
  state?: string;
  current?: boolean;
  removable?: boolean;
  taskId?: string;
  autoApplyWhenClean?: boolean;
  settingsRevision?: number;
  managedByLumora?: boolean;
  canAutoApply?: boolean;
}

export interface GitBranchSummary {
  name: string;
  current: boolean;
  remote?: boolean;
  headSha?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  worktreePath?: string;
}

export interface GitCommitSummary {
  sha: string;
  shortSha: string;
  summary: string;
  authorName?: string;
  authoredAt?: string;
  parentShas?: string[];
  decorations?: string[];
}

export interface WorkspaceGitStatus {
  clean: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
  ahead?: number;
  behind?: number;
}

export interface WorkspaceContext {
  workspaceRevision: number;
  repositoryRoot: string;
  sourceWorkspacePath: string;
  effectiveWorkspacePath: string;
  environment: WorkspaceEnvironmentSummary;
  branch?: GitBranchSummary;
  headSha?: string;
  detached?: boolean;
  status: WorkspaceGitStatus;
  worktrees: WorkspaceEnvironmentSummary[];
  branches: GitBranchSummary[];
}

export interface InspectWorkspaceInput {
  workspacePath: string;
  taskId?: string;
}

export interface WorkspaceHandoffInput {
  taskId: string;
  target: WorkspaceEnvironmentTarget;
  worktreePath?: string;
  expectedRevision?: number;
}

export interface GitCheckoutInput {
  taskId: string;
  branchName: string;
  expectedHead?: string;
  expectedRevision?: number;
}

export interface CreateGitBranchInput {
  taskId: string;
  branchName: string;
  startPoint?: string;
  checkout?: boolean;
  expectedRevision?: number;
}

export interface GitHistoryInput {
  taskId: string;
  limit?: number;
  cursor?: string;
}

export interface GitHistoryPage {
  commits: GitCommitSummary[];
  nextCursor?: string;
}

export type GitReviewScopeType =
  | "LAST_RUN"
  | "UNCOMMITTED"
  | "UNSTAGED"
  | "STAGED"
  | "COMMIT"
  | "BRANCH_COMPARE";

export interface GitReviewScope {
  scope: GitReviewScopeType;
  runId?: string;
  commitSha?: string;
  baseRef?: string;
  headRef?: string;
}

export interface GetGitChangesInput {
  taskId: string;
  scope: GitReviewScope;
}

export interface GitReviewChanges {
  scope: GitReviewScopeType;
  runId?: string;
  commitSha?: string;
  label: string;
  repositoryRoot: string;
  reason: string;
  additions: number;
  deletions: number;
  files: ConversationFileChange[];
  baseRef?: string;
  headRef?: string;
  capturedAt?: string;
}

export interface ListWorktreesInput {
  taskId: string;
}

export interface RemoveWorktreeInput {
  taskId: string;
  worktreePath: string;
}

export interface SetWorktreeAutoApplyInput {
  taskId: string;
  enabled: boolean;
  expectedSettingsRevision?: number;
}

export interface LumoraWorkspaceApi {
  inspect(input: InspectWorkspaceInput): Promise<WorkspaceContext>;
  handoff(input: WorkspaceHandoffInput): Promise<WorkspaceContext>;
  listBranches(taskId: string): Promise<GitBranchSummary[]>;
  checkoutBranch(input: GitCheckoutInput): Promise<WorkspaceContext>;
  createBranch(input: CreateGitBranchInput): Promise<WorkspaceContext>;
  listHistory(input: GitHistoryInput): Promise<GitHistoryPage>;
  getChanges(input: GetGitChangesInput): Promise<GitReviewChanges>;
  listWorktrees(input: ListWorktreesInput): Promise<WorkspaceEnvironmentSummary[]>;
  removeWorktree(input: RemoveWorktreeInput): Promise<WorkspaceEnvironmentSummary[]>;
  pruneWorktrees(input: ListWorktreesInput): Promise<WorkspaceEnvironmentSummary[]>;
  setWorktreeAutoApply(input: SetWorktreeAutoApplyInput): Promise<WorkspaceContext>;
}
