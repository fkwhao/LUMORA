import { BrowserWindow, ipcMain } from "electron";

import type { ResolvedAppearanceTheme } from "../../shared/window-contract";

const APPEARANCE_CHANNEL = "window:set-appearance";

export function registerAppearanceIpc(): () => void {
  const listener = (
    event: Electron.IpcMainEvent,
    value: unknown,
  ): void => {
    if (value !== "light" && value !== "dark") {
      return;
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    applyNativeAppearance(window, value);
  };
  ipcMain.on(APPEARANCE_CHANNEL, listener);
  return () => ipcMain.removeListener(APPEARANCE_CHANNEL, listener);
}

function applyNativeAppearance(
  window: BrowserWindow | null,
  theme: ResolvedAppearanceTheme,
): void {
  if (!window) {
    return;
  }
  const dark = theme === "dark";
  window.setBackgroundColor(dark ? "#181818" : "#ffffff");
  window.setTitleBarOverlay({
    color: dark ? "#181818" : "#ffffff",
    symbolColor: dark ? "#c4c8ce" : "#555b64",
    height: 32,
  });
}

export { APPEARANCE_CHANNEL };
