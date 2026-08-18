export type AttachmentKind = "IMAGE" | "FILE";
export type AttachmentSource = "LOCAL_FILE" | "CLIPBOARD_TEMP";

/**
 * A durable attachment is only a reference to one operating-system file.
 * File bytes are deliberately excluded so SQLite never becomes a second
 * attachment store.
 */
export interface MessageAttachment {
  attachmentId: string;
  name: string;
  mimeType: string;
  size: number;
  path: string;
  kind: AttachmentKind;
  source: AttachmentSource;
}

export interface MaterializeClipboardImageInput {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface LumoraAttachmentApi {
  prepare(file: File): Promise<MessageAttachment>;
  select(): Promise<MessageAttachment[]>;
  readImagePreview(attachment: MessageAttachment): Promise<string | undefined>;
}
