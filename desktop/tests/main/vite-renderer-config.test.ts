// @vitest-environment node

import { describe, expect, it } from "vitest";

import rendererConfig from "../../vite.renderer.config";

describe("renderer dev server", () => {
  it("keeps a stable origin for renderer local preferences", () => {
    expect(rendererConfig).toMatchObject({
      server: {
        port: 5173,
        strictPort: true,
      },
    });
  });
});
