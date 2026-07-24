import { contextBridge, ipcRenderer } from "electron";

import type {
  ApprovalDecisionInput,
  LumoraApi,
  TaskEvent,
} from "../shared/task-contract";
import {
  validateApprovalDecisionInput,
  validateGoal,
  validateTaskId,
} from "../shared/validation";

const api: LumoraApi = {
  tasks: {
    create: (goal) => ipcRenderer.invoke("tasks:create", validateGoal(goal)),
    get: (taskId) => ipcRenderer.invoke("tasks:get", validateTaskId(taskId)),
    subscribe: (untrustedTaskId, onEvent) => {
      const taskId = validateTaskId(untrustedTaskId);
      if (typeof onEvent !== "function") {
        throw new TypeError("任务事件处理器必须是函数");
      }
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
      ipcRenderer.invoke(
        "tasks:decide-approval",
        validateApprovalDecisionInput(input),
      ),
  },
};

// 只暴露具体业务动作，不把 ipcRenderer 或任意 channel 交给页面。
contextBridge.exposeInMainWorld("lumora", api);
