import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { app, dialog, ipcMain } from "electron";

import type {
  MaterializeClipboardImageInput,
  MessageAttachment,
} from "../../../shared/attachment-contract";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const channels = {
  referenceLocal: "attachments:reference-local",
  materializeClipboardImage: "attachments:materialize-clipboard-image",
  select: "attachments:select",
  readImagePreview: "attachments:read-image-preview",
} as const;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".bmp": "image/bmp",
  ".csv": "text/csv",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".xml": "text/xml",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
};

export function registerAttachmentIpc(): () => void {
  ipcMain.handle(
    channels.referenceLocal,
    (_event, filePath: unknown, mimeHint?: unknown) =>
      referenceLocalFile(filePath, mimeHint),
  );
  ipcMain.handle(
    channels.materializeClipboardImage,
    (_event, input: MaterializeClipboardImageInput) =>
      materializeClipboardImage(input),
  );
  ipcMain.handle(channels.select, async () => {
    const result = await dialog.showOpenDialog({
      title: "选择附件",
      properties: ["openFile", "multiSelections"],
    });
    if (result.canceled) return [];
    return Promise.all(
      result.filePaths.map((filePath) => referenceLocalFile(filePath)),
    );
  });
  ipcMain.handle(
    channels.readImagePreview,
    (_event, attachment: MessageAttachment) => readImagePreview(attachment),
  );

  return () => {
    ipcMain.removeHandler(channels.referenceLocal);
    ipcMain.removeHandler(channels.materializeClipboardImage);
    ipcMain.removeHandler(channels.select);
    ipcMain.removeHandler(channels.readImagePreview);
  };
}

async function referenceLocalFile(
  untrustedPath: unknown,
  mimeHint?: unknown,
): Promise<MessageAttachment> {
  const filePath = requireAbsolutePath(untrustedPath);
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new TypeError("附件必须是本地文件");
  const mimeType = resolveMimeType(filePath, mimeHint);
  const kind = mimeType.startsWith("image/") ? "IMAGE" : "FILE";
  assertAllowedSize(stat.size, kind);
  return {
    attachmentId: randomUUID(),
    name: path.basename(filePath),
    mimeType,
    size: stat.size,
    path: filePath,
    kind,
    source: "LOCAL_FILE",
  };
}

async function materializeClipboardImage(
  input: MaterializeClipboardImageInput,
): Promise<MessageAttachment> {
  if (!input || typeof input !== "object") {
    throw new TypeError("剪贴板图片无效");
  }
  const mimeType = normalizeClipboardImageMime(input.mimeType);
  const bytes = toUint8Array(input.bytes);
  assertAllowedSize(bytes.byteLength, "IMAGE");
  if (bytes.byteLength === 0) throw new TypeError("剪贴板图片为空");
  const extension = extensionForImageMime(mimeType);
  const filePath = path.join(
    app.getPath("temp"),
    `lumora-clipboard-${randomUUID()}${extension}`,
  );
  await fs.writeFile(filePath, bytes, { flag: "wx" });
  return {
    attachmentId: randomUUID(),
    name: normalizeClipboardName(input.name, extension),
    mimeType,
    size: bytes.byteLength,
    path: filePath,
    kind: "IMAGE",
    source: "CLIPBOARD_TEMP",
  };
}

async function readImagePreview(
  attachment: MessageAttachment,
): Promise<string | undefined> {
  if (!attachment || attachment.kind !== "IMAGE") return undefined;
  const filePath = requireAbsolutePath(attachment.path);
  const mimeType = normalizeClipboardImageMime(attachment.mimeType);
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) return undefined;
  assertAllowedSize(stat.size, "IMAGE");
  const bytes = await fs.readFile(filePath);
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function requireAbsolutePath(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("附件路径不能为空");
  }
  const candidate = value.trim();
  if (!path.isAbsolute(candidate) || candidate.length > 4000) {
    throw new TypeError("附件路径无效");
  }
  return path.normalize(candidate);
}

function resolveMimeType(filePath: string, mimeHint: unknown): string {
  const hint = typeof mimeHint === "string" ? mimeHint.trim().toLowerCase() : "";
  if (/^[\w.+-]+\/[\w.+-]+$/.test(hint)) return hint;
  return MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()]
    ?? "application/octet-stream";
}

function normalizeClipboardImageMime(value: unknown): string {
  const mimeType = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!new Set([
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/bmp",
  ]).has(mimeType)) {
    throw new TypeError("暂不支持该剪贴板图片格式");
  }
  return mimeType;
}

function extensionForImageMime(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg": return ".jpg";
    case "image/gif": return ".gif";
    case "image/webp": return ".webp";
    case "image/bmp": return ".bmp";
    default: return ".png";
  }
}

function normalizeClipboardName(value: unknown, extension: string): string {
  const candidate = typeof value === "string" ? path.basename(value.trim()) : "";
  return candidate && candidate.length <= 260
    ? candidate
    : `剪贴板图片${extension}`;
}

function assertAllowedSize(size: number, kind: "IMAGE" | "FILE"): void {
  const maximum = kind === "IMAGE" ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  if (!Number.isSafeInteger(size) || size < 0 || size > maximum) {
    throw new TypeError(
      kind === "IMAGE" ? "图片不能超过 20 MB" : "文件不能超过 25 MB",
    );
  }
}

function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value);
  throw new TypeError("剪贴板图片数据无效");
}

export { channels as attachmentIpcChannels };
