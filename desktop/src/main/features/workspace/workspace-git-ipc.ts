import { ipcMain } from "electron";

import type {
  CreateGitBranchInput,
  GetGitChangesInput,
  GitCheckoutInput,
  GitHistoryInput,
  InspectWorkspaceInput,
  ListWorktreesInput,
  RemoveWorktreeInput,
  SetWorktreeAutoApplyInput,
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

const channels = {
  inspect: "workspace-git:inspect",
  handoff: "workspace-git:handoff",
  listBranches: "workspace-git:list-branches",
  checkoutBranch: "workspace-git:checkout-branch",
  createBranch: "workspace-git:create-branch",
  listHistory: "workspace-git:list-history",
  getChanges: "workspace-git:get-changes",
  listWorktrees: "workspace-git:list-worktrees",
  removeWorktree: "workspace-git:remove-worktree",
  pruneWorktrees: "workspace-git:prune-worktrees",
  setWorktreeAutoApply: "workspace-git:set-worktree-auto-apply",
} as const;

export function registerWorkspaceGitIpc(gateway: WorkspaceGateway): () => void {
  ipcMain.handle(channels.inspect, (_event, input: InspectWorkspaceInput) =>
    gateway.inspect(validateInspectWorkspaceInput(input)));
  ipcMain.handle(channels.handoff, (_event, input: WorkspaceHandoffInput) =>
    gateway.handoff(validateWorkspaceHandoffInput(input)));
  ipcMain.handle(channels.listBranches, (_event, taskId: string) =>
    gateway.listBranches(validateTaskId(taskId)));
  ipcMain.handle(channels.checkoutBranch, (_event, input: GitCheckoutInput) =>
    gateway.checkoutBranch(validateGitCheckoutInput(input)));
  ipcMain.handle(channels.createBranch, (_event, input: CreateGitBranchInput) =>
    gateway.createBranch(validateCreateGitBranchInput(input)));
  ipcMain.handle(channels.listHistory, (_event, input: GitHistoryInput) =>
    gateway.listHistory(validateGitHistoryInput(input)));
  ipcMain.handle(channels.getChanges, (_event, input: GetGitChangesInput) =>
    gateway.getChanges(validateGetGitChangesInput(input)));
  ipcMain.handle(channels.listWorktrees, (_event, input: ListWorktreesInput) =>
    gateway.listWorktrees(validateListWorktreesInput(input)));
  ipcMain.handle(channels.removeWorktree, (_event, input: RemoveWorktreeInput) =>
    gateway.removeWorktree(validateRemoveWorktreeInput(input)));
  ipcMain.handle(channels.pruneWorktrees, (_event, input: ListWorktreesInput) =>
    gateway.pruneWorktrees(validateListWorktreesInput(input)));
  ipcMain.handle(
    channels.setWorktreeAutoApply,
    (_event, input: SetWorktreeAutoApplyInput) =>
      gateway.setWorktreeAutoApply(validateSetWorktreeAutoApplyInput(input)),
  );

  return () => {
    for (const channel of Object.values(channels)) {
      ipcMain.removeHandler(channel);
    }
  };
}

export { channels as workspaceGitIpcChannels };
