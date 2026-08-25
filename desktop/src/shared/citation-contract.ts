export type CitationSourceKind = "web" | "file" | "attachment" | "artifact";

export interface CitationReference {
  number: number;
  kind: CitationSourceKind;
  label: string;
  host?: string;
  url?: string;
  path?: string;
  attachmentId?: string;
  artifactId?: string;
  startLine?: number;
  endLine?: number;
  startPage?: number;
  endPage?: number;
}

export interface CitationPreviewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CitationWebPreviewInput {
  previewId: string;
  url: string;
  bounds: CitationPreviewBounds;
}

export interface CitationWebPreviewState {
  previewId: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error?: string;
}

export type CitationWebNavigationAction =
  | "back"
  | "forward"
  | "reload"
  | "stop";

export interface CitationLocalPreview {
  kind: "text" | "image" | "pdf" | "unsupported";
  name: string;
  displayPath: string;
  mimeType: string;
  content?: string;
  dataUrl?: string;
  byteSize: number;
  truncated: boolean;
}

export interface LumoraCitationApi {
  readLocal(taskId: string, path: string): Promise<CitationLocalPreview>;
  readAttachment(
    taskId: string,
    attachmentId: string,
  ): Promise<CitationLocalPreview>;
  showWeb(input: CitationWebPreviewInput): Promise<CitationWebPreviewState>;
  setWebBounds(previewId: string, bounds: CitationPreviewBounds): Promise<void>;
  hideWeb(previewId: string): Promise<void>;
  closeWeb(previewId: string): Promise<void>;
  navigateWeb(
    previewId: string,
    action: CitationWebNavigationAction,
  ): Promise<CitationWebPreviewState>;
  subscribeWebState(
    listener: (state: CitationWebPreviewState) => void,
  ): () => void;
}
