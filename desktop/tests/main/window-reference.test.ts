import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import { WindowReference } from "../../src/main/window-reference";

class FakeWindow extends EventEmitter {}

describe("window reference", () => {
  it("retains the window until its closed event", () => {
    const reference = new WindowReference<FakeWindow>();
    const window = new FakeWindow();

    reference.set(window);
    expect(reference.get()).toBe(window);

    window.emit("closed");
    expect(reference.get()).toBeUndefined();
  });
});
