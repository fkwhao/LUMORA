import { describe, expect, it } from "vitest";

import {
  citationTabId,
  citationsFromMessage,
  inlineCitationNumbers,
  stripCitationDefinitions,
} from "../../src/renderer/features/tasks/state/citations";
import type { ChatMessage } from "../../src/shared/model-contract";

describe("message citations", () => {
  it("parses web, file, attachment, and Artifact reference definitions", () => {
    const message: ChatMessage = {
      role: "assistant",
      content: [
        "Web claim[1], file claim[2], PDF claim[3], and result claim[4].",
        "",
        '[1]: https://example.com/research "Research page"',
        '[2]: lumora-file:src/main.ts#L10-L18 "main.ts"',
        '[3]: lumora-attachment:attachment-1#P2-P4 "paper.pdf"',
        '[4]: lumora-artifact:artifact-1 "完整结果"',
      ].join("\n"),
    };

    expect(citationsFromMessage(message)).toEqual([
      expect.objectContaining({
        number: 1,
        kind: "web",
        label: "Research page",
        host: "example.com",
        url: "https://example.com/research",
      }),
      expect.objectContaining({
        number: 2,
        kind: "file",
        path: "src/main.ts",
        startLine: 10,
        endLine: 18,
      }),
      expect.objectContaining({
        number: 3,
        kind: "attachment",
        attachmentId: "attachment-1",
        startPage: 2,
        endPage: 4,
      }),
      expect.objectContaining({
        number: 4,
        kind: "artifact",
        artifactId: "artifact-1",
      }),
    ]);
  });

  it("falls back to persisted search and file-read work logs", () => {
    const message: ChatMessage = {
      role: "assistant",
      content: "Search evidence[1] and code evidence[2].",
      workLog: [
        {
          itemId: "search-1",
          kind: "search",
          status: "completed",
          toolName: "web_search",
          metadata: {
            sources: [
              { title: "Example source", url: "https://example.com/source" },
            ],
          },
        },
        {
          itemId: "read-1",
          kind: "tool",
          status: "completed",
          toolName: "read_file",
          arguments: { path: "src/index.ts" },
          metadata: { path: "src/index.ts", startLine: 4, endLine: 12 },
        },
      ],
    };

    const references = citationsFromMessage(message);
    expect(references).toHaveLength(2);
    expect(references[0]).toMatchObject({
      number: 1,
      kind: "web",
      label: "Example source",
    });
    expect(references[1]).toMatchObject({
      number: 2,
      kind: "file",
      path: "src/index.ts",
      startLine: 4,
      endLine: 12,
    });
    expect(citationTabId(references[0]!)).toMatch(/^citation:web-[a-z0-9]+$/);
  });

  it("does not treat reference definitions as inline markers", () => {
    const content = [
      "Used source[1].",
      "",
      '[1]: https://example.com "Only a definition"',
    ].join("\n");
    expect(inlineCitationNumbers(content)).toEqual([1]);
    expect(stripCitationDefinitions(content)).toBe("Used source[1].");
  });

  it("keeps apostrophes inside double-quoted source titles", () => {
    const message: ChatMessage = {
      role: "assistant",
      content: [
        "Use the provider guide[1].",
        "",
        `[1]: https://example.com/provider "Provider's guide"`,
      ].join("\n"),
    };

    expect(citationsFromMessage(message)[0]?.label).toBe("Provider's guide");
  });
});
