import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CitationPreviewPane,
  citationBreadcrumbParts,
  isMarkdownFile,
} from "../../src/renderer/features/tasks/components/CitationPreviewPane";

afterEach(cleanup);

describe("CitationPreviewPane", () => {
  it("builds inline-only breadcrumb levels from either path separator", () => {
    expect(citationBreadcrumbParts("desktop\\src\\main\\citation-ipc.ts"))
      .toEqual(["desktop", "src", "main", "citation-ipc.ts"]);
    expect(citationBreadcrumbParts("docs/architecture.md"))
      .toEqual(["docs", "architecture.md"]);
  });

  it("offers rendered preview only for Markdown sources", () => {
    expect(isMarkdownFile("docs/architecture.md")).toBe(true);
    expect(isMarkdownFile("README.MARKDOWN")).toBe(true);
    expect(isMarkdownFile("artifact", "text/markdown")).toBe(true);
    expect(isMarkdownFile("src/main.ts", "text/plain")).toBe(false);
  });

  it("opens Markdown rendered and toggles to the complete highlighted source", async () => {
    const readLocal = vi.fn(async () => ({
      kind: "text" as const,
      name: "architecture.md",
      displayPath: "LUMORA/docs/architecture.md",
      mimeType: "text/markdown",
      content: "# Architecture\n\nComplete source line.",
      byteSize: 38,
      truncated: false,
    }));
    Object.defineProperty(window, "lumora", {
      configurable: true,
      value: { citations: { readLocal } },
    });

    render(
      <CitationPreviewPane
        taskId="task-citation-preview"
        previewId="citation-file-1"
        reference={{
          number: 1,
          kind: "file",
          label: "architecture.md",
          path: "docs/architecture.md",
          startLine: 3,
        }}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Architecture" }))
      .toBeInTheDocument();
    const breadcrumb = screen.getByRole("navigation", {
      name: /LUMORA \/ docs \/ architecture\.md/,
    });
    expect(breadcrumb).toBeInTheDocument();
    expect(breadcrumb.querySelectorAll(".citation-file-breadcrumb-entry"))
      .toHaveLength(3);
    expect(breadcrumb.querySelectorAll("svg")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "查看源代码" }));
    await waitFor(() => {
      expect(document.querySelector('[data-source-line="3"]'))
        .toHaveAttribute("data-highlighted", "true");
    });
    expect(document.querySelectorAll("[data-source-line]")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "预览" })).toBeInTheDocument();
  });
});
