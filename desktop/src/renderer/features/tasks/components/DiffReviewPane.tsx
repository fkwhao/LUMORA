import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileDiff as FileDiffIcon,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";

import type { ConversationRunChanges } from "../../../../shared/model-contract";
import { FileDiff, rowsFromPatch, splitFilePath } from "./FileDiff";

interface DiffReviewPaneProps {
  changes: FileChange[];
  runChanges?: ConversationRunChanges;
  selectedChangeId?: string;
  loading?: boolean;
  reverting?: boolean;
  error?: string;
  onSelectChange(changeId: string): void;
  onRevert?(): void;
}

export interface FileChange {
  changeId: string;
  path: string;
  previousPath?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  binary?: boolean;
  patch?: string;
  patchTruncated?: boolean;
  oldText?: string;
  newText?: string;
  previewAvailable: boolean;
}

/** Real Git changes for a Run, with a bounded tool-event fallback for history. */
export function DiffReviewPane({
  changes,
  runChanges,
  selectedChangeId,
  loading = false,
  reverting = false,
  error,
  onSelectChange,
  onRevert,
}: DiffReviewPaneProps) {
  const [expandedChangeIds, setExpandedChangeIds] = useState<Set<string>>(
    () => new Set(selectedChangeId ? [selectedChangeId] : []),
  );
  const additions = runChanges?.additions
    ?? changes.reduce((sum, change) => sum + (change.additions ?? 0), 0);
  const deletions = runChanges?.deletions
    ?? changes.reduce((sum, change) => sum + (change.deletions ?? 0), 0);

  useEffect(() => {
    if (!selectedChangeId) return;
    setExpandedChangeIds((current) => {
      if (current.has(selectedChangeId)) return current;
      const next = new Set(current);
      next.add(selectedChangeId);
      return next;
    });
  }, [selectedChangeId]);

  const toggleChange = (changeId: string) => {
    onSelectChange(changeId);
    setExpandedChangeIds((current) => {
      const next = new Set(current);
      if (next.has(changeId)) next.delete(changeId);
      else next.add(changeId);
      return next;
    });
  };

  return (
    <section className="review-pane-content" aria-label="变更审阅内容">
      <div className="review-toolbar">
        <div className="review-toolbar-copy">
          <strong>上一轮</strong>
          <ChevronDown size={13} aria-hidden="true" />
          <span className="review-total-add">+{additions}</span>
          <span className="review-total-del">−{deletions}</span>
        </div>
        {runChanges && onRevert && (
          <button
            className="review-revert-button"
            type="button"
            disabled={!runChanges.revertible || reverting}
            title={runChanges.revertible ? "恢复文件并撤回本轮消息" : runChanges.reason}
            onClick={onRevert}
          >
            {reverting ? <LoaderCircle className="spin" size={12} /> : <RotateCcw size={12} />}
            {runChanges.status === "REVERTED" ? "已撤回" : "撤回本轮"}
          </button>
        )}
      </div>

      {loading && (
        <div className="review-state" role="status">
          <LoaderCircle className="spin" size={18} />
          <span>正在读取 Git 变更…</span>
        </div>
      )}
      {!loading && error && (
        <div className="review-state is-error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}
      {!loading && !error && runChanges?.reason && (
        <div className="review-notice">
          <AlertTriangle size={13} />
          <span>{runChanges.reason}</span>
        </div>
      )}

      {!loading && !error && changes.length > 0 && (
        <div className="review-file-accordion" aria-label="已修改文件">
          {changes.map((change, index) => {
            const path = splitFilePath(change.path);
            const rows = changeRows(change);
            const expanded = expandedChangeIds.has(change.changeId);
            const fileAdditions = change.additions
              ?? rows.filter((row) => row.type === "add").length;
            const fileDeletions = change.deletions
              ?? rows.filter((row) => row.type === "del").length;
            const panelId = `review-file-panel-${index}`;
            return (
              <article
                className={`review-file-item${expanded ? " is-expanded" : ""}`}
                key={change.changeId}
              >
                <button
                  aria-controls={panelId}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "折叠" : "展开"} ${change.path}`}
                  className="review-file-trigger"
                  type="button"
                  onClick={() => toggleChange(change.changeId)}
                >
                  <ChevronRight className="review-file-chevron" size={13} />
                  <span className="review-file-type" aria-hidden="true">
                    {fileExtension(change.path)}
                  </span>
                  <span className="review-file-path" title={change.path}>
                    {path.directory && (
                      <span className="review-file-directory">{path.directory}</span>
                    )}
                    <span className="review-file-name">{path.name}</span>
                  </span>
                  <span className="review-file-stats" aria-label={`${fileAdditions} 行新增，${fileDeletions} 行删除`}>
                    <span>+{fileAdditions}</span>
                    <span>−{fileDeletions}</span>
                  </span>
                </button>
                {expanded && (
                  <div className="review-file-panel" id={panelId}>
                    <FileDiff
                      file={change.path}
                      rows={rows}
                      additions={fileAdditions}
                      deletions={fileDeletions}
                      headerless
                      truncated={change.patchTruncated}
                      emptyMessage={change.binary
                        ? "二进制文件已改变，无法生成文本预览"
                        : change.patchTruncated
                          ? "补丁过大，预览已截断"
                          : "该文件没有可展示的文本补丁"}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {!loading && !error && changes.length === 0 && (
        <div className="review-empty">
          <span><FileDiffIcon size={22} /></span>
          <strong>本轮没有文件改动</strong>
          <p>{runChanges?.status === "UNAVAILABLE" || runChanges?.status === "COLLIDED"
            ? "该 Run 未获得 Git 变更追踪。"
            : "Agent 没有改变工作区内容。"}</p>
        </div>
      )}
    </section>
  );
}

function changeRows(change: FileChange) {
  if (change.patch) return rowsFromPatch(change.patch);
  if (!change.previewAvailable) return [];
  const removed = (change.oldText ?? "").split("\n").map((text, index) => ({
    old: index + 1,
    cur: null,
    type: "del" as const,
    text,
  }));
  const added = (change.newText ?? "").split("\n").map((text, index) => ({
    old: null,
    cur: index + 1,
    type: "add" as const,
    text,
  }));
  return [...removed, ...added];
}

function fileExtension(path: string): string {
  const name = splitFilePath(path).name;
  const extension = name.includes(".") ? name.split(".").pop() : undefined;
  return (extension || "FILE").slice(0, 4).toUpperCase();
}
