const MIME_TYPE_LABELS: Readonly<Record<string, string>> = {
  "application/pdf": "PDF",
  "application/json": "JSON",
  "application/msword": "DOC",
  "application/rtf": "RTF",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "PPTX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "application/x-7z-compressed": "7Z",
  "application/zip": "ZIP",
  "text/csv": "CSV",
  "text/html": "HTML",
  "text/markdown": "MD",
  "text/plain": "TXT",
};

const EXTENSION_LABELS: Readonly<Record<string, string>> = {
  jpeg: "JPG",
  markdown: "MD",
  text: "TXT",
};

type AttachmentTypeMetadata = {
  type: string;
  name?: string;
  contentType?: string;
};

export function attachmentTypeLabel({
  type,
  name,
  contentType,
}: AttachmentTypeMetadata): string {
  const normalizedMimeType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (normalizedMimeType) {
    const mimeLabel = MIME_TYPE_LABELS[normalizedMimeType];
    if (mimeLabel) return mimeLabel;
  }

  const extension = fileExtension(name);
  if (extension) return EXTENSION_LABELS[extension] ?? extension.toUpperCase();

  if (type === "image") return "Image";
  if (type === "document") return "Document";
  if (type === "file") return "File";
  return type;
}

function fileExtension(name: string | undefined): string | undefined {
  const match = name?.trim().match(/\.([a-z\d]{1,10})$/i);
  return match?.[1]?.toLowerCase();
}
