import {
  memo,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileDiff as FileDiffIcon,
  GitBranch,
  GitCommitHorizontal,
  Layers3,
  LoaderCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";

import type {
  ConversationRunChanges,
  TaskWorktreeChanges,
  TaskWorktreeStatus,
} from "../../../../shared/model-contract";
import type {
  GitBranchSummary,
  GitCommitSummary,
  GitReviewChanges,
  GitReviewScope,
} from "../../../../shared/workspace-contract";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";
import { FileDiff, rowsFromPatch, splitFilePath } from "./FileDiff";

interface DiffReviewPaneProps {
  changes: FileChange[];
  runChanges?: ConversationRunChanges;
  taskChanges?: TaskWorktreeChanges;
  taskWorktree?: TaskWorktreeStatus;
  scope?: GitReviewScope;
  scopeChanges?: GitReviewChanges;
  lastRunId?: string;
  branches?: GitBranchSummary[];
  commits?: GitCommitSummary[];
  currentBranch?: string;
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
  onScopeChange?(scope: GitReviewScope): void;
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
  scope,
  scopeChanges,
  lastRunId,
  branches = [],
  commits = [],
  currentBranch,
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
  onScopeChange,
}: DiffReviewPaneProps) {
  const [expandedChangeIds, setExpandedChangeIds] = useState<Set<string>>(
    () => new Set(selectedChangeId ? [selectedChangeId] : []),
  );
  const visibleSummary = scopeChanges
    ?? (scope?.scope === "LAST_RUN" ? runChanges : taskChanges ?? runChanges);
  const additions = visibleSummary?.additions
    ?? changes.reduce((sum, change) => sum + (change.additions ?? 0), 0);
  const deletions = visibleSummary?.deletions
    ?? changes.reduce((sum, change) => sum + (change.deletions ?? 0), 0);
  const reviewReason = scopeChanges
    ? scopeChanges.reason
    : isLastRunScope(scope)
      ? runChanges?.reason
      : taskChanges?.reason;
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
          <ReviewScopePicker
            scope={scope}
            lastRunId={lastRunId}
            branches={branches}
            commits={commits}
            currentBranch={currentBranch}
            fallbackLabel={taskChanges ? "任务结果" : "本轮"}
            disabled={!onScopeChange || loading}
            onChange={onScopeChange}
          />
          <span className="review-total-add">+{additions}</span>
          <span className="review-total-del">−{deletions}</span>
        </div>
        {runChanges && isLastRunScope(scope) && onRevert && (
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
      {!loading && !error && reviewReason && (
        <div className="review-notice">
          <AlertTriangle size={13} />
          <span>{reviewReason}</span>
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
          <strong>{emptyScopeTitle(scope)}</strong>
          <p>{isLastRunScope(scope)
            && (runChanges?.status === "UNAVAILABLE" || runChanges?.status === "COLLIDED")
            ? "该 Run 未获得 Git 变更追踪。"
            : emptyScopeMessage(scope)}</p>
        </div>
      )}
    </section>
  );
});

