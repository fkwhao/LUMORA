import { describe, expect, it } from "vitest";

import {
  clampSidebarWidth,
  shouldCollapseSidebarOnDrag,
} from "../../src/renderer/features/layout/sidebar-preferences";
import { MIN_SIDEBAR_WIDTH } from "../../src/renderer/constants/layout";

describe("sidebar resize boundaries", () => {
  it("protects the brand row and collapses only beyond the drag threshold", () => {
    expect(MIN_SIDEBAR_WIDTH).toBe(232);
    expect(clampSidebarWidth(210)).toBe(232);
    expect(shouldCollapseSidebarOnDrag(220)).toBe(false);
    expect(shouldCollapseSidebarOnDrag(204)).toBe(true);
  });
});
