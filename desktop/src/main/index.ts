import path from "node:path";
import { app, BrowserWindow, screen, shell } from "electron";

import { registerTaskIpc } from "./ipc";
import { registerAppearanceIpc } from "./appearance-ipc";
import { registerAttachmentIpc } from "./attachment-ipc";
import { registerCitationIpc } from "./citation-ipc";
import { registerModelIpc } from "./model-ipc";
import { registerMemoryIpc } from "./memory-ipc";
import { registerMcpIpc } from "./mcp-ipc";
import { registerSkillIpc } from "./skill-ipc";
import { registerWorkspaceIpc } from "./workspace-ipc";
import { registerWorkspaceGitIpc } from "./workspace-git-ipc";
import { RestModelGateway } from "./rest-model-gateway";
import { RestMemoryGateway } from "./rest-memory-gateway";
import { RestMcpGateway } from "./rest-mcp-gateway";
import { RestTaskGateway } from "./rest-task-gateway";
import { RestWorkspaceGateway } from "./rest-workspace-gateway";
import type { TaskGateway } from "./task-gateway";
import { createMainWindowOptions } from "./window-options";
import {
  attachWindowStatePersistence,
  loadWindowState,
} from "./window-state";
import { WindowReference } from "./window-reference";
import {
  loadDevConfig,
  type DevConfig,
} from "./config/dev-config";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// 明确启用 Chromium 高 DPI 支持；实际缩放比例仍跟随 Windows 显示设置，
// 避免强制固定比例导致 125% / 150% 屏幕上的界面尺寸失真。
app.commandLine.appendSwitch("high-dpi-support", "1");
app.commandLine.appendSwitch("force-color-profile", "srgb");

const devConfig = loadDevConfig(path.resolve("config/dev-local.yml"));
const gateway = createTaskGateway(devConfig);
const modelGateway = new RestModelGateway(
  {
    baseUrl: devConfig.coreUrl,
    sessionToken: devConfig.startupToken,
  },
);
const memoryGateway = new RestMemoryGateway({
  baseUrl: devConfig.coreUrl,
  sessionToken: devConfig.startupToken,
});
const mcpGateway = new RestMcpGateway({
  baseUrl: devConfig.coreUrl,
  sessionToken: devConfig.startupToken,
});
const workspaceGateway = new RestWorkspaceGateway({
  baseUrl: devConfig.coreUrl,
  sessionToken: devConfig.startupToken,
});
// BrowserWindow 必须保留强引用，否则窗口可能在函数返回后被垃圾回收。
const mainWindow = new WindowReference<BrowserWindow>();
let unregisterIpc: (() => void) | undefined;
let unregisterModelIpc: (() => void) | undefined;
let unregisterMemoryIpc: (() => void) | undefined;
let unregisterMcpIpc: (() => void) | undefined;
let unregisterSkillIpc: (() => void) | undefined;
let unregisterAppearanceIpc: (() => void) | undefined;
let unregisterAttachmentIpc: (() => void) | undefined;
let unregisterCitationIpc: (() => void) | undefined;
let unregisterWorkspaceIpc: (() => void) | undefined;
let unregisterWorkspaceGitIpc: (() => void) | undefined;

async function createWindow(): Promise<BrowserWindow> {
  const preloadPath = path.join(__dirname, "preload.js");
  const windowStatePath = path.join(app.getPath("userData"), "window-state.json");
  const restoredState = loadWindowState(
    windowStatePath,
    screen.getAllDisplays().map((display) => display.workArea),
  );
  const window = new BrowserWindow(
    createMainWindowOptions(preloadPath, restoredState),
  );
  attachWindowStatePersistence(window, windowStatePath);
  if (restoredState?.maximized) window.maximize();

  // 必须在加载页面前监听；开发服务器响应很快时，ready-to-show 可能先于
  // loadURL Promise 完成，后注册监听会让 show: false 的窗口永久隐藏。
  window.once("ready-to-show", () => window.show());

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
  // 页面即使没有触发 ready-to-show，也不能让主窗口永久停留在隐藏状态。
  if (!window.isVisible()) {
    window.show();
  }
  mainWindow.set(window);
  return window;
}

app.whenReady().then(async () => {
  unregisterIpc = registerTaskIpc(gateway);
  unregisterModelIpc = registerModelIpc(modelGateway);
  unregisterMemoryIpc = registerMemoryIpc(memoryGateway);
  unregisterMcpIpc = registerMcpIpc(mcpGateway);
  unregisterSkillIpc = registerSkillIpc();
  unregisterAppearanceIpc = registerAppearanceIpc();
  unregisterAttachmentIpc = registerAttachmentIpc();
  unregisterCitationIpc = registerCitationIpc(gateway, modelGateway);
  unregisterWorkspaceIpc = registerWorkspaceIpc();
  unregisterWorkspaceGitIpc = registerWorkspaceGitIpc(workspaceGateway);
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
  unregisterModelIpc?.();
  unregisterMemoryIpc?.();
  unregisterMcpIpc?.();
  unregisterSkillIpc?.();
  unregisterAppearanceIpc?.();
  unregisterAttachmentIpc?.();
  unregisterCitationIpc?.();
  unregisterWorkspaceIpc?.();
  unregisterWorkspaceGitIpc?.();
  gateway.dispose();
});

export function createTaskGateway(config: DevConfig): TaskGateway {
  return new RestTaskGateway({
    baseUrl: config.coreUrl,
    sessionToken: config.startupToken,
  });
}
