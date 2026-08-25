import fs from "node:fs/promises";
import path from "node:path";

import {
  BrowserWindow,
  ipcMain,
  WebContentsView,
  type IpcMainInvokeEvent,
  type Session,
} from "electron";

import type {
  CitationLocalPreview,
  CitationPreviewBounds,
  CitationWebNavigationAction,
  CitationWebPreviewInput,
  CitationWebPreviewState,
} from "../../../shared/citation-contract";
import type { MessageAttachment } from "../../../shared/attachment-contract";
import type { ChatMessage } from "../../../shared/model-contract";
import { validateTaskId } from "../../../shared/validation";
import type { ModelGateway } from "../model/model-gateway";
import type { TaskGateway } from "../task/task-gateway";

const MAX_TEXT_PREVIEW_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PREVIEW_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PREVIEW_BYTES = 25 * 1024 * 1024;
const hardenedPreviewSessions = new WeakSet<Session>();
const WEB_PREVIEW_SCROLLBAR_CSS = `
  :root {
    scrollbar-width: thin;
    scrollbar-color: rgba(127, 127, 127, 0.42) transparent;
  }
  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  ::-webkit-scrollbar-track,
  ::-webkit-scrollbar-corner {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    min-height: 46px;
    border: 3px solid transparent;
    border-radius: 999px;
    background: rgba(127, 127, 127, 0.42) padding-box;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(127, 127, 127, 0.62) padding-box;
  }
  ::-webkit-scrollbar-button {
    display: none;
    width: 0;
    height: 0;
  }
`;

const channels = {
  readLocal: "citations:read-local",
  readAttachment: "citations:read-attachment",
  showWeb: "citations:web-show",
  setWebBounds: "citations:web-set-bounds",
  hideWeb: "citations:web-hide",
  closeWeb: "citations:web-close",
  navigateWeb: "citations:web-navigate",
  webState: "citations:web-state",
} as const;

interface WebPreviewEntry {
  previewId: string;
  requestedUrl: string;
  view: WebContentsView;
  loading: boolean;
  error?: string;
  scrollbarCssKey?: string;
  readyToReveal: boolean;
  documentGeneration: number;
}

interface WindowWebPreviews {
  owner: BrowserWindow;
  activeId?: string;
  entries: Map<string, WebPreviewEntry>;
}

