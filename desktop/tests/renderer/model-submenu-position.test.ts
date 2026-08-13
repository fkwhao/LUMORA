import { describe, expect, it } from "vitest";

import { resolveModelSubmenuPlacement } from "../../src/renderer/features/tasks/state/model-submenu-position";

describe("model submenu placement", () => {
  it("opens left when the conversation has enough room", () => {
    expect(resolveModelSubmenuPlacement(
      { left: 600, right: 856 },
      { left: 100, right: 1_100 },
    )).toBe("left");
  });

  it("preserves the reasoning menu's original right-side placement", () => {
    expect(resolveModelSubmenuPlacement(
      { left: 400, right: 656 },
      { left: 100, right: 1_100 },
      "right",
    )).toBe("right");
  });

  it("does not treat an expanded context pane as the viewport boundary", () => {
    expect(resolveModelSubmenuPlacement(
      { left: 358, right: 670 },
      { left: 0, right: 1_008 },
      "right",
    )).toBe("right");
  });

  it("flips reasoning left only when its preferred right side is blocked", () => {
    expect(resolveModelSubmenuPlacement(
      { left: 600, right: 856 },
      { left: 100, right: 900 },
      "right",
    )).toBe("left");
  });

  it("falls back to the right when a left sidebar blocks the submenu", () => {
    expect(resolveModelSubmenuPlacement(
      { left: 300, right: 556 },
      { left: 100, right: 900 },
    )).toBe("right");
  });

  it("stays horizontal when the context pane leaves limited room", () => {
    expect(resolveModelSubmenuPlacement(
      { left: 280, right: 536 },
      { left: 100, right: 650 },
    )).toBe("left");
  });
});
