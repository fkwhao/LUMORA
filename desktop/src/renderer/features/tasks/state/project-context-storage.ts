import type { ProjectDirectory } from "../../../../shared/window-contract";
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  PROJECT_NAMES_STORAGE_KEY,
  TASK_PROJECT_PATHS_STORAGE_KEY,
} from "../../../constants/storage";

export function loadActiveProject(): ProjectDirectory | undefined {
  try {
    const value = globalThis.localStorage?.getItem(
      ACTIVE_PROJECT_STORAGE_KEY,
    );
    if (!value) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as ProjectDirectory).name === "string" &&
      typeof (parsed as ProjectDirectory).path === "string"
    ) {
      return parsed as ProjectDirectory;
    }
  } catch {
    // 损坏的本地偏好不应阻止用户创建无项目会话。
  }
  return undefined;
}

export function saveActiveProject(
  project: ProjectDirectory | undefined,
): void {
  try {
    if (!project) {
      globalThis.localStorage?.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
      return;
    }
    globalThis.localStorage?.setItem(
      ACTIVE_PROJECT_STORAGE_KEY,
      JSON.stringify(project),
    );
  } catch {
    // 项目选择仍保留在当前页面内存中。
  }
}

export function loadTaskProjectPaths(): Record<string, string> {
  try {
    const value = globalThis.localStorage?.getItem(
      TASK_PROJECT_PATHS_STORAGE_KEY,
    );
    if (!value) {
      return {};
    }
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([taskId, projectPath]) =>
          taskId.length > 0 && typeof projectPath === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function saveTaskProjectPaths(paths: Record<string, string>): void {
  try {
    globalThis.localStorage?.setItem(
      TASK_PROJECT_PATHS_STORAGE_KEY,
      JSON.stringify(paths),
    );
  } catch {
    // 项目映射只用于本地组织，写入失败不影响任务主体。
  }
}

export function loadProjectNames(): Record<string, string> {
  try {
    const value = globalThis.localStorage?.getItem(PROJECT_NAMES_STORAGE_KEY);
    if (!value) {
      return {};
    }
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([path, name]) => path.length > 0 && typeof name === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function saveProjectName(path: string, name: string): void {
  try {
    const projectNames = loadProjectNames();
    globalThis.localStorage?.setItem(
      PROJECT_NAMES_STORAGE_KEY,
      JSON.stringify({ ...projectNames, [path]: name }),
    );
  } catch {
    // 项目名称持久化失败不影响目录本身的使用。
  }
}