export function registerCitationIpc(
  taskGateway: TaskGateway,
  modelGateway: ModelGateway,
): () => void {
  const previews = new Map<number, WindowWebPreviews>();

  ipcMain.handle(
    channels.readLocal,
    (_event, taskId: unknown, relativePath: unknown) =>
      readLocalCitation(taskGateway, modelGateway, taskId, relativePath),
  );
  ipcMain.handle(
    channels.readAttachment,
    (_event, taskId: unknown, attachmentId: unknown) =>
      readAttachmentCitation(modelGateway, taskId, attachmentId),
  );
  ipcMain.handle(channels.showWeb, (event, input: CitationWebPreviewInput) => {
    const owner = requireOwner(event);
    const windowPreviews = windowPreviewState(previews, owner);
    const normalized = validateShowInput(owner, input);
    let entry = windowPreviews.entries.get(normalized.previewId);
    if (!entry) {
      entry = createWebPreviewEntry(windowPreviews, normalized.previewId);
      windowPreviews.entries.set(normalized.previewId, entry);
    }
    for (const candidate of windowPreviews.entries.values()) {
      candidate.view.setVisible(false);
    }
    windowPreviews.activeId = entry.previewId;
    entry.view.setBounds(normalized.bounds);
    if (entry.requestedUrl !== normalized.url) {
      entry.requestedUrl = normalized.url;
      entry.loading = true;
      entry.error = undefined;
      entry.readyToReveal = false;
      publishWebState(windowPreviews, entry);
      void entry.view.webContents.loadURL(normalized.url).catch((error: unknown) => {
        entry!.loading = false;
        entry!.readyToReveal = false;
        entry!.error = error instanceof Error ? error.message : "网页加载失败";
        entry!.view.setVisible(false);
        publishWebState(windowPreviews, entry!);
      });
    } else if (entry.readyToReveal && !entry.error) {
      entry.view.setVisible(true);
    }
    return webPreviewState(entry);
  });
  ipcMain.handle(
    channels.setWebBounds,
    (event, previewId: unknown, bounds: CitationPreviewBounds) => {
      const owner = requireOwner(event);
      const entry = requireEntry(previews, owner, previewId);
      entry.view.setBounds(validateBounds(owner, bounds));
    },
  );
  ipcMain.handle(channels.hideWeb, (event, previewId: unknown) => {
    const owner = requireOwner(event);
    const entry = requireEntry(previews, owner, previewId);
    entry.view.setVisible(false);
    const windowPreviews = previews.get(owner.id);
    if (windowPreviews?.activeId === entry.previewId) {
      windowPreviews.activeId = undefined;
    }
  });
  ipcMain.handle(channels.closeWeb, (event, previewId: unknown) => {
    const owner = requireOwner(event);
    closeWebPreview(previews, owner, requirePreviewId(previewId));
  });
  ipcMain.handle(
    channels.navigateWeb,
    (
      event,
      previewId: unknown,
      action: CitationWebNavigationAction,
    ) => {
      const owner = requireOwner(event);
      const entry = requireEntry(previews, owner, previewId);
      const navigation = entry.view.webContents.navigationHistory;
      switch (action) {
        case "back":
          if (navigation.canGoBack()) navigation.goBack();
          break;
        case "forward":
          if (navigation.canGoForward()) navigation.goForward();
          break;
        case "reload":
          entry.view.webContents.reload();
          break;
        case "stop":
          entry.view.webContents.stop();
          break;
        default:
          throw new TypeError("网页预览操作无效");
      }
      return webPreviewState(entry);
    },
  );

  return () => {
    ipcMain.removeHandler(channels.readLocal);
    ipcMain.removeHandler(channels.readAttachment);
    ipcMain.removeHandler(channels.showWeb);
    ipcMain.removeHandler(channels.setWebBounds);
    ipcMain.removeHandler(channels.hideWeb);
    ipcMain.removeHandler(channels.closeWeb);
    ipcMain.removeHandler(channels.navigateWeb);
    for (const windowPreviews of previews.values()) {
      for (const entry of windowPreviews.entries.values()) {
        destroyWebPreview(windowPreviews.owner, entry);
      }
    }
    previews.clear();
  };
}

async function readLocalCitation(
  taskGateway: TaskGateway,
  modelGateway: ModelGateway,
  untrustedTaskId: unknown,
  untrustedPath: unknown,
): Promise<CitationLocalPreview> {
  const taskId = validateTaskId(untrustedTaskId);
  const requestedPath = requireCitationPath(untrustedPath);
  const [task, worktree] = await Promise.all([
    taskGateway.get(taskId),
    modelGateway.getTaskWorktree(taskId).catch(() => undefined),
  ]);
  const roots = uniquePaths([
    worktree?.effectiveWorkspacePath,
    worktree?.sourceWorkspacePath,
    task.workspacePath,
  ]);
  if (roots.length === 0) throw new Error("当前会话没有可用的项目目录");
  const target = await resolveCitationFile(roots, requestedPath);
  const displayRoot = uniquePaths([
    worktree?.sourceWorkspacePath,
    task.workspacePath,
    worktree?.effectiveWorkspacePath,
  ])[0];
  const displayPath = displayRoot
    ? path.join(path.basename(path.resolve(displayRoot)), target.displayPath)
    : target.displayPath;
  return readPreviewFile(target.absolutePath, displayPath);
}

async function readAttachmentCitation(
  modelGateway: ModelGateway,
  untrustedTaskId: unknown,
  untrustedAttachmentId: unknown,
): Promise<CitationLocalPreview> {
  const taskId = validateTaskId(untrustedTaskId);
  const attachmentId = requirePreviewId(untrustedAttachmentId);
  const messages = await modelGateway.listMessages(taskId);
  const attachment = findAttachment(messages, attachmentId);
  if (!attachment) throw new Error("引用附件不存在或已从当前会话移除");
  return readPreviewFile(
    attachment.path,
    attachment.name,
    attachment.mimeType,
  );
}

