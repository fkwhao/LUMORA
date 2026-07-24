import { contextBridge, ipcRenderer } from "electron";

import type {
  ApprovalDecisionInput,
  LumoraApi,
  TaskEvent,
} from "../shared/task-contract";

const api: LumoraApi = {
  tasks: {
    create: (goal) => ipcRenderer.invoke("tasks:create", goal),
    get: (taskId) => ipcRenderer.invoke("tasks:get", taskId),
    subscribe: (taskId, onEvent) => {
      const listener = (_event: Electron.IpcRendererEvent, event: TaskEvent) => {
        if (event.taskId === taskId) {
          onEvent(event);
        }
      };
      ipcRenderer.on("tasks:event", listener);
      ipcRenderer.send("tasks:subscribe", taskId);

      return () => {
        ipcRenderer.removeListener("tasks:event", listener);
        ipcRenderer.send("tasks:unsubscribe", taskId);
      };
    },
    decideApproval: (input: ApprovalDecisionInput) =>
      ipcRenderer.invoke("tasks:decide-approval", input),
  },
};

// 只暴露具体业务动作，不把 ipcRenderer 或任意 channel 交给页面。
contextBridge.exposeInMainWorld("lumora", api);

