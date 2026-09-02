import { ipcMain, shell } from "electron";

import type {
  CloudConsoleDestination,
  CloudLoginInput,
  CloudModelSource,
} from "../../../shared/cloud-contract";
import type { CloudModelCoordinator } from "./cloud-model-coordinator";

const CHANNELS = [
  "cloud:get-state",
  "cloud:restore-session",
  "cloud:login",
  "cloud:logout",
  "cloud:get-dashboard",
  "cloud:get-model-catalog",
  "cloud:set-model-source",
  "cloud:select-cloud-model",
  "cloud:select-local-provider",
  "cloud:open-console",
] as const;

export function registerCloudIpc(
  coordinator: CloudModelCoordinator,
  consoleUrl: string,
): () => void {
  ipcMain.handle("cloud:get-state", () => coordinator.getState());
  ipcMain.handle("cloud:restore-session", () => coordinator.restoreSession());
  ipcMain.handle("cloud:login", (_event, input: CloudLoginInput) =>
    coordinator.login(validateLogin(input)));
  ipcMain.handle("cloud:logout", () => coordinator.logout());
  ipcMain.handle("cloud:get-dashboard", () => coordinator.getDashboard());
  ipcMain.handle("cloud:get-model-catalog", () => coordinator.getModelCatalog());
  ipcMain.handle("cloud:set-model-source", (_event, source: CloudModelSource) =>
    coordinator.setModelSource(validateModelSource(source)));
  ipcMain.handle("cloud:select-cloud-model", (_event, modelCode: string) =>
    coordinator.selectCloudModel(requireIdentifier(modelCode, "模型编码")));
  ipcMain.handle("cloud:select-local-provider", (_event, providerId: string) =>
    coordinator.selectLocalProvider(requireIdentifier(providerId, "供应商 ID")));
  ipcMain.handle("cloud:open-console", async (_event, destination: CloudConsoleDestination) => {
    await shell.openExternal(consoleDestination(consoleUrl, validateDestination(destination)));
  });

  return () => {
    for (const channel of CHANNELS) ipcMain.removeHandler(channel);
  };
}

function validateLogin(value: CloudLoginInput): CloudLoginInput {
  if (!value || typeof value !== "object") throw new TypeError("登录参数无效");
  const email = value.email?.trim().toLowerCase();
  if (!email || email.length > 254 || !email.includes("@")) {
    throw new TypeError("请输入有效邮箱");
  }
  if (typeof value.password !== "string" || !value.password || value.password.length > 72) {
    throw new TypeError("请输入有效密码");
  }
  return { email, password: value.password };
}

function validateModelSource(value: unknown): CloudModelSource {
  if (value !== "LOCAL_BYOK" && value !== "CLOUD_MANAGED") {
    throw new TypeError("模型来源无效");
  }
  return value;
}

function validateDestination(value: unknown): CloudConsoleDestination {
  if (value !== "home" && value !== "plans" && value !== "wallet") {
    throw new TypeError("控制台目标无效");
  }
  return value;
}

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw new TypeError(`${label}无效`);
  }
  return value.trim();
}

function consoleDestination(
  consoleUrl: string,
  destination: CloudConsoleDestination,
): string {
  const url = new URL(consoleUrl);
  const suffix = destination === "home" ? "" : `/${destination}`;
  url.pathname = `${url.pathname.replace(/\/+$/, "")}${suffix}`;
  return url.toString();
}