async function readPreviewFile(
  absolutePath: string,
  displayPath: string,
  mimeHint?: string,
): Promise<CitationLocalPreview> {
  if (!path.isAbsolute(absolutePath)) throw new Error("引用来源路径无效");
  const realPath = await fs.realpath(absolutePath);
  const stat = await fs.stat(realPath);
  if (!stat.isFile()) throw new Error("引用来源不是文件");
  const detectedMime = citationMimeType(realPath);
  const mimeType = detectedMime === "application/octet-stream"
    ? (normalizedMimeHint(mimeHint) ?? detectedMime)
    : detectedMime;
  const name = path.basename(realPath);

  if (mimeType.startsWith("image/")) {
    if (stat.size > MAX_IMAGE_PREVIEW_BYTES) {
      throw new Error("引用图片超过 20 MB，无法安全预览");
    }
    const bytes = await fs.readFile(realPath);
    return {
      kind: "image",
      name,
      displayPath,
      mimeType,
      dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
      byteSize: stat.size,
      truncated: false,
    };
  }

  if (mimeType === "application/pdf") {
    if (stat.size > MAX_PDF_PREVIEW_BYTES) {
      throw new Error("引用 PDF 超过 25 MB，无法安全预览");
    }
    const bytes = await fs.readFile(realPath);
    return {
      kind: "pdf",
      name,
      displayPath,
      mimeType,
      dataUrl: `data:application/pdf;base64,${bytes.toString("base64")}`,
      byteSize: stat.size,
      truncated: false,
    };
  }

  if (!isTextPreview(realPath, mimeType)) {
    return {
      kind: "unsupported",
      name,
      displayPath,
      mimeType,
      byteSize: stat.size,
      truncated: false,
    };
  }

  if (stat.size > MAX_TEXT_PREVIEW_BYTES) {
    throw new Error("引用文本超过 10 MB，无法安全预览完整文件");
  }
  const bytes = await fs.readFile(realPath);
  if (bytes.includes(0)) {
    return {
      kind: "unsupported",
      name,
      displayPath,
      mimeType,
      byteSize: stat.size,
      truncated: false,
    };
  }
  return {
    kind: "text",
    name,
    displayPath,
    mimeType,
    content: bytes.toString("utf8"),
    byteSize: stat.size,
    truncated: false,
  };
}

function findAttachment(
  messages: ChatMessage[],
  attachmentId: string,
): MessageAttachment | undefined {
  const pending = [...messages];
  while (pending.length > 0) {
    const message = pending.shift();
    if (!message) continue;
    const attachment = message.attachments?.find(
      (candidate) => candidate.attachmentId === attachmentId,
    );
    if (attachment) return attachment;
    pending.push(...(message.threadMessages ?? []));
  }
  return undefined;
}

function normalizedMimeHint(value?: string): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[\w.+-]+\/[\w.+-]+$/.test(normalized)
    ? normalized
    : undefined;
}

function createWebPreviewEntry(
  windowPreviews: WindowWebPreviews,
  previewId: string,
): WebPreviewEntry {
  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      partition: "persist:lumora-citation-preview",
    },
  });
  const entry: WebPreviewEntry = {
    previewId,
    requestedUrl: "",
    view,
    loading: true,
    readyToReveal: false,
    documentGeneration: 0,
  };
  windowPreviews.owner.contentView.addChildView(view);
  view.setVisible(false);
  view.setBackgroundColor("#171717");
  hardenPreviewSession(view.webContents.session);
  view.webContents.setWindowOpenHandler(({ url }) => {
    const safeUrl = safeWebUrl(url);
    if (safeUrl) void view.webContents.loadURL(safeUrl);
    return { action: "deny" };
  });
  view.webContents.on("will-navigate", (event, url) => {
    if (!safeWebUrl(url)) event.preventDefault();
  });
  view.webContents.on(
    "did-start-navigation",
    (_event, _url, isInPlace, isMainFrame) => {
      if (!isMainFrame || isInPlace) return;
      entry.documentGeneration += 1;
      entry.readyToReveal = false;
      if (windowPreviews.activeId === entry.previewId) {
        view.setVisible(false);
      }
    },
  );
  view.webContents.on("did-start-loading", () => {
    entry.loading = true;
    entry.error = undefined;
    publishWebState(windowPreviews, entry);
  });
  view.webContents.on("did-stop-loading", () => {
    entry.loading = false;
    publishWebState(windowPreviews, entry);
  });
  view.webContents.on("dom-ready", () => {
    const generation = entry.documentGeneration;
    void prepareWebPreviewForReveal(windowPreviews, entry, generation);
  });
  view.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      entry.loading = false;
      entry.readyToReveal = false;
      entry.error = `${errorDescription} (${errorCode})`;
      view.setVisible(false);
      if (safeWebUrl(validatedUrl)) entry.requestedUrl = validatedUrl;
      publishWebState(windowPreviews, entry);
    },
  );
  view.webContents.on("did-navigate", () => publishWebState(windowPreviews, entry));
  view.webContents.on("did-navigate-in-page", () => publishWebState(windowPreviews, entry));
  view.webContents.on("page-title-updated", () => publishWebState(windowPreviews, entry));
  return entry;
}

