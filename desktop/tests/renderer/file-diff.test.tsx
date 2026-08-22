import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  FileDiff,
  rowsFromPatch,
  splitFilePath,
} from "../../src/renderer/features/tasks/components/FileDiff";

afterEach(cleanup);

describe("FileDiff", () => {
  it("keeps root files visibly project-relative", () => {
    expect(splitFilePath("lumora-restore-test.txt")).toEqual({
      directory: "./",
      name: "lumora-restore-test.txt",
    });
    expect(splitFilePath("desktop/src/App.tsx")).toEqual({
      directory: "desktop/src/",
      name: "App.tsx",
    });
  });

  it("keeps separate Git hunks compact with omitted-line markers", () => {
    const rows = rowsFromPatch([
      "diff --git a/src/example.ts b/src/example.ts",
      "--- a/src/example.ts",
      "+++ b/src/example.ts",
      "@@ -4,1 +4,1 @@",
      "-const first = false;",
      "+const first = true;",
      "@@ -10,1 +10,1 @@",
      "-const second = false;",
      "+const second = true;",
    ].join("\n"));

    expect(rows.filter((row) => row.type === "gap").map((row) => row.text))
      .toEqual(["3 行未修改", "5 行未修改"]);
  });

  it("places old deletion and new addition numbers in the same line-number track", () => {
    const { container } = render(
      <FileDiff
        file="src/auth.ts"
        additions={1}
        deletions={1}
        rows={[
          { old: 12, cur: null, type: "del", text: "old" },
          { old: null, cur: 13, type: "add", text: "new" },
        ]}
      />,
    );

    const deletionNumber = container.querySelector<HTMLElement>(
      '[title="原第 12 行"]',
    );
    const additionNumber = container.querySelector<HTMLElement>(
      '[title="新第 13 行"]',
    );
    expect(deletionNumber).toBeInTheDocument();
    expect(additionNumber).toBeInTheDocument();
    expect(deletionNumber?.className).toBe(additionNumber?.className);
    expect(deletionNumber?.parentElement?.children).toHaveLength(3);
    expect(additionNumber?.parentElement?.children).toHaveLength(3);
  });
});
