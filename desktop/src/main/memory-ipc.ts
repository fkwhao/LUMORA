import { ipcMain } from "electron";

import type { MemoryGateway } from "./memory-gateway";

export const memoryIpcChannels = {
  getSettings: "memory:get-settings",
  updateSettings: "memory:update-settings",
  reset: "memory:reset",
} as const;

export function registerMemoryIpc(gateway: MemoryGateway): () => void {
  ipcMain.handle(
    memoryIpcChannels.getSettings,
    () => gateway.getSettings(),
  );
  ipcMain.handle(
    memoryIpcChannels.updateSettings,
    (_event, enabled: unknown) =>
      gateway.updateSettings(requireBoolean(enabled)),
  );
  ipcMain.handle(memoryIpcChannels.reset, () => gateway.reset());

  return () => {
    ipcMain.removeHandler(memoryIpcChannels.getSettings);
    ipcMain.removeHandler(memoryIpcChannels.updateSettings);
    ipcMain.removeHandler(memoryIpcChannels.reset);
  };
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError("记忆开关必须是布尔值");
  }
  return value;
}
