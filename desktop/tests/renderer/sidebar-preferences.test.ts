import { describe, expect, it } from "vitest";

import {
  clampSidebarWidth,
  shouldCollapseSidebarOnDrag,
} from "../../src/renderer/features/layout/sidebar-preferences";
import {
  clampContextPaneWidth,
  loadContextPaneWidth,
  saveContextPaneWidth,
  shouldCollapseContextPaneOnDrag,
  shouldExpandContextPaneOnDrag,
} from "../../src/renderer/features/layout/context-pane-preferences";
import {
  DEFAULT_CONTEXT_PANE_WIDTH,
  MAX_CONTEXT_PANE_WIDTH,
  MIN_CONTEXT_PANE_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from "../../src/renderer/constants/layout";
import { CONTEXT_PANE_WIDTH_STORAGE_KEY } from "../../src/renderer/constants/storage";

describe("sidebar resize boundaries", () => {
  it("protects the brand row and collapses only beyond the drag threshold", () => {
    expect(MIN_SIDEBAR_WIDTH).toBe(232);
    expect(clampSidebarWidth(210)).toBe(232);
    expect(shouldCollapseSidebarOnDrag(220)).toBe(false);
    expect(shouldCollapseSidebarOnDrag(204)).toBe(true);
  });

  it("persists the right context pane width within its drag boundaries", () => {
    localStorage.removeItem(CONTEXT_PANE_WIDTH_STORAGE_KEY);
    expect(loadContextPaneWidth()).toBe(DEFAULT_CONTEXT_PANE_WIDTH);
    expect(clampContextPaneWidth(200)).toBe(MIN_CONTEXT_PANE_WIDTH);
    expect(clampContextPaneWidth(900)).toBe(MAX_CONTEXT_PANE_WIDTH);
    expect(shouldCollapseContextPaneOnDrag(332)).toBe(true);
    expect(shouldCollapseContextPaneOnDrag(333)).toBe(false);
    expect(shouldExpandContextPaneOnDrag(72)).toBe(false);
    expect(shouldExpandContextPaneOnDrag(73)).toBe(true);

    saveContextPaneWidth(618.4);

    expect(loadContextPaneWidth()).toBe(618);
    localStorage.removeItem(CONTEXT_PANE_WIDTH_STORAGE_KEY);
  });
});
