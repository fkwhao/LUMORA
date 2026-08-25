import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe2,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  Square,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type WheelEvent,
} from "react";

import type {
  CitationLocalPreview,
  CitationReference,
  CitationWebPreviewState,
} from "../../../../shared/citation-contract";
import type { LumoraModelApi } from "../../../../shared/model-contract";
import { MarkdownMessage } from "../../../components/MarkdownMessage";
import { SourceFilePreview } from "./FileDiff";

interface CitationPreviewPaneProps {
  taskId: string;
  previewId: string;
  reference: CitationReference;
  modelApi?: LumoraModelApi;
}

export function CitationPreviewPane({
  taskId,
  previewId,
  reference,
  modelApi,
}: CitationPreviewPaneProps) {
  if (reference.kind === "web" && reference.url) {
    return (
      <WebCitationPreview
        previewId={previewId}
        url={reference.url}
        fallbackTitle={reference.label}
      />
    );
  }
  return (
    <LocalCitationPreview
      taskId={taskId}
      reference={reference}
      modelApi={modelApi}
    />
  );
}

function WebCitationPreview({
  previewId,
  url,
  fallbackTitle,
}: {
  previewId: string;
  url: string;
  fallbackTitle: string;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<CitationWebPreviewState>({
    previewId,
    url,
    title: fallbackTitle,
    loading: true,
    canGoBack: false,
    canGoForward: false,
  });
  const api = window.lumora?.citations;

  useLayoutEffect(() => {
    if (!api) return;
    let frame: number | undefined;
    let stopped = false;
    let shown = false;
    let trackUntil = 0;
    const applyBounds = () => {
      const surface = surfaceRef.current;
      if (!surface || stopped) return;
      const bounds = surface.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) return;
      const nextBounds = {
        x: Math.round(bounds.left),
        y: Math.round(bounds.top),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };
      if (!shown) {
        shown = true;
        void api.showWeb({ previewId, url, bounds: nextBounds })
          .then((nextState) => {
            if (!stopped) setState(nextState);
          })
          .catch((error: unknown) => {
            shown = false;
            if (stopped) return;
            setState((current) => ({
              ...current,
              loading: false,
              error: error instanceof Error ? error.message : "网页预览加载失败",
            }));
          });
      } else {
        void api.setWebBounds(previewId, nextBounds).catch(() => undefined);
      }
    };
    const trackBounds = (time: number) => {
      frame = undefined;
      applyBounds();
      if (!stopped && time < trackUntil) {
        frame = window.requestAnimationFrame(trackBounds);
      }
    };
    const syncBounds = (duration = 0) => {
      trackUntil = Math.max(trackUntil, performance.now() + duration);
      if (frame === undefined) frame = window.requestAnimationFrame(trackBounds);
    };
    const unsubscribe = api.subscribeWebState((nextState) => {
      if (nextState.previewId === previewId) setState(nextState);
    });
    const observer = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(() => syncBounds());
    if (surfaceRef.current) observer?.observe(surfaceRef.current);
    const pane = surfaceRef.current?.closest(".conversation-usage-pane");
    const taskLayout = surfaceRef.current?.closest(".task-layout");
    const animatedContainers = [pane, taskLayout].filter(Boolean) as Element[];
    const isTrackedContainer = (event: Event) =>
      animatedContainers.includes(event.target as Element);
    const trackTransition = (event: Event) => {
      if (isTrackedContainer(event)) syncBounds(520);
    };
    const settleTransition = (event?: Event) => {
      if (!event || isTrackedContainer(event)) syncBounds();
    };
    const syncOnWindowResize = () => syncBounds();
    animatedContainers.forEach((container) => {
      container.addEventListener("transitionrun", trackTransition);
      container.addEventListener("transitionend", settleTransition);
      container.addEventListener("transitioncancel", settleTransition);
    });
    window.addEventListener("resize", syncOnWindowResize);
    // 首次展开时侧栏有位移动画，连续跟踪其 DOM 边界，避免原生网页视图停在动画前的位置。
    syncBounds(320);
    return () => {
      stopped = true;
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      animatedContainers.forEach((container) => {
        container.removeEventListener("transitionrun", trackTransition);
        container.removeEventListener("transitionend", settleTransition);
        container.removeEventListener("transitioncancel", settleTransition);
      });
      window.removeEventListener("resize", syncOnWindowResize);
      unsubscribe();
      if (shown) void api.hideWeb(previewId).catch(() => undefined);
    };
  }, [api, previewId, url]);

  const navigate = (action: "back" | "forward" | "reload" | "stop") => {
    if (!api) return;
    void api.navigateWeb(previewId, action).then(setState).catch((error: unknown) => {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "网页预览操作失败",
      }));
    });
  };

  return (
    <section className="citation-preview citation-web-preview">
      <header className="citation-preview-toolbar">
        <div className="citation-web-controls">
          <button
            type="button"
            aria-label="后退"
            disabled={!state.canGoBack}
            onClick={() => navigate("back")}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            aria-label="前进"
            disabled={!state.canGoForward}
            onClick={() => navigate("forward")}
          >
            <ChevronRight />
          </button>
          <button
            type="button"
            aria-label={state.loading ? "停止加载" : "重新加载"}
            onClick={() => navigate(state.loading ? "stop" : "reload")}
          >
            {state.loading ? <Square /> : <RefreshCw />}
          </button>
        </div>
        <div className="citation-web-address" title={state.url || url}>
          <Globe2 />
          <span>{webAddress(state.url || url)}</span>
        </div>
      </header>
      <div className="citation-web-surface" ref={surfaceRef}>
        <div className="citation-preview-placeholder" aria-hidden="true">
          {state.loading ? <LoaderCircle className="spin" /> : <Globe2 />}
          <span>{state.loading ? "正在加载网页" : fallbackTitle}</span>
        </div>
        {state.error && (
          <div className="citation-preview-error" role="alert">
            <strong>无法打开此网页</strong>
            <span>{state.error}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function LocalCitationPreview({
  taskId,
  reference,
  modelApi,
}: {
  taskId: string;
  reference: CitationReference;
  modelApi?: LumoraModelApi;
}) {
  const [preview, setPreview] = useState<CitationLocalPreview>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setPreview(undefined);
    setError(undefined);
    if (reference.kind === "file" && reference.path) {
      void window.lumora?.citations.readLocal(taskId, reference.path)
        .then((result) => {
          if (!cancelled) setPreview(result);
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : "文件预览失败");
          }
        });
    } else if (reference.kind === "artifact" && reference.artifactId && modelApi) {
      void modelApi.readArtifact(taskId, reference.artifactId)
        .then((result) => {
          if (!cancelled) {
            setPreview({
              kind: "text",
              name: reference.label,
              displayPath: reference.artifactId ?? "Artifact",
              mimeType: result.mimeType,
              content: result.content,
              byteSize: result.byteSize,
              truncated: result.hasMore,
            });
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : "运行结果预览失败");
          }
        });
    } else if (reference.kind === "attachment" && reference.attachmentId) {
      void window.lumora?.citations.readAttachment(taskId, reference.attachmentId)
        .then((result) => {
          if (!cancelled) setPreview(result);
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : "附件预览失败");
          }
        });
    } else {
      setError("这条引用的本地来源已经失效");
    }
    return () => {
      cancelled = true;
    };
  }, [modelApi, reference, taskId]);

  const location = localLocation(reference);

  return (
    <section className="citation-preview citation-local-preview">
      {preview && preview.kind !== "text" && (
        <header className="citation-local-header">
          <span className="citation-local-icon">
            {preview?.kind === "image" ? <ImageIcon /> : <FileText />}
          </span>
          <div>
            <strong>{preview?.name || reference.label}</strong>
            <span>{preview?.displayPath || location}</span>
          </div>
          {location && <small>{location}</small>}
        </header>
      )}
      {!preview && !error && (
        <div className="citation-preview-placeholder">
          <LoaderCircle className="spin" />
          <span>正在读取来源</span>
        </div>
      )}
      {error && (
        <div className="citation-preview-error" role="alert">
          <strong>无法预览来源</strong>
          <span>{error}</span>
        </div>
      )}
      {preview?.kind === "image" && preview.dataUrl && (
        <div className="citation-image-preview">
          <img src={preview.dataUrl} alt={preview.name} />
        </div>
      )}
      {preview?.kind === "pdf" && preview.dataUrl && (
        <div className="citation-pdf-preview">
          <embed
            src={`${preview.dataUrl}${reference.startPage ? `#page=${reference.startPage}` : ""}`}
            type="application/pdf"
            title={preview.name}
          />
        </div>
      )}
      {preview?.kind === "text" && (
        <CitationTextPreview reference={reference} preview={preview} />
      )}
      {preview?.kind === "unsupported" && (
        <div className="citation-preview-placeholder">
          <FileText />
          <span>该文件类型暂不支持内嵌预览</span>
        </div>
      )}
    </section>
  );
}

