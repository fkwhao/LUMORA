import { ipcMain, type WebContents } from "electron";

import type {
  ApprovalDecisionInput,
  TaskPreferencesInput,
  TaskWorkspaceInput,
} from "../shared/task-contract";
import type { TaskGateway } from "./task-gateway";
import {
  validateApprovalDecisionInput,
  validateGoal,
  validateTaskId,
  validateTaskPreferencesInput,
  validateTaskWorkspaceInput,
  validateWorkspacePath,
} from "../shared/validation";

const channels = {
  create: "tasks:create",
  list: "tasks:list",
  get: "tasks:get",
  updatePreferences: "tasks:update-preferences",
  updateWorkspace: "tasks:update-workspace",
  decideApproval: "tasks:decide-approval",
  subscribe: "tasks:subscribe",
  unsubscribe: "tasks:unsubscribe",
  event: "tasks:event",
} as const;

export function registerTaskIpc(gateway: TaskGateway): () => void {
  const subscriptions = new Map<string, () => void>();

  ipcMain.handle(channels.create, (
    _event,
    goal: unknown,
    workspacePath: unknown,
  ) =>
    gateway.create(
      validateGoal(goal),
      validateWorkspacePath(workspacePath),
    ),
  );
  ipcMain.handle(channels.list, () => gateway.list());
  ipcMain.handle(channels.get, (_event, taskId: unknown) =>
    gateway.get(validateTaskId(taskId)),
  );
  ipcMain.handle(
    channels.updatePreferences,
    (_event, input: TaskPreferencesInput) =>
      gateway.updatePreferences(validateTaskPreferencesInput(input)),
  );
  ipcMain.handle(
    channels.updateWorkspace,
    (_event, input: TaskWorkspaceInput) =>
      gateway.updateWorkspace(validateTaskWorkspaceInput(input)),
  );
  ipcMain.handle(
    channels.decideApproval,
    (_event, input: ApprovalDecisionInput) =>
      gateway.decideApproval(validateApprovalDecisionInput(input)),
  );

  ipcMain.on(channels.subscribe, (event, untrustedTaskId: unknown) => {
    // Send-style IPC cannot return validation errors to the renderer. Ignore malformed
    // subscription messages here so untrusted input cannot become a Main-process crash.
    const taskId = tryValidateTaskId(untrustedTaskId);
    if (!taskId) {
      return;
    }
    const key = subscriptionKey(event.sender, taskId);
    subscriptions.get(key)?.();
    subscriptions.set(
      key,
      gateway.subscribe(taskId, (taskEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(channels.event, taskEvent);
        }
      }),
    );
  });

  ipcMain.on(channels.unsubscribe, (event, untrustedTaskId: unknown) => {
    const taskId = tryValidateTaskId(untrustedTaskId);
    if (!taskId) {
      return;
    }
    const key = subscriptionKey(event.sender, taskId);
    subscriptions.get(key)?.();
    subscriptions.delete(key);
  });

  return () => {
    ipcMain.removeHandler(channels.create);
    ipcMain.removeHandler(channels.list);
    ipcMain.removeHandler(channels.get);
    ipcMain.removeHandler(channels.updatePreferences);
    ipcMain.removeHandler(channels.updateWorkspace);
    ipcMain.removeHandler(channels.decideApproval);
    ipcMain.removeAllListeners(channels.subscribe);
    ipcMain.removeAllListeners(channels.unsubscribe);
    for (const unsubscribe of subscriptions.values()) {
      unsubscribe();
    }
    subscriptions.clear();
  };
}

function subscriptionKey(webContents: WebContents, taskId: string): string {
  return `${webContents.id}:${taskId}`;
}

function tryValidateTaskId(input: unknown): string | undefined {
  try {
    return validateTaskId(input);
  } catch {
    return undefined;
  }
}

export { channels as taskIpcChannels };
