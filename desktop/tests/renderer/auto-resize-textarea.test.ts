import { describe, expect, it } from "vitest";

import { resizeTextarea } from "../../src/renderer/utils/auto-resize-textarea";

describe("auto resizing textarea", () => {
  it("grows to a limit and then enables internal scrolling", () => {
    const textarea = document.createElement("textarea");
    textarea.style.minHeight = "46px";
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 260,
    });

    resizeTextarea(textarea, 180);

    expect(textarea.style.height).toBe("180px");
    expect(textarea.style.overflowY).toBe("auto");

    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 90,
    });
    resizeTextarea(textarea, 180);

    expect(textarea.style.height).toBe("90px");
    expect(textarea.style.overflowY).toBe("hidden");
  });
});
