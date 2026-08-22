import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DiffReviewPane } from "../../src/renderer/features/tasks/DiffReviewPane";

describe("DiffReviewPane", () => {
  it("expands and collapses each changed file independently", () => {
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
    const firstFile = screen.getByRole("button", { name: "折叠 src/example.ts" });
    expect(firstFile).toHaveAttribute("aria-expanded", "true");
    const otherFile = screen.getByRole("button", { name: "展开 src/other.ts" });
    expect(within(otherFile).getByText("src/")).toBeInTheDocument();
    expect(within(otherFile).getByText("other.ts")).toBeInTheDocument();
    fireEvent.click(otherFile);
    expect(onSelectChange).toHaveBeenCalledWith("change-2");
    expect(screen.getByText("old")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();
    fireEvent.click(firstFile);
    expect(screen.queryByText("const count = 1;")).not.toBeInTheDocument();
  });

  it("renders unified Git rows and enables a safe Run revert", () => {
    const onRevert = vi.fn();
    render(
      <DiffReviewPane
        changes={[{
          changeId: "run-1:src/auth.ts",
          path: "src/auth.ts",
          status: "MODIFIED",
          additions: 1,
          deletions: 1,
          binary: false,
          patch: [
            "diff --git a/src/auth.ts b/src/auth.ts",
            "--- a/src/auth.ts",
            "+++ b/src/auth.ts",
            "@@ -12,2 +12,2 @@",
            " export function getToken() {",
            "-  return localStorage.token;",
            "+  return cookies.get(\"session\");",
          ].join("\n"),
          previewAvailable: true,
        }]}
        runChanges={{
          runId: "run-1",
          status: "CAPTURED",
          repositoryRoot: "C:/project",
          reason: "",
          additions: 1,
          deletions: 1,
          revertible: true,
          files: [],
        }}
        selectedChangeId="run-1:src/auth.ts"
        onSelectChange={vi.fn()}
        onRevert={onRevert}
      />,
    );

    expect(screen.getByText("return localStorage.token;")).toBeInTheDocument();
    expect(screen.getByText('return cookies.get("session");')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "撤回本轮" }));
    expect(onRevert).toHaveBeenCalledOnce();
  });
});
