import { describe, expect, it } from "vitest";

import { normalizeWindowState } from "../../src/main/window-state";

const primaryDisplay = { x: 0, y: 0, width: 1920, height: 1040 };

describe("window state", () => {
  it("restores a valid visible window", () => {
    const state = {
      x: 120,
      y: 80,
      width: 1280,
      height: 800,
      maximized: false,
    };

    expect(normalizeWindowState(state, [primaryDisplay])).toEqual(state);
  });

  it("ignores a window saved on a disconnected display", () => {
    const state = {
      x: 2400,
      y: 100,
      width: 1280,
      height: 800,
      maximized: false,
    };

    expect(normalizeWindowState(state, [primaryDisplay])).toBeUndefined();
  });

  it("ignores malformed or undersized state", () => {
    expect(
      normalizeWindowState(
        { x: 0, y: 0, width: 800, height: 600, maximized: false },
        [primaryDisplay],
      ),
    ).toBeUndefined();
  });
});
