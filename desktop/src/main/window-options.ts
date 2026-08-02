import type { BrowserWindowConstructorOptions } from "electron";

export function createMainWindowOptions(
  preloadPath: string,
): BrowserWindowConstructorOptions {
  return {
    width: 1580,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: "#f1f2f4",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#f1f2f4",
      symbolColor: "#555b64",
      height: 32,
    },
    webPreferences: {
      // Renderer 永远不持有 Node 能力，所有系统操作必须经过 Preload 白名单。
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  };
}