async function prepareWebPreviewForReveal(
  windowPreviews: WindowWebPreviews,
  entry: WebPreviewEntry,
  generation: number,
) {
  await applyWebPreviewScrollbar(entry);
  if (
    entry.view.webContents.isDestroyed() ||
    entry.documentGeneration !== generation
  ) {
    return;
  }
  entry.readyToReveal = true;
  if (windowPreviews.activeId === entry.previewId && !entry.error) {
    entry.view.setVisible(true);
  }
}

async function applyWebPreviewScrollbar(entry: WebPreviewEntry) {
  const webContents = entry.view.webContents;
  if (webContents.isDestroyed()) return;
  if (entry.scrollbarCssKey) {
    await webContents.removeInsertedCSS(entry.scrollbarCssKey).catch(() => undefined);
  }
  if (webContents.isDestroyed()) return;
  entry.scrollbarCssKey = await webContents
    .insertCSS(WEB_PREVIEW_SCROLLBAR_CSS, { cssOrigin: "user" })
    .catch(() => undefined);
}

function hardenPreviewSession(session: Session) {
  if (hardenedPreviewSessions.has(session)) return;
  hardenedPreviewSessions.add(session);
  session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.on("will-download", (event) => event.preventDefault());
}

function windowPreviewState(
  previews: Map<number, WindowWebPreviews>,
  owner: BrowserWindow,
): WindowWebPreviews {
  const existing = previews.get(owner.id);
  if (existing) return existing;
  const created: WindowWebPreviews = { owner, entries: new Map() };
  previews.set(owner.id, created);
  owner.once("closed", () => {
    for (const entry of created.entries.values()) destroyWebPreview(owner, entry);
    previews.delete(owner.id);
  });
  return created;
}

function publishWebState(windowPreviews: WindowWebPreviews, entry: WebPreviewEntry) {
  if (windowPreviews.owner.isDestroyed()) return;
  windowPreviews.owner.webContents.send(channels.webState, webPreviewState(entry));
}

function webPreviewState(entry: WebPreviewEntry): CitationWebPreviewState {
  const webContents = entry.view.webContents;
  const navigation = webContents.navigationHistory;
  return {
    previewId: entry.previewId,
    url: webContents.getURL() || entry.requestedUrl,
    title: webContents.getTitle(),
    loading: entry.loading,
    canGoBack: navigation.canGoBack(),
    canGoForward: navigation.canGoForward(),
    error: entry.error,
  };
}

function closeWebPreview(
  previews: Map<number, WindowWebPreviews>,
  owner: BrowserWindow,
  previewId: string,
) {
  const windowPreviews = previews.get(owner.id);
  const entry = windowPreviews?.entries.get(previewId);
  if (!entry || !windowPreviews) return;
  destroyWebPreview(owner, entry);
  windowPreviews.entries.delete(previewId);
  if (windowPreviews.activeId === previewId) windowPreviews.activeId = undefined;
}

function destroyWebPreview(owner: BrowserWindow, entry: WebPreviewEntry) {
  if (!owner.isDestroyed()) owner.contentView.removeChildView(entry.view);
  if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close();
}

function requireEntry(
  previews: Map<number, WindowWebPreviews>,
  owner: BrowserWindow,
  previewId: unknown,
): WebPreviewEntry {
  const id = requirePreviewId(previewId);
  const entry = previews.get(owner.id)?.entries.get(id);
  if (!entry) throw new Error("网页预览已经关闭");
  return entry;
}

