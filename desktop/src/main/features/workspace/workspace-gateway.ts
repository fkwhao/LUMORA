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

export interface WorkspaceGateway {
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
