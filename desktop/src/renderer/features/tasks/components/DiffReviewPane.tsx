import {
  memo,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileDiff as FileDiffIcon,
  GitBranch,
  LoaderCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";

import type {
  ConversationRunChanges,
  TaskWorktreeChanges,
  TaskWorktreeStatus,
} from "../../../../shared/model-contract";
import { FileDiff, rowsFromPatch, splitFilePath } from "./FileDiff";

interface DiffReviewPaneProps {
  changes: FileChange[];
  runChanges?: ConversationRunChanges;
  taskChanges?: TaskWorktreeChanges;
  taskWorktree?: TaskWorktreeStatus;
  selectedChangeId?: string;
  loading?: boolean;
  reverting?: boolean;
  worktreeAction?: "apply" | "branch" | "discard";
  error?: string;
  onSelectChange(changeId: string): void;
  onRevert?(): void;
  onApplyWorktree?(): void;
  onCreateWorktreeBranch?(branchName: string): void;
  onDiscardWorktree?(): void;
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
export const DiffReviewPane = memo(function DiffReviewPane({
  changes,
  runChanges,
  taskChanges,
  taskWorktree,
  selectedChangeId,
  loading = false,
  reverting = false,
  worktreeAction,
  error,
  onSelectChange,
  onRevert,
  onApplyWorktree,
  onCreateWorktreeBranch,
  onDiscardWorktree,
}: DiffReviewPaneProps) {
  const [expandedChangeIds, setExpandedChangeIds] = useState<Set<string>>(
    () => new Set(selectedChangeId ? [selectedChangeId] : []),
  );
  const additions = taskChanges?.additions ?? runChanges?.additions
    ?? changes.reduce((sum, change) => sum + (change.additions ?? 0), 0);
  const deletions = taskChanges?.deletions ?? runChanges?.deletions
    ?? changes.reduce((sum, change) => sum + (change.deletions ?? 0), 0);
  const conflictPaths = useMemo(
    () => new Set(
      (taskWorktree?.conflictPaths ?? []).map((path) =>
        path.replaceAll("\\", "/")),
    ),
    [taskWorktree?.conflictPaths],
  );

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
          <strong>{taskChanges ? "任务结果" : "上一轮"}</strong>
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

      {taskWorktree?.workspaceMode === "WORKTREE"
        && taskWorktree.worktreeState !== "REMOVED"
        && taskWorktree.worktreeState !== "RELEASED" && (
        <WorktreeActions
          status={taskWorktree}
          action={worktreeAction}
          onApply={onApplyWorktree}
          onCreateBranch={onCreateWorktreeBranch}
          onDiscard={onDiscardWorktree}
        />
      )}

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
        <div
          className="review-file-accordion"
          aria-label="已修改文件"
        >
          {changes.map((change, index) => {
            const path = splitFilePath(change.path);
            const expanded = expandedChangeIds.has(change.changeId);
            const rows = expanded
              || change.additions === undefined
              || change.deletions === undefined
              ? changeRows(change)
              : [];
            const fileAdditions = change.additions
              ?? rows.filter((row) => row.type === "add").length;
            const fileDeletions = change.deletions
              ?? rows.filter((row) => row.type === "del").length;
            const panelId = `review-file-panel-${index}`;
            const conflicted = conflictPaths.has(
              change.path.replaceAll("\\", "/"),
            );
            return (
              <article
                className={`review-file-item${expanded ? " is-expanded" : ""}${conflicted ? " is-conflicted" : ""}`}
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
                  <span className="review-file-conflict">
                    {conflicted ? "冲突" : ""}
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
                      parentScroll
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
});

function WorktreeActions({
  status,
  action,
  onApply,
  onCreateBranch,
  onDiscard,
}: {
  status: TaskWorktreeStatus;
  action?: "apply" | "branch" | "discard";
  onApply?(): void;
  onCreateBranch?(branchName: string): void;
  onDiscard?(): void;
}) {
  const [branchFormOpen, setBranchFormOpen] = useState(false);
  const [branchName, setBranchName] = useState("");
  const busy = Boolean(action);
  const reviewable = status.worktreeState === "WAITING_REVIEW"
    || status.worktreeState === "CONFLICTED";
  const summary = worktreeSummary(status);

  useEffect(() => {
    if (status.worktreeState === "BRANCHED") {
      setBranchFormOpen(false);
      setBranchName("");
    }
  }, [status.worktreeState]);

  return (
    <div className={`review-worktree is-${status.worktreeState.toLowerCase()}`}>
      <div className="review-worktree-status">
        <span aria-hidden="true" />
        <strong>{worktreeStateLabel(status)}</strong>
      </div>
      {summary && <p title={status.reason || summary}>{summary}</p>}

      {reviewable && (
        <div className="review-worktree-actions">
          <button
            className="is-primary"
            type="button"
            disabled={busy || !status.canApply}
            onClick={onApply}
          >
            {action === "apply"
              ? <LoaderCircle className="spin" size={13} />
              : <RotateCcw size={13} />}
            应用到 Local
          </button>
          <button
            type="button"
            disabled={busy || !status.canCreateBranch}
            onClick={() => setBranchFormOpen((open) => !open)}
          >
            <GitBranch size={13} />
            创建分支
          </button>
          <button
            className="is-danger"
            type="button"
            disabled={busy || !status.canDiscard}
            onClick={onDiscard}
          >
            {action === "discard"
              ? <LoaderCircle className="spin" size={13} />
              : <Trash2 size={13} />}
            放弃修改
          </button>
        </div>
      )}

      {reviewable && branchFormOpen && (
        <form
          className="review-worktree-branch-form"
          onSubmit={(event) => {
            event.preventDefault();
            const normalized = branchName.trim();
            if (normalized) onCreateBranch?.(normalized);
          }}
        >
          <input
            aria-label="新分支名称"
            autoFocus
            disabled={busy}
            maxLength={255}
            placeholder="例如 agent/auth-refactor"
            spellCheck={false}
            value={branchName}
            onChange={(event) => setBranchName(event.target.value)}
          />
          <button type="submit" disabled={busy || !branchName.trim()}>
            {action === "branch"
              ? <LoaderCircle className="spin" size={13} />
              : "创建"}
          </button>
        </form>
      )}
    </div>
  );
}

function worktreeStateLabel(status: TaskWorktreeStatus): string {
  switch (status.worktreeState) {
    case "WAITING_REVIEW": return "隔离修改等待处理";
    case "CONFLICTED": return "合并存在冲突";
    case "CLEANUP_PENDING": return "临时目录等待清理";
    case "BRANCHED": return status.branchName
      ? `已转为分支 ${status.branchName}`
      : "已转为正式分支";
    case "FAILED": return "Worktree 不可用";
    case "APPLYING": return "正在应用到 Local";
    default: return "临时 Worktree 正在使用";
  }
}

function worktreeSummary(status: TaskWorktreeStatus): string {
  if (status.worktreeState === "CONFLICTED") {
    const conflictCount = status.conflictPaths?.length ?? 0;
    return conflictCount > 0
      ? `${conflictCount} 个文件与 Local 修改存在冲突。请在下方展开标记文件进行审阅。`
      : "隔离结果与 Local 修改存在冲突。请审阅下方文件，或创建分支保留结果。";
  }
  if (status.worktreeState === "WAITING_REVIEW") {
    return "隔离修改已经完成，可以应用到 Local、创建分支或放弃修改。";
  }
  return status.reason;
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