function ReviewScopePicker({
  scope,
  lastRunId,
  branches,
  commits,
  currentBranch,
  fallbackLabel,
  disabled,
  onChange,
}: {
  scope?: GitReviewScope;
  lastRunId?: string;
  branches: GitBranchSummary[];
  commits: GitCommitSummary[];
  currentBranch?: string;
  fallbackLabel: string;
  disabled: boolean;
  onChange?(scope: GitReviewScope): void;
}) {
  const [open, setOpen] = useState(false);
  const simpleScopes: Array<{ scope: GitReviewScope["scope"]; label: string }> = [
    { scope: "UNCOMMITTED", label: "全部未提交" },
    { scope: "UNSTAGED", label: "未暂存" },
    { scope: "STAGED", label: "已暂存" },
  ];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="review-scope-trigger"
        disabled={disabled}
        aria-label={`审阅范围：${reviewScopeLabel(scope, commits, fallbackLabel)}`}
      >
        <strong>{reviewScopeLabel(scope, commits, fallbackLabel)}</strong>
        <ChevronDown size={13} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={7}
        className="workspace-menu review-scope-menu"
      >
        <div className="review-scope-section" role="menu">
          <span className="review-scope-section-title">工作区</span>
          {lastRunId && (
            <ScopeOption
              active={isLastRunScope(scope)}
              icon={<RotateCcw size={14} />}
              label="本轮"
              onClick={() => {
                onChange?.({ scope: "LAST_RUN", runId: lastRunId });
                setOpen(false);
              }}
            />
          )}
          {simpleScopes.map((item) => (
            <ScopeOption
              active={scope?.scope === item.scope}
              icon={<Layers3 size={14} />}
              key={item.scope}
              label={item.label}
              onClick={() => {
                onChange?.({ scope: item.scope });
                setOpen(false);
              }}
            />
          ))}
        </div>
        <div className="review-scope-section" role="menu">
          <span className="review-scope-section-title">某次提交</span>
          {commits.length === 0 && <p className="review-scope-unavailable">暂无提交历史</p>}
          {commits.slice(0, 12).map((commit) => (
            <ScopeOption
              active={scope?.scope === "COMMIT" && scope.commitSha === commit.sha}
              icon={<GitCommitHorizontal size={14} />}
              key={commit.sha}
              label={commit.summary}
              meta={commit.shortSha || commit.sha.slice(0, 8)}
              onClick={() => {
                onChange?.({ scope: "COMMIT", commitSha: commit.sha });
                setOpen(false);
              }}
            />
          ))}
        </div>
        <div className="review-scope-section" role="menu">
          <span className="review-scope-section-title">分支比较</span>
          {branches.length === 0 && <p className="review-scope-unavailable">暂无其他分支</p>}
          {branches
            .filter((branch) => branch.name !== currentBranch)
            .map((branch) => (
              <ScopeOption
                active={scope?.scope === "BRANCH_COMPARE"
                  && scope.baseRef === branch.name}
                icon={<GitBranch size={14} />}
                key={branch.name}
                label={branch.name}
                meta={`与 ${currentBranch || "HEAD"} 比较`}
                onClick={() => {
                  onChange?.({
                    scope: "BRANCH_COMPARE",
                    baseRef: branch.name,
                    headRef: currentBranch,
                  });
                  setOpen(false);
                }}
              />
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ScopeOption({
  active,
  icon,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  meta?: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      className="review-scope-option"
      onClick={onClick}
    >
      {icon}
      <span><strong>{label}</strong>{meta && <small>{meta}</small>}</span>
      {active && <ChevronRight size={12} />}
    </button>
  );
}

function isLastRunScope(scope?: GitReviewScope): boolean {
  return !scope || scope.scope === "LAST_RUN";
}

function reviewScopeLabel(
  scope: GitReviewScope | undefined,
  commits: GitCommitSummary[],
  fallbackLabel = "本轮",
): string {
  if (!scope) return fallbackLabel;
  if (scope.scope === "LAST_RUN") return "本轮";
  if (scope.scope === "UNCOMMITTED") {
    return "全部未提交";
  }
  if (scope.scope === "UNSTAGED") return "未暂存";
  if (scope.scope === "STAGED") return "已暂存";
  if (scope.scope === "COMMIT") {
    const commit = commits.find((item) => item.sha === scope.commitSha);
    return commit?.summary || `提交 ${scope.commitSha?.slice(0, 8) ?? ""}`;
  }
  return `比较 ${scope.baseRef ?? "分支"}`;
}

function emptyScopeMessage(scope?: GitReviewScope): string {
  switch (scope?.scope) {
    case "UNCOMMITTED":
      return "当前环境没有未提交改动。";
    case "UNSTAGED": return "当前环境没有未暂存改动。";
    case "STAGED": return "当前环境没有已暂存改动。";
    case "COMMIT": return "这个提交没有可展示的文本改动。";
    case "BRANCH_COMPARE":
    default: return "Agent 没有改变工作区内容。";
  }
}

function emptyScopeTitle(scope?: GitReviewScope): string {
  return isLastRunScope(scope) ? "本轮没有文件改动" : "当前范围没有文件改动";
}

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
    return status.reason
      || "隔离修改已经完成，可以应用到 Local、创建分支或放弃修改。";
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
