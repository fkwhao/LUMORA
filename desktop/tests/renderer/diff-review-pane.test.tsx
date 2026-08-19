import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DiffReviewPane } from "../../src/renderer/features/tasks/DiffReviewPane";

describe("DiffReviewPane", () => {
  it("shows the selected local patch and switches changed files", () => {
    const onSelectChange = vi.fn();
    render(
      <DiffReviewPane
        changes={[
          {
            changeId: "change-1",
            path: "src/example.ts",
            oldText: "const count = 1;",
            newText: "const count = 2;",
            previewAvailable: true,
          },
          {
            changeId: "change-2",
            path: "src/other.ts",
            oldText: "old",
            newText: "new",
            previewAvailable: true,
          },
        ]}
        onSelectChange={onSelectChange}
        selectedChangeId="change-1"
      />,
    );

    expect(screen.getByText("const count = 1;")).toBeInTheDocument();
    expect(screen.getByText("const count = 2;")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /other\.ts/ }));
    expect(onSelectChange).toHaveBeenCalledWith("change-2");
  });
});
