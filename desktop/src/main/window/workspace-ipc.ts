import fs from "node:fs/promises";
import path from "node:path";
import { BrowserWindow, dialog, ipcMain } from "electron";

import type { ProjectDirectory } from "../../shared/window-contract";

const SELECT_PROJECT_DIRECTORY_CHANNEL = "workspace:select-project-directory";

/**
 * 目录选择必须由 Main 进程完成，Renderer 只能得到用户明确授权的路径。
 */
export function registerWorkspaceIpc(): () => void {
  ipcMain.handle(
    SELECT_PROJECT_DIRECTORY_CHANNEL,
    async (event): Promise<ProjectDirectory | undefined> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.OpenDialogOptions = {
        title: "选择项目文件夹",
        properties: ["openDirectory", "createDirectory"],
      };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      const selectedPath = result.filePaths[0];
      if (result.canceled || !selectedPath) {
        return undefined;
      }
      return {
        gitBranch: await readGitBranch(selectedPath),
        name: path.basename(selectedPath),
        path: selectedPath,
      };
    },
  );
  return () => ipcMain.removeHandler(SELECT_PROJECT_DIRECTORY_CHANNEL);
}

async function readGitBranch(projectPath: string): Promise<string | undefined> {
  try {
    const head = await fs.readFile(
      path.join(projectPath, ".git", "HEAD"),
      "utf8",
    );
    const referencePrefix = "ref: refs/heads/";
    return head.startsWith(referencePrefix)
      ? head.slice(referencePrefix.length).trim()
      : head.trim().slice(0, 8);
  } catch {
    return undefined;
  }
}

export { SELECT_PROJECT_DIRECTORY_CHANNEL };
