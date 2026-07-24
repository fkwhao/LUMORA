import { describe, expect, it } from "vitest";

import { createMainWindowOptions } from "../../src/main/window-options";

describe("main window security", () => {
  it("keeps privileged capabilities out of the renderer", () => {
    const options = createMainWindowOptions("C:\\lumora\\preload.js");

    expect(options.webPreferences).toMatchObject({
      preload: "C:\\lumora\\preload.js",
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    });
  });
});

