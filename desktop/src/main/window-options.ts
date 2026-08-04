import type { BrowserWindowConstructorOptions } from "electron";

export interface MainWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createMainWindowOptions(
  preloadPath: string,
  bounds?: MainWindowBounds,
): BrowserWindowConstructorOptions {
  return {
    width: bounds?.width ?? 1580,
    height: bounds?.height ?? 960,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
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
