import type {
  Attachment,
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
} from "@assistant-ui/core";

import type { MessageAttachment } from "../../../../shared/attachment-contract";

export const LUMORA_ATTACHMENT_DATA_NAME = "lumora-attachment-reference";

export const lumoraAttachmentAdapter: AttachmentAdapter = {
  accept: "*",
  async add({ file }): Promise<PendingAttachment> {
    const reference = await window.lumora.attachments.prepare(file);
    return {
      id: reference.attachmentId,
      type: reference.kind === "IMAGE" ? "image" : "document",
      name: reference.name,
      contentType: reference.mimeType,
      file,
      content: [attachmentDataPart(reference)],
      status: { type: "requires-action", reason: "composer-send" },
    };
  },
  async send(attachment): Promise<CompleteAttachment> {
    const reference = attachmentReference(attachment);
    if (!reference) throw new Error("附件引用已失效，请重新添加");
    return {
      id: reference.attachmentId,
      type: reference.kind === "IMAGE" ? "image" : "document",
      name: reference.name,
      contentType: reference.mimeType,
      content: [attachmentDataPart(reference)],
      status: { type: "complete" },
    };
  },
  async remove() {
    // The temporary clipboard file may already be referenced by a queued turn.
    // Leave lifecycle cleanup to the operating-system temp directory.
  },
};

export function attachmentReference(
  attachment: Pick<Attachment, "content">,
): MessageAttachment | undefined {
  const part = attachment.content?.find(
    (candidate) =>
      candidate.type === "data" &&
      candidate.name === LUMORA_ATTACHMENT_DATA_NAME,
  );
  if (!part || part.type !== "data") return undefined;
  return isMessageAttachment(part.data) ? part.data : undefined;
}

export function attachmentReferences(
  attachments: readonly Attachment[] | undefined,
): MessageAttachment[] {
  if (!attachments) return [];
  return attachments.flatMap((attachment) => {
    const reference = attachmentReference(attachment);
    return reference ? [reference] : [];
  });
}

export function completeAttachments(
  attachments: readonly MessageAttachment[] | undefined,
): CompleteAttachment[] {
  return (attachments ?? []).map((reference) => ({
    id: reference.attachmentId,
    type: reference.kind === "IMAGE" ? "image" : "document",
    name: reference.name,
    contentType: reference.mimeType,
    content: [attachmentDataPart(reference)],
    status: { type: "complete" },
  }));
}

export function isMessageAttachment(value: unknown): value is MessageAttachment {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MessageAttachment>;
  return (
    typeof candidate.attachmentId === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.mimeType === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.size === "number" &&
    (candidate.kind === "IMAGE" || candidate.kind === "FILE") &&
    (candidate.source === "LOCAL_FILE" ||
      candidate.source === "CLIPBOARD_TEMP")
  );
}

function attachmentDataPart(reference: MessageAttachment) {
  return {
    type: "data" as const,
    name: LUMORA_ATTACHMENT_DATA_NAME,
    data: reference,
  };
}
