import fs from "node:fs";
import path from "node:path";

import type { BrowserWindow, Rectangle } from "electron";

export interface PersistedWindowState extends Rectangle {
  maximized: boolean;
}

const MIN_WIDTH = 1100;
const MIN_HEIGHT = 720;
const MIN_VISIBLE_EDGE = 80;

export function loadWindowState(
  filePath: string,
  workAreas: Rectangle[],
): PersistedWindowState | undefined {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return normalizeWindowState(value, workAreas);
  } catch {
    return undefined;
  }
}

export function normalizeWindowState(
  value: unknown,
  workAreas: Rectangle[],
): PersistedWindowState | undefined {
  if (!isWindowState(value) || workAreas.length === 0) return undefined;

  const visible = workAreas.some((area) =>
    rectanglesOverlap(value, area, MIN_VISIBLE_EDGE),
  );
  if (!visible) return undefined;

  return value;
}

export function attachWindowStatePersistence(
  window: BrowserWindow,
  filePath: string,
): void {
  let timer: NodeJS.Timeout | undefined;

  const save = () => {
    if (window.isDestroyed()) return;
    const state: PersistedWindowState = {
      ...window.getNormalBounds(),
      maximized: window.isMaximized(),
    };
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(state), "utf8");
    } catch {
      // Window persistence is best effort and must never prevent app shutdown.
    }
  };
  const scheduleSave = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 180);
  };

  window.on("resize", scheduleSave);
  window.on("move", scheduleSave);
  window.on("maximize", scheduleSave);
  window.on("unmaximize", scheduleSave);
  window.on("close", () => {
    if (timer) clearTimeout(timer);
    save();
  });
}

function isWindowState(value: unknown): value is PersistedWindowState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<PersistedWindowState>;
  return (
    Number.isInteger(state.x) &&
    Number.isInteger(state.y) &&
    Number.isInteger(state.width) &&
    Number.isInteger(state.height) &&
    (state.width ?? 0) >= MIN_WIDTH &&
    (state.height ?? 0) >= MIN_HEIGHT &&
    typeof state.maximized === "boolean"
  );
}

function rectanglesOverlap(
  window: Rectangle,
  area: Rectangle,
  minimum: number,
): boolean {
  const overlapWidth = Math.min(window.x + window.width, area.x + area.width) -
    Math.max(window.x, area.x);
  const overlapHeight = Math.min(window.y + window.height, area.y + area.height) -
    Math.max(window.y, area.y);
  return overlapWidth >= minimum && overlapHeight >= minimum;
}
