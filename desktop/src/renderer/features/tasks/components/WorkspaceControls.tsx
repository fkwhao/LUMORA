import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRightLeft,
  Check,
  ChevronDown,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  HardDrive,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react";

import type {
  GitCommitSummary,
  LumoraWorkspaceApi,
  WorkspaceContext,
  WorkspaceEnvironmentSummary,
  WorkspaceEnvironmentTarget,
} from "../../../../shared/workspace-contract";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";

interface WorkspaceControlsProps {
  api?: LumoraWorkspaceApi;
  taskId: string;
  workspacePath?: string;
  refreshToken?: number;
  disabled?: boolean;
  onContextChange?(context: WorkspaceContext): void;
  notify(message: string, tone?: "info" | "success"): void;
}

type EnvironmentView = "choices" | "manage";

export function WorkspaceControls({
  api,
  taskId,
  workspacePath,
  refreshToken,
  disabled = false,
  onContextChange,
  notify,
}: WorkspaceControlsProps) {
  const [context, setContext] = useState<WorkspaceContext>();
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string>();
  const [environmentView, setEnvironmentView] =
    useState<EnvironmentView>("choices");
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchView, setBranchView] = useState<"branches" | "history">("branches");
  const [history, setHistory] = useState<GitCommitSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [branchName, setBranchName] = useState("");

  useEffect(() => {
    if (!api || !workspacePath) {
      setContext(undefined);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void api.inspect({ workspacePath, taskId })
      .then((next) => {
        if (cancelled) return;
        setContext(next);
        onContextChange?.(next);
      })
      .catch(() => {
        if (!cancelled) setContext(undefined);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [api, disabled, onContextChange, refreshToken, taskId, workspacePath]);

  const busy = Boolean(action);
  const controlsDisabled = disabled || busy || !api || !workspacePath;
  const environment = context?.environment;
  const worktrees = context?.worktrees ?? [];
  const branch = context?.branch;
  const gitAvailable = Boolean(context?.repositoryRoot);

  function acceptContext(next: WorkspaceContext) {
    setContext(next);
    onContextChange?.(next);
  }

  async function handoff(
    target: WorkspaceEnvironmentTarget,
    worktreePath?: string,
  ) {
    if (!api || controlsDisabled) return;
    setAction(`handoff:${target}:${worktreePath ?? ""}`);
    try {
      const next = await api.handoff({
        taskId,
        target,
        worktreePath,
        expectedRevision: context?.workspaceRevision,
      });
      acceptContext(next);
      setEnvironmentOpen(false);
      notify(
        target === "LOCAL"
          ? "已 Handoff 到 Local"
          : target === "NEW_WORKTREE"
            ? !next.environment.worktreePath
              ? "已选择 Worktree，下轮启动时创建"
              : "已切换为 Worktree 环境"
            : "已 Handoff 到所选 Worktree",
        "success",
      );
    } catch (error) {
      notify(errorMessage(error, "切换工作环境失败"));
    } finally {
      setAction(undefined);
    }
  }

  async function toggleAutoApply() {
    if (
      !api
      || controlsDisabled
      || environment?.mode !== "WORKTREE"
      || environment.canAutoApply === false
    ) return;
    const enabled = !environment.autoApplyWhenClean;
    setAction("auto-apply");
    try {
      const next = await api.setWorktreeAutoApply({
        taskId,
        enabled,
        expectedSettingsRevision: environment.settingsRevision,
      });
      acceptContext(next);
      setBranchOpen(false);
      notify(enabled ? "已开启无冲突自动应用" : "已关闭自动应用", "success");
    } catch (error) {
      notify(errorMessage(error, "更新自动应用设置失败"));
    } finally {
      setAction(undefined);
    }
  }

  async function checkoutBranch(name: string) {
    if (!api || controlsDisabled || name === branch?.name) return;
    setAction(`checkout:${name}`);
    try {
      const next = await api.checkoutBranch({
        taskId,
        branchName: name,
        expectedHead: context?.headSha,
        expectedRevision: context?.workspaceRevision,
      });
      acceptContext(next);
      setBranchOpen(false);
      notify(`已切换到 ${name}`, "success");
    } catch (error) {
      notify(errorMessage(error, "切换分支失败"));
    } finally {
      setAction(undefined);
    }
  }

  async function createBranch() {
    const name = branchName.trim();
    if (!api || controlsDisabled || !name) return;
    setAction("create-branch");
    try {
      const next = await api.createBranch({
        taskId,
        branchName: name,
        checkout: true,
        expectedRevision: context?.workspaceRevision,
      });
      acceptContext(next);
      setBranchName("");
      setCreateBranchOpen(false);
      setBranchOpen(false);
      notify(`已创建并检出 ${name}`, "success");
    } catch (error) {
      notify(errorMessage(error, "创建分支失败"));
    } finally {
      setAction(undefined);
    }
  }

  async function openHistory() {
    if (!api || historyLoading) return;
    setBranchView("history");
    if (history.length > 0) return;
    setHistoryLoading(true);
    try {
      const page = await api.listHistory({ taskId, limit: 30 });
      setHistory(page.commits);
    } catch (error) {
      notify(errorMessage(error, "读取提交历史失败"));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function removeWorktree(worktree: WorkspaceEnvironmentSummary) {
    const worktreePath = worktree.worktreePath ?? worktree.path;
    if (!api || controlsDisabled || !worktreePath || !worktree.removable) return;
    setAction(`remove:${worktreePath}`);
    try {
      const next = await api.removeWorktree({ taskId, worktreePath });
      setContext((current) => current ? { ...current, worktrees: next } : current);
      notify("临时 Worktree 已移除", "success");
    } catch (error) {
      notify(errorMessage(error, "移除 Worktree 失败"));
    } finally {
      setAction(undefined);
    }
  }

  async function pruneWorktrees() {
    if (!api || controlsDisabled) return;
    setAction("prune");
    try {
      const next = await api.pruneWorktrees({ taskId });
      setContext((current) => current ? { ...current, worktrees: next } : current);
      notify("已清理失效的 Worktree 记录", "success");
    } catch (error) {
      notify(errorMessage(error, "清理 Worktree 失败"));
    } finally {
      setAction(undefined);
    }
  }

  return (
    <div className="workspace-controls" aria-label="Git 工作环境">
      <Popover open={environmentOpen} onOpenChange={(open) => {
        setEnvironmentOpen(open);
        if (!open) setEnvironmentView("choices");
      }}>
        <PopoverTrigger
          className="workspace-capsule environment-capsule"
          disabled={controlsDisabled}
          title={disabled ? "运行结束后可 Handoff 工作环境" : environment?.path}
        >
          {environment?.mode === "WORKTREE"
            ? <GitFork size={13} />
            : <HardDrive size={13} />}
          <span>{environment?.mode === "WORKTREE" ? "Worktree" : "Local"}</span>
          {loading || action?.startsWith("handoff")
            ? <LoaderCircle className="spin" size={11} />
            : <ChevronDown size={11} />}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={7}
          className="workspace-menu workspace-environment-menu"
        >
          {environmentView === "manage" ? (
            <WorktreeManager
              action={action}
              disabled={controlsDisabled}
              worktrees={worktrees}
              onBack={() => setEnvironmentView("choices")}
              onPrune={() => void pruneWorktrees()}
              onRemove={(worktree) => void removeWorktree(worktree)}
            />
          ) : (
            <>
              <div className="workspace-menu-heading">
                <div>
                  <strong>工作环境</strong>
                  <span>切换会创建一次安全 Handoff</span>
                </div>
                <ArrowRightLeft size={14} />
              </div>
              <div className="workspace-menu-list" role="menu">
                <EnvironmentOption
                  active={environment?.mode !== "WORKTREE"}
                  description="直接使用项目工作区"
                  icon={<HardDrive size={15} />}
                  label="Local"
                  onClick={() => void handoff("LOCAL")}
                />
                <EnvironmentOption
                  active={false}
                  description="从当前 HEAD 创建隔离环境"
                  disabled={!gitAvailable}
                  icon={<Plus size={15} />}
                  label="新建 Worktree"
                  onClick={() => void handoff("NEW_WORKTREE")}
                />
                {worktrees
                  .filter((item) => item.mode === "WORKTREE" && !item.current)
                  .map((item) => (
                    <EnvironmentOption
                      active={false}
                      description={compactPath(item.path)}
                      icon={<GitFork size={15} />}
                      key={item.worktreePath ?? item.path}
                      label={item.label || item.branchName || "Worktree"}
                      onClick={() => void handoff(
                        "EXISTING_WORKTREE",
                        item.worktreePath ?? item.path,
                      )}
                    />
                  ))}
                {!loading && !gitAvailable && (
                  <p className="draft-environment-notice">
                    当前项目不是 Git 仓库，无法创建 Worktree。
                  </p>
                )}
              </div>
              {environment?.mode === "WORKTREE"
                && environment.canAutoApply !== false && (
                <button
                  className="workspace-setting-row"
                  type="button"
                  role="switch"
                  aria-checked={Boolean(environment.autoApplyWhenClean)}
                  onClick={() => void toggleAutoApply()}
                >
                  <span>
                    <strong>无冲突时自动应用</strong>
                    <small>默认关闭；仅在结果干净时回到 Local</small>
                  </span>
                  <i className={environment.autoApplyWhenClean ? "is-on" : ""}>
                    <span />
                  </i>
                </button>
              )}
              <button
                className="workspace-menu-footer"
                type="button"
                onClick={() => setEnvironmentView("manage")}
              >
                <GitFork size={14} />
                管理 Worktree
                <ChevronDown size={12} />
              </button>
            </>
          )}
        </PopoverContent>
      </Popover>

      <Popover open={branchOpen} onOpenChange={(open) => {
        setBranchOpen(open);
        if (!open) {
          setBranchView("branches");
          setCreateBranchOpen(false);
        }
      }}>
        <PopoverTrigger
          className="workspace-capsule branch-capsule"
          disabled={controlsDisabled || !context?.repositoryRoot}
          title={disabled ? "运行结束后可切换分支" : branch?.name}
        >
          <GitBranch size={13} />
          <span>{branch?.name || (context?.detached ? "detached" : "Git")}</span>
          {statusDot(context)}
          <ChevronDown size={11} />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={7}
          className="workspace-menu workspace-branch-menu"
        >
          {branchView === "history" ? (
            <GitHistory
              commits={history}
              loading={historyLoading}
              onBack={() => setBranchView("branches")}
            />
          ) : (
            <>
              <div className="workspace-menu-heading branch-heading">
                <div>
                  <strong>{branch?.name || "Detached HEAD"}</strong>
                  <span>{statusLabel(context)}</span>
                </div>
                {context?.headSha && <code>{context.headSha.slice(0, 8)}</code>}
              </div>
              <div className="workspace-menu-list branch-list" role="menu">
                {(context?.branches ?? []).map((item) => (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={item.current}
                    className="workspace-menu-item branch-item"
                    key={item.name}
                    onClick={() => void checkoutBranch(item.name)}
                  >
                    <GitBranch size={14} />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{branchMeta(item)}</small>
                    </span>
                    {action === `checkout:${item.name}`
                      ? <LoaderCircle className="spin" size={13} />
                      : item.current ? <Check size={13} /> : null}
                  </button>
                ))}
              </div>
              {createBranchOpen ? (
                <form
                  className="workspace-create-branch"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createBranch();
                  }}
                >
                  <input
                    aria-label="新分支名称"
                    autoFocus
                    placeholder="feature/short-name"
                    spellCheck={false}
                    value={branchName}
                    onChange={(event) => setBranchName(event.target.value)}
                  />
                  <button type="submit" disabled={!branchName.trim() || busy}>
                    {action === "create-branch"
                      ? <LoaderCircle className="spin" size={13} />
                      : "创建并检出"}
                  </button>
                </form>
              ) : (
                <div className="workspace-branch-actions">
                  <button type="button" onClick={() => setCreateBranchOpen(true)}>
                    <Plus size={14} />
                    新建分支
                  </button>
                  <button type="button" onClick={() => void openHistory()}>
                    <GitCommitHorizontal size={14} />
                    提交图
                  </button>
                </div>
              )}
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function EnvironmentOption({
  active,
  description,
  icon,
  label,
  disabled = false,
  onClick,
}: {
  active: boolean;
  description: string;
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      className="workspace-menu-item"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="workspace-menu-icon">{icon}</span>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      {active && <Check size={13} />}
    </button>
  );
}

function WorktreeManager({
  action,
  disabled,
  worktrees,
  onBack,
  onPrune,
  onRemove,
}: {
  action?: string;
  disabled: boolean;
  worktrees: WorkspaceEnvironmentSummary[];
  onBack(): void;
  onPrune(): void;
  onRemove(worktree: WorkspaceEnvironmentSummary): void;
}) {
  return (
    <>
      <div className="workspace-menu-heading with-back">
        <button type="button" aria-label="返回环境选择" onClick={onBack}>
          <ArrowLeft size={14} />
        </button>
        <div>
          <strong>Worktree 管理</strong>
          <span>{worktrees.length} 个环境</span>
        </div>
      </div>
      <div className="worktree-manager-list">
        {worktrees.length === 0 && (
          <p>当前仓库没有额外 Worktree。</p>
        )}
        {worktrees.map((item) => {
          const path = item.worktreePath ?? item.path;
          return (
            <div className="worktree-manager-item" key={path}>
              <GitFork size={14} />
              <span>
                <strong>{item.label || item.branchName || "Worktree"}</strong>
                <small title={path}>{compactPath(path)}</small>
              </span>
              {item.current ? (
                <em>当前</em>
              ) : item.removable ? (
                <button
                  type="button"
                  aria-label={`移除 ${item.label || path}`}
                  disabled={disabled}
                  onClick={() => onRemove(item)}
                >
                  {action === `remove:${path}`
                    ? <LoaderCircle className="spin" size={13} />
                    : <Trash2 size={13} />}
                </button>
              ) : (
                <em>{item.state || "使用中"}</em>
              )}
            </div>
          );
        })}
      </div>
      <button
        className="workspace-menu-footer"
        type="button"
        disabled={disabled}
        onClick={onPrune}
      >
        {action === "prune"
          ? <LoaderCircle className="spin" size={13} />
          : <RefreshCcw size={13} />}
        清理失效记录
      </button>
    </>
  );
}

function GitHistory({
  commits,
  loading,
  onBack,
}: {
  commits: GitCommitSummary[];
  loading: boolean;
  onBack(): void;
}) {
  return (
    <>
      <div className="workspace-menu-heading with-back">
        <button type="button" aria-label="返回分支列表" onClick={onBack}>
          <ArrowLeft size={14} />
        </button>
        <div>
          <strong>提交图</strong>
          <span>当前工作环境的最近提交</span>
        </div>
      </div>
      <div className="git-history-list">
        {loading && (
          <div className="git-history-state"><LoaderCircle className="spin" size={15} /> 正在读取…</div>
        )}
        {!loading && commits.length === 0 && (
          <div className="git-history-state">还没有可显示的提交</div>
        )}
        {commits.map((commit, index) => (
          <div className="git-history-item" key={commit.sha}>
            <span className="git-history-rail" aria-hidden="true">
              <i />
              {index < commits.length - 1 && <b />}
            </span>
            <span>
              <strong>{commit.summary}</strong>
              <small>
                <code>{commit.shortSha || commit.sha.slice(0, 8)}</code>
                {commit.authorName && <>{commit.authorName}</>}
                {commit.authoredAt && <time>{formatRelativeTime(commit.authoredAt)}</time>}
              </small>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function statusDot(context?: WorkspaceContext) {
  if (!context || context.status.clean) return null;
  return <i className={context.status.conflicted > 0 ? "has-conflict" : "has-change"} />;
}

function statusLabel(context?: WorkspaceContext): string {
  if (!context) return "正在读取 Git 状态";
  if (context.status.conflicted > 0) return `${context.status.conflicted} 个冲突`;
  const changed = context.status.staged + context.status.unstaged + context.status.untracked;
  if (changed === 0) return "工作区干净";
  return `${changed} 个未提交改动`;
}

function branchMeta(branch: WorkspaceContext["branches"][number]): string {
  const parts: string[] = [];
  if (branch.remote) parts.push("远程");
  if (branch.ahead) parts.push(`领先 ${branch.ahead}`);
  if (branch.behind) parts.push(`落后 ${branch.behind}`);
  if (branch.worktreePath) parts.push("已在 Worktree 中检出");
  return parts.join(" · ") || (branch.current ? "当前分支" : "本地分支");
}

function compactPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.length <= 46) return normalized;
  return `…/${normalized.split("/").slice(-3).join("/")}`;
}

function formatRelativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