function CitationTextPreview({
  reference,
  preview,
}: {
  reference: CitationReference;
  preview: CitationLocalPreview;
}) {
  const file = reference.kind === "file"
    ? (reference.path ?? preview.displayPath) || preview.name
    : preview.displayPath || preview.name;
  const markdown = isMarkdownFile(file, preview.mimeType);
  const [showSource, setShowSource] = useState(!markdown);
  const breadcrumb = citationBreadcrumbParts(preview.displayPath || file);

  useEffect(() => {
    setShowSource(!markdown);
  }, [file, markdown]);

  return (
    <div className="citation-text-preview">
      <header className="citation-file-toolbar">
        <div
          aria-label={`文件路径：${breadcrumb.join(" / ")}`}
          className="citation-file-breadcrumb"
          onWheel={scrollBreadcrumb}
          role="navigation"
          title={preview.displayPath || file}
        >
          {breadcrumb.map((segment, index) => (
            <span className="citation-file-breadcrumb-entry" key={`${segment}-${index}`}>
              <span className={index === breadcrumb.length - 1 ? "is-current" : undefined}>
                {segment}
              </span>
              {index < breadcrumb.length - 1 && (
                <ChevronRight aria-hidden="true" size={11} />
              )}
            </span>
          ))}
        </div>
        {markdown && (
          <button
            className="citation-markdown-mode"
            type="button"
            onClick={() => setShowSource((current) => !current)}
          >
            {showSource ? "预览" : "查看源代码"}
          </button>
        )}
      </header>
      <div className="citation-file-content">
        {markdown && !showSource ? (
          <div className="citation-markdown-preview">
            <MarkdownMessage content={preview.content ?? ""} />
          </div>
        ) : (
          <div className="citation-source-file-panel">
            <SourceFilePreview
              file={file}
              content={preview.content ?? ""}
              startLine={reference.kind === "file" ? reference.startLine : undefined}
              endLine={reference.kind === "file" ? reference.endLine : undefined}
              truncated={preview.truncated}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function citationBreadcrumbParts(value: string): string[] {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 ? parts : [value || "未命名文件"];
}

export function isMarkdownFile(file: string, mimeType?: string): boolean {
  return mimeType?.toLowerCase() === "text/markdown"
    || /\.(?:md|markdown)$/i.test(file);
}

function scrollBreadcrumb(event: WheelEvent<HTMLDivElement>) {
  const element = event.currentTarget;
  if (
    element.scrollWidth <= element.clientWidth
    || Math.abs(event.deltaX) >= Math.abs(event.deltaY)
  ) return;
  element.scrollLeft += event.deltaY;
  event.preventDefault();
}

function localLocation(reference: CitationReference): string {
  if (reference.kind === "file" && reference.startLine) {
    return reference.endLine && reference.endLine !== reference.startLine
      ? `L${reference.startLine}–${reference.endLine}`
      : `L${reference.startLine}`;
  }
  if (reference.kind === "attachment" && reference.startPage) {
    return reference.endPage && reference.endPage !== reference.startPage
      ? `第 ${reference.startPage}–${reference.endPage} 页`
      : `第 ${reference.startPage} 页`;
  }
  return "";
}

function webAddress(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}
