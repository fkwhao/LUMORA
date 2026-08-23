import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  FilePlus2,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";

import type {
  ConversationFileChange,
  ConversationRunChanges,
  WorkLogItem,
} from "../../../../shared/model-contract";
import { FileDiff, rowsFromPatch, splitFilePath } from "./FileDiff";
import styles from "./RunChangesCard.module.css";

const HOVER_PREVIEW_DELAY_MS = 320;
const PROVISIONAL_PATCH_LINE_LIMIT = 180;

/**
 * Builds an immediate, bounded Changes summary from completed file tools.
 * The Git checkpoint result replaces this provisional value as soon as it is
 * available, so the answer layout does not jump while Core captures the diff.
 */
export function provisionalRunChangesFromWorkLog(
  runId: string,
  workLog?: WorkLogItem[],
): ConversationRunChanges | undefined {
  const files = new Map<string, ConversationFileChange>();

  for (const item of workLog ?? []) {
    if (
      item.status !== "completed"
      || (item.toolName !== "apply_patch" && item.toolName !== "write_file")
    ) continue;

    const path = stringArgument(item.arguments?.path);
    if (!path) continue;
    const oldText = item.toolName === "apply_patch"
      ? stringArgument(item.arguments?.oldText)
      : "";
    const newText = item.toolName === "apply_patch"
      ? stringArgument(item.arguments?.newText)
      : stringArgument(item.arguments?.content);
    const part = provisionalPatch(path, oldText, newText);
    const key = path.replaceAll("\\", "/");
    const current = files.get(key);

    if (current) {
      current.additions += lineCount(newText);
      current.deletions += lineCount(oldText);
      current.patch = [current.patch, part.patch].filter(Boolean).join("\n");
      current.patchTruncated ||= part.truncated;
      continue;
    }

    files.set(key, {
      path,
      previousPath: "",
      status: item.toolName === "write_file" ? "ADDED" : "MODIFIED",
      additions: lineCount(newText),
      deletions: lineCount(oldText),
      binary: false,
      patch: part.patch,
      patchTruncated: part.truncated,
    });
  }

  const changedFiles = [...files.values()];
  if (changedFiles.length === 0) return undefined;
  return {
    runId,
    status: "TRACKING",
    repositoryRoot: "",
    reason: "正在确认 Git 变更",
    additions: changedFiles.reduce((sum, file) => sum + file.additions, 0),
    deletions: changedFiles.reduce((sum, file) => sum + file.deletions, 0),
    revertible: false,
    files: changedFiles,
  };
}

interface RunChangesCardProps {
  changes: ConversationRunChanges;
  reverting?: boolean;
  visibleFileCount?: number;
  onReview(filePath?: string): void;
  onRevert(): void;
}

/** Compact, per-answer summary for the files changed by one Agent run. */
export function RunChangesCard({
  changes,
  reverting = false,
  visibleFileCount = 3,
  onReview,
  onRevert,
}: RunChangesCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = Math.max(0, changes.files.length - visibleFileCount);
  const visibleFiles = useMemo(
    () => expanded ? changes.files : changes.files.slice(0, visibleFileCount),
    [changes.files, expanded, visibleFileCount],
  );
  const reverted = changes.status === "REVERTED";
  const revertTitle = reverted
    ? "本轮已经撤销"
    : changes.revertible
      ? "恢复文件并撤销本轮回答"
      : changes.reason || "当前变更不能安全撤销";

  if (changes.files.length === 0) return null;

  return (
    <section className={styles.card} aria-label="本轮文件变更">
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          <FilePlus2 size={20} strokeWidth={1.75} />
        </span>
        <div className={styles.summary}>
          <strong>已编辑 {changes.files.length} 个文件</strong>
          <span className={styles.totals} aria-label={`新增 ${changes.additions} 行，删除 ${changes.deletions} 行`}>
            <em className={styles.added}>+{changes.additions}</em>
            <em className={styles.deleted}>-{changes.deletions}</em>
          </span>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.revertButton}
            type="button"
            disabled={!changes.revertible || reverted || reverting}
            title={revertTitle}
            onClick={onRevert}
          >
            {reverting ? (
              <LoaderCircle className={styles.spin} size={14} />
            ) : (
              <RotateCcw size={14} strokeWidth={1.8} />
            )}
            {reverted ? "已撤销" : "撤销"}
          </button>
          <button
            className={styles.reviewButton}
            type="button"
            onClick={() => onReview()}
          >
            审核
          </button>
        </div>
      </header>

      <div className={styles.fileList} aria-label="已编辑文件">
        {visibleFiles.map((file) => (
          <FileChangeRow
            file={file}
            key={`${file.previousPath}:${file.path}`}
            onReview={onReview}
          />
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          className={styles.expandButton}
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <span>{expanded ? "收起文件列表" : `再显示 ${hiddenCount} 个文件`}</span>
          {expanded ? (
            <ChevronUp size={15} strokeWidth={1.9} />
          ) : (
            <ChevronDown size={15} strokeWidth={1.9} />
          )}
        </button>
      )}
    </section>
  );
}

