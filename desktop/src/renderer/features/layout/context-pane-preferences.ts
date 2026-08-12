import {
  CONTEXT_PANE_COLLAPSE_DRAG_THRESHOLD,
  CONTEXT_PANE_EXPAND_DRAG_THRESHOLD,
  DEFAULT_CONTEXT_PANE_WIDTH,
  MAX_CONTEXT_PANE_WIDTH,
  MIN_CONTEXT_PANE_WIDTH,
} from "../../constants/layout";
import { CONTEXT_PANE_WIDTH_STORAGE_KEY } from "../../constants/storage";

export function loadContextPaneWidth(): number {
  try {
    const raw = globalThis.localStorage?.getItem(
      CONTEXT_PANE_WIDTH_STORAGE_KEY,
    );
    if (raw === null || raw === undefined || raw.trim() === "") {
      return DEFAULT_CONTEXT_PANE_WIDTH;
    }
    const stored = Number(raw);
    return Number.isFinite(stored)
      ? clampContextPaneWidth(stored)
      : DEFAULT_CONTEXT_PANE_WIDTH;
  } catch {
    return DEFAULT_CONTEXT_PANE_WIDTH;
  }
}

export function saveContextPaneWidth(width: number): void {
  try {
    globalThis.localStorage?.setItem(
      CONTEXT_PANE_WIDTH_STORAGE_KEY,
      String(clampContextPaneWidth(width)),
    );
  } catch {
    // 本地存储不可用时，当前会话中的宽度仍然有效。
  }
}

export function clampContextPaneWidth(width: number): number {
  return Math.min(
    MAX_CONTEXT_PANE_WIDTH,
    Math.max(MIN_CONTEXT_PANE_WIDTH, Math.round(width)),
  );
}

export function shouldCollapseContextPaneOnDrag(width: number): boolean {
  return width <= CONTEXT_PANE_COLLAPSE_DRAG_THRESHOLD;
}

export function shouldExpandContextPaneOnDrag(width: number): boolean {
  return width > CONTEXT_PANE_EXPAND_DRAG_THRESHOLD;
}
