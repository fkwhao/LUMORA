import { ipcMain, type WebContents } from "electron";

import type { ApprovalDecisionInput } from "../shared/task-contract";
import type { TaskGateway } from "./task-gateway";

const channels = {
  create: "tasks:create",
  get: "tasks:get",
  decideApproval: "tasks:decide-approval",
  subscribe: "tasks:subscribe",
  unsubscribe: "tasks:unsubscribe",
  event: "tasks:event",
} as const;

export function registerTaskIpc(gateway: TaskGateway): () => void {
  const subscriptions = new Map<string, () => void>();

  ipcMain.handle(channels.create, (_event, goal: string) => gateway.create(goal));
  ipcMain.handle(channels.get, (_event, taskId: string) => gateway.get(taskId));
  ipcMain.handle(
    channels.decideApproval,
    (_event, input: ApprovalDecisionInput) => gateway.decideApproval(input),
  );

  ipcMain.on(channels.subscribe, (event, taskId: string) => {
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

  ipcMain.on(channels.unsubscribe, (event, taskId: string) => {
    const key = subscriptionKey(event.sender, taskId);
    subscriptions.get(key)?.();
    subscriptions.delete(key);
  });

  return () => {
    ipcMain.removeHandler(channels.create);
    ipcMain.removeHandler(channels.get);
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

export { channels as taskIpcChannels };

