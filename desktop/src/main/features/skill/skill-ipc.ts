import { BrowserWindow, dialog, ipcMain, shell } from "electron";

import type { SkillInstallScope } from "../../../shared/skill-contract";

import { SkillService } from "./skill-service";

export const skillIpcChannels = {
  list: "skill:list",
  setEnabled: "skill:set-enabled",
  openDirectory: "skill:open-directory",
  installFromDirectory: "skill:install-from-directory",
} as const;

export function registerSkillIpc(service = new SkillService()): () => void {
  ipcMain.handle(skillIpcChannels.list, (_event, workspacePath?: string) =>
    service.list(typeof workspacePath === "string" && workspacePath.trim() ? workspacePath : undefined));
  ipcMain.handle(skillIpcChannels.setEnabled, (_event, name: string, enabled: boolean) => {
    if (typeof enabled !== "boolean") throw new TypeError("Skill 开关必须是布尔值");
    return service.setEnabled(name, enabled);
  });
  ipcMain.handle(skillIpcChannels.openDirectory, async (_event, scope: SkillInstallScope, workspacePath?: string) => {
    const directory = await service.directory(requireScope(scope), workspacePath);
    const error = await shell.openPath(directory);
    if (error) throw new Error("Skill 目录打开失败");
  });
  ipcMain.handle(skillIpcChannels.installFromDirectory, async (event, scope: SkillInstallScope, workspacePath?: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: "选择包含 SKILL.md 的文件夹",
      buttonLabel: "添加 Skill",
      properties: ["openDirectory"],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const selectedPath = result.filePaths[0];
    if (result.canceled || !selectedPath) return undefined;
    return service.installFromDirectory(selectedPath, requireScope(scope), workspacePath);
  });
  return () => Object.values(skillIpcChannels).forEach((channel) => ipcMain.removeHandler(channel));
}

function requireScope(scope: SkillInstallScope): SkillInstallScope {
  if (scope !== "user" && scope !== "project") throw new TypeError("Skill 安装范围无效");
  return scope;
}
