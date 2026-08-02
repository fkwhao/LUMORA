import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from "../../constants/layout";
import {
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from "../../constants/storage";

export function loadSidebarWidth(): number {
  try {
    const stored = Number(
      globalThis.localStorage?.getItem(SIDEBAR_WIDTH_STORAGE_KEY),
    );
    return Number.isFinite(stored)
      ? clampSidebarWidth(stored)
      : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

export function saveSidebarWidth(width: number): void {
  try {
    globalThis.localStorage?.setItem(
      SIDEBAR_WIDTH_STORAGE_KEY,
      String(clampSidebarWidth(width)),
    );
  } catch {
    // 存储不可用时仍保留当前会话中的宽度。
  }
}

export function loadSidebarCollapsed(): boolean {
  try {
    return (
      globalThis.localStorage?.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) ===
      "true"
    );
  } catch {
    return false;
  }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    globalThis.localStorage?.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      String(collapsed),
    );
  } catch {
    // 存储不可用时仍保留当前会话中的折叠状态。
  }
}

export function clampSidebarWidth(width: number): number {
  return Math.min(
    MAX_SIDEBAR_WIDTH,
    Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)),
  );
}