function FileChangeRow({
  file,
  onReview,
}: {
  file: ConversationFileChange;
  onReview(filePath?: string): void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLayout, setPreviewLayout] = useState<PreviewLayout>();
  const openTimerRef = useRef<number | undefined>(undefined);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const rowRef = useRef<HTMLButtonElement>(null);
  const previewId = useId();
  const patchRows = useMemo(() => rowsFromPatch(file.patch), [file.patch]);
  const previewRows = patchRows.slice(0, 180);
  const previewTruncated = file.patchTruncated || patchRows.length > previewRows.length;
  const filePath = splitFilePath(file.path);

  const cancelOpen = () => {
    if (openTimerRef.current !== undefined) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = undefined;
    }
  };
  const cancelClose = () => {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  };
  const openPreview = () => {
    cancelOpen();
    cancelClose();
    const anchor = rowRef.current?.getBoundingClientRect();
    if (anchor) setPreviewLayout(resolvePreviewLayout(anchor));
    setPreviewOpen(true);
  };
  const scheduleOpen = () => {
    cancelOpen();
    cancelClose();
    if (previewOpen) return;
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = undefined;
      openPreview();
    }, HOVER_PREVIEW_DELAY_MS);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setPreviewOpen(false);
    }, 120);
  };

  useEffect(() => {
    return () => {
      cancelOpen();
      cancelClose();
    };
  }, []);

  useEffect(() => {
    if (!previewOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewOpen]);

  return (
    <>
      <button
        ref={rowRef}
        className={styles.fileRow}
        type="button"
        aria-label={`审核 ${file.path}`}
        aria-describedby={previewOpen ? previewId : undefined}
        onClick={() => onReview(file.path)}
        onFocus={openPreview}
        onBlur={scheduleClose}
        onMouseEnter={scheduleOpen}
        onMouseLeave={() => {
          cancelOpen();
          scheduleClose();
        }}
      >
        <span className={styles.filePath} title={file.path}>
          {filePath.directory && (
            <span className={styles.fileDirectory}>{filePath.directory}</span>
          )}
          <span className={styles.fileName}>{filePath.name}</span>
        </span>
        <span className={styles.fileStats} aria-label={`${file.path} 新增 ${file.additions} 行，删除 ${file.deletions} 行`}>
          {file.additions > 0 && <em className={styles.added}>+{file.additions}</em>}
          {file.deletions > 0 && <em className={styles.deleted}>-{file.deletions}</em>}
        </span>
      </button>
      {previewOpen && previewLayout && createPortal(
        <aside
          id={previewId}
          className={styles.hoverPreview}
          role="tooltip"
          style={previewLayout.style}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <FileDiff
            preview
            file={file.path}
            rows={previewRows}
            additions={file.additions}
            deletions={file.deletions}
            maxBodyHeight={previewLayout.bodyHeight}
            truncated={previewTruncated}
            truncatedMessage="悬浮预览仅展示前 180 行，点击文件查看完整改动"
            emptyMessage={file.binary
              ? "二进制文件已改变，无法生成文本预览"
              : "该文件没有可展示的文本补丁"}
          />
        </aside>,
        document.body,
      )}
    </>
  );
}

interface PreviewLayout {
  style: CSSProperties;
  bodyHeight: number;
}

function resolvePreviewLayout(anchor: DOMRect): PreviewLayout {
  const padding = 14;
  const gap = 9;
  const idealWidth = 840;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = snapToDevicePixel(Math.min(
    idealWidth,
    Math.max(420, anchor.width - 40),
    viewportWidth - padding * 2,
  ));
  const centeredLeft = anchor.left + (anchor.width - width) / 2;
  const left = snapToDevicePixel(Math.min(
    Math.max(padding, centeredLeft),
    viewportWidth - width - padding,
  ));
  const availableHeight = Math.max(98, anchor.top - gap - padding);
  const bodyHeight = snapToDevicePixel(
    Math.max(56, Math.min(340, availableHeight - 42)),
  );

  return {
    style: {
      bottom: snapToDevicePixel(viewportHeight - anchor.top + gap),
      left,
      width,
    },
    bodyHeight,
  };
}

function provisionalPatch(
  path: string,
  oldText: string,
  newText: string,
): { patch: string; truncated: boolean } {
  const unavailableMarker = "[内容未持久化]";
  if (oldText === unavailableMarker || newText === unavailableMarker) {
    return { patch: "", truncated: true };
  }
  const oldLines = lines(oldText);
  const newLines = lines(newText);
  const visibleOldLines = oldLines.slice(0, PROVISIONAL_PATCH_LINE_LIMIT);
  const visibleNewLines = newLines.slice(0, PROVISIONAL_PATCH_LINE_LIMIT);
  return {
    patch: [
      `diff --git a/${path} b/${path}`,
      `--- a/${path}`,
      `+++ b/${path}`,
      `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
      ...visibleOldLines.map((line) => `-${line}`),
      ...visibleNewLines.map((line) => `+${line}`),
    ].join("\n"),
    truncated:
      oldLines.length > visibleOldLines.length
      || newLines.length > visibleNewLines.length,
  };
}

function lines(value: string): string[] {
  return value ? value.split(/\r?\n/) : [];
}

function lineCount(value: string): number {
  return lines(value).length;
}

function stringArgument(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function snapToDevicePixel(value: number): number {
  const scale = window.devicePixelRatio || 1;
  return Math.round(value * scale) / scale;
}
