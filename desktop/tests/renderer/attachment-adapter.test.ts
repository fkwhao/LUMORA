import { afterEach, describe, expect, it, vi } from "vitest";

import type { MessageAttachment } from "../../src/shared/attachment-contract";
import {
  attachmentReference,
  attachmentReferences,
  completeAttachments,
  lumoraAttachmentAdapter,
} from "../../src/renderer/features/tasks/attachments/lumora-attachment-adapter";
import { attachmentTypeLabel } from "../../src/renderer/features/tasks/attachments/attachment-type-label";

const reference: MessageAttachment = {
  attachmentId: "attachment-1",
  name: "数据库同步问题总结.md",
  mimeType: "text/markdown",
  size: 4280,
  path: "F:\\Workspace\\数据库同步问题总结.md",
  kind: "FILE",
  source: "LOCAL_FILE",
};

describe("lumora attachment adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps a local file as metadata-only path reference", async () => {
    const prepare = vi.fn(async () => reference);
    Object.defineProperty(window, "lumora", {
      configurable: true,
      value: { attachments: { prepare } },
    });
    const file = new File(["content"], reference.name, {
      type: reference.mimeType,
    });

    const pending = await lumoraAttachmentAdapter.add({ file });
    if (Symbol.asyncIterator in pending) throw new Error("unexpected generator");

    expect(prepare).toHaveBeenCalledWith(file);
    expect(attachmentReference(pending)).toEqual(reference);
    const complete = await lumoraAttachmentAdapter.send(pending);
    expect(attachmentReferences([complete])).toEqual([reference]);
    expect(complete.content).not.toContainEqual(
      expect.objectContaining({ type: "file" }),
    );
  });

  it("restores history tiles without embedding file bytes", () => {
    const [attachment] = completeAttachments([reference]);
    expect(attachmentReference(attachment!)).toEqual(reference);
    expect(JSON.stringify(attachment)).not.toContain("base64");
  });

  it("shows the concrete file type instead of the generic document kind", () => {
    expect(
      attachmentTypeLabel({
        type: "document",
        name: "产品说明.pdf",
        contentType: "application/pdf",
      }),
    ).toBe("PDF");
    expect(
      attachmentTypeLabel({
        type: "document",
        name: "数据库同步问题总结.md",
        contentType: "application/octet-stream",
      }),
    ).toBe("MD");
    expect(attachmentTypeLabel({ type: "document" })).toBe("Document");
  });
});
