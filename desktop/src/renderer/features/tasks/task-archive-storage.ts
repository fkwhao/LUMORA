import {
  ARCHIVED_TASK_IDS_STORAGE_KEY,
  DELETED_TASK_IDS_STORAGE_KEY,
} from "../../constants/storage";

export function loadArchivedTaskIds(): string[] {
  return loadTaskIds(ARCHIVED_TASK_IDS_STORAGE_KEY);
}

export function loadDeletedTaskIds(): string[] {
  return loadTaskIds(DELETED_TASK_IDS_STORAGE_KEY);
}

export function saveArchivedTaskIds(taskIds: string[]): void {
  saveTaskIds(ARCHIVED_TASK_IDS_STORAGE_KEY, taskIds);
}

export function saveDeletedTaskIds(taskIds: string[]): void {
  saveTaskIds(DELETED_TASK_IDS_STORAGE_KEY, taskIds);
}

function loadTaskIds(storageKey: string): string[] {
  try {
    const value = globalThis.localStorage?.getItem(storageKey);
    if (!value) {
      return [];
    }
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    // 本地数据损坏或浏览器禁用存储时，归档功能退化为空列表。
    return [];
  }
}

function saveTaskIds(storageKey: string, taskIds: string[]): void {
  try {
    globalThis.localStorage?.setItem(
      storageKey,
      JSON.stringify([...new Set(taskIds)]),
    );
  } catch {
    // 归档不会影响任务主体数据，存储不可用时保持当前内存状态即可。
  }
}
