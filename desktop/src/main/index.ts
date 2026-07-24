import path from "node:path";
import { app, BrowserWindow, shell } from "electron";

import { registerTaskIpc } from "./ipc";
import { RestTaskGateway } from "./rest-task-gateway";
import { DemoTaskGateway, type TaskGateway } from "./task-gateway";
import { createMainWindowOptions } from "./window-options";
import { WindowReference } from "./window-reference";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const gateway = createTaskGateway();
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

function createTaskGateway(): TaskGateway {
  const baseUrl = process.env.LUMORA_CORE_URL;
  const sessionToken = process.env.LUMORA_STARTUP_TOKEN;
  if (baseUrl && sessionToken) {
    return new RestTaskGateway({ baseUrl, sessionToken });
  }

  // Java 未启动时保留可演示界面的开发降级，生产通信只使用 REST/SSE。
  return new DemoTaskGateway();
}
