import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownMessage } from "../../src/renderer/components/MarkdownMessage";

describe("MarkdownMessage", () => {
  it("renders common model markdown without executing raw HTML", () => {
    const { container } = render(
      <MarkdownMessage
        content={[
          "## 执行结果",
          "",
          "- 已读取配置",
          "- 已完成检查",
          "",
          "| 文件 | 状态 |",
          "| --- | --- |",
          "| app.ts | 通过 |",
          "",
          "```ts",
          "const ready = true;",
          "```",
          "",
          "[查看文档](https://example.com/docs)",
          "",
          "<script>window.__unsafe = true</script>",
        ].join("\n")}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "执行结果" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "执行结果" }))
      .toHaveClass("aui-md-h2");
    expect(screen.getByRole("table")).toHaveClass("aui-md-table");
    const code = screen.getByText(
      (_content, element) =>
        element?.tagName === "CODE" &&
        element.textContent === "const ready = true;",
    );
    expect(code).toBeVisible();
    expect(code).toHaveClass("hljs", "language-ts");
    expect(screen.getByRole("button", { name: "复制代码" })).toBeVisible();
    expect(screen.getByText("ts")).toHaveClass("aui-code-header-language");
    expect(screen.getByRole("link", { name: "查看文档" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(container.querySelector("script")).not.toBeInTheDocument();
  });
});
