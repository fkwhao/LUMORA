import path from "node:path";
import { app, BrowserWindow, shell } from "electron";

import { registerTaskIpc } from "./ipc";
import { RestTaskGateway } from "./rest-task-gateway";
import type { TaskGateway } from "./task-gateway";
import { createMainWindowOptions } from "./window-options";
import { WindowReference } from "./window-reference";
import {
  loadDevConfig,
  type DevConfig,
} from "./config/dev-config";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const gateway = createTaskGateway(
  loadDevConfig(path.resolve("config/dev-local.yml")),
);
// BrowserWindow 必须保留强引用，否则窗口可能在函数返回后被垃圾回收。
const mainWindow = new WindowReference<BrowserWindow>();
let unregisterIpc: (() => void) | undefined;

async function createWindow(): Promise<BrowserWindow> {
  const preloadPath = path.join(__dirname, "preload.js");
  const window = new BrowserWindow(createMainWindowOptions(preloadPath));

  // 导航白名单阻止远程页面获得本应用的 Preload 能力。
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(
      path.join(
        __dirname,
        `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
      ),
    );
  }
  window.once("ready-to-show", () => window.show());
  mainWindow.set(window);
  return window;
}

app.whenReady().then(async () => {
  unregisterIpc = registerTaskIpc(gateway);
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  unregisterIpc?.();
  gateway.dispose();
});

export function createTaskGateway(config: DevConfig): TaskGateway {
  return new RestTaskGateway({
    baseUrl: config.coreUrl,
    sessionToken: config.startupToken,
  });
}
