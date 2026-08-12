import { describe, expect, it } from "vitest";

import { resolveQuestionRailTooltipPosition } from "../../src/renderer/features/tasks/state/question-rail-tooltip";

describe("question rail tooltip positioning", () => {
  it("removes the expanded sidebar offset from viewport coordinates", () => {
    expect(
      resolveQuestionRailTooltipPosition(
        { top: 320, right: 290, height: 12, left: 256 },
        { top: 0, left: 248 },
      ),
    ).toEqual({ top: 326, left: 50 });
  });

  it("keeps the same visual gap when the sidebar is collapsed", () => {
    expect(
      resolveQuestionRailTooltipPosition(
        { top: 320, right: 42, height: 12, left: 8 },
        { top: 0, left: 0 },
      ),
    ).toEqual({ top: 326, left: 50 });
  });
});