function requireOwner(event: IpcMainInvokeEvent): BrowserWindow {
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (!owner || owner.isDestroyed()) throw new Error("无法定位当前应用窗口");
  return owner;
}

function validateShowInput(
  owner: BrowserWindow,
  input: CitationWebPreviewInput,
): CitationWebPreviewInput {
  if (!input || typeof input !== "object") throw new TypeError("网页预览参数无效");
  const url = safeWebUrl(input.url);
  if (!url) throw new TypeError("仅支持 HTTP 或 HTTPS 网页预览");
  return {
    previewId: requirePreviewId(input.previewId),
    url,
    bounds: validateBounds(owner, input.bounds),
  };
}

function validateBounds(
  owner: BrowserWindow,
  bounds: CitationPreviewBounds,
): CitationPreviewBounds {
  if (!bounds || typeof bounds !== "object") throw new TypeError("网页预览区域无效");
  const content = owner.getContentBounds();
  const x = finiteInteger(bounds.x);
  const y = finiteInteger(bounds.y);
  const width = finiteInteger(bounds.width);
  const height = finiteInteger(bounds.height);
  if (width < 1 || height < 1) throw new TypeError("网页预览区域不能为空");
  const safeX = Math.max(0, Math.min(x, content.width - 1));
  const safeY = Math.max(0, Math.min(y, content.height - 1));
  return {
    x: safeX,
    y: safeY,
    width: Math.max(1, Math.min(width, content.width - safeX)),
    height: Math.max(1, Math.min(height, content.height - safeY)),
  };
}

function finiteInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("网页预览坐标无效");
  }
  return Math.round(value);
}

function requirePreviewId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 500) {
    throw new TypeError("网页预览 ID 无效");
  }
  return value.trim();
}

function safeWebUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4_000) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function requireCitationPath(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 4_000) {
    throw new TypeError("引用文件路径无效");
  }
  return value.trim();
}

async function resolveCitationFile(
  roots: string[],
  requestedPath: string,
): Promise<{ absolutePath: string; displayPath: string }> {
  const realRoots = await Promise.all(roots.map((root) => fs.realpath(root)));
  const candidates = path.isAbsolute(requestedPath)
    ? [path.normalize(requestedPath)]
    : realRoots.map((root) => path.resolve(root, requestedPath));
  for (const candidate of candidates) {
    try {
      const realCandidate = await fs.realpath(candidate);
      const root = realRoots.find((candidateRoot) => isInside(candidateRoot, realCandidate));
      if (!root) continue;
      return {
        absolutePath: realCandidate,
        displayPath: path.relative(root, realCandidate) || path.basename(realCandidate),
      };
    } catch {
      // Try the source workspace when a managed worktree no longer has the file.
    }
  }
  throw new Error("引用文件不存在或不在当前项目目录内");
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (
    !relative.startsWith(`..${path.sep}`)
    && relative !== ".."
    && !path.isAbsolute(relative)
  );
}

function uniquePaths(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function citationMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".bmp": return "image/bmp";
    case ".gif": return "image/gif";
    case ".jpeg":
    case ".jpg": return "image/jpeg";
    case ".png": return "image/png";
    case ".svg": return "image/svg+xml";
    case ".webp": return "image/webp";
    case ".json": return "application/json";
    case ".md": return "text/markdown";
    case ".csv": return "text/csv";
    case ".xml": return "text/xml";
    case ".yaml":
    case ".yml": return "application/yaml";
    case ".txt": return "text/plain";
    case ".pdf": return "application/pdf";
    default: return "application/octet-stream";
  }
}

function isTextPreview(filePath: string, mimeType: string): boolean {
  if (mimeType.startsWith("text/") || mimeType === "application/json") return true;
  return new Set([
    ".c", ".cc", ".cpp", ".css", ".go", ".h", ".hpp", ".html",
    ".java", ".js", ".jsx", ".kt", ".py", ".rs", ".sh", ".sql",
    ".toml", ".ts", ".tsx", ".vue",
  ]).has(path.extname(filePath).toLowerCase());
}

export {
  channels as citationIpcChannels,
  readAttachmentCitation,
  readLocalCitation,
};
