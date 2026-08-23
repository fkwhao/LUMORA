import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  GitFork,
  HardDrive,
  LoaderCircle,
  Plus,
} from "lucide-react";

import type {
  LumoraWorkspaceApi,
  WorkspaceContext,
  WorkspaceEnvironmentSelection,
} from "../../../../shared/workspace-contract";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";

export function DraftEnvironmentPicker({
  api,
  workspacePath,
  value,
  onChange,
}: {
  api?: LumoraWorkspaceApi;
  workspacePath?: string;
  value: WorkspaceEnvironmentSelection;
  onChange(value: WorkspaceEnvironmentSelection): void;
}) {
  const [context, setContext] = useState<WorkspaceContext>();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!api || !workspacePath) {
      setContext(undefined);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void api.inspect({ workspacePath })
      .then((next) => {
        if (!cancelled) setContext(next);
      })
      .catch(() => {
        if (!cancelled) setContext(undefined);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [api, workspacePath]);

  const worktreeSelected = value.target !== "LOCAL";
  const gitAvailable = Boolean(context?.repositoryRoot);
  const label = value.target === "LOCAL"
    ? "Local"
    : value.target === "NEW_WORKTREE"
      ? "新 Worktree"
      : context?.worktrees.find((item) =>
        (item.worktreePath ?? item.path) === value.worktreePath)?.label
        || "Worktree";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="project-mode project-environment-trigger"
        disabled={!workspacePath}
        title={workspacePath ? "选择新任务的工作环境" : "请先选择项目"}
      >
        {worktreeSelected ? <GitFork size={14} /> : <HardDrive size={14} />}
        <span>{label}</span>
        {loading
          ? <LoaderCircle className="spin" size={11} />
          : <ChevronDown size={11} />}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={7}
        className="workspace-menu draft-environment-menu"
      >
        <div className="workspace-menu-heading">
          <div>
            <strong>新任务环境</strong>
            <span>默认使用 Local；需要隔离时再选择 Worktree</span>
          </div>
        </div>
        <div className="workspace-menu-list" role="menu">
          <DraftOption
            active={value.target === "LOCAL"}
            description="直接在当前项目中工作"
            icon={<HardDrive size={15} />}
            label="Local"
            onClick={() => {
              onChange({ target: "LOCAL" });
              setOpen(false);
            }}
          />
          <DraftOption
            active={value.target === "NEW_WORKTREE"}
            description="从当前 HEAD 新建隔离环境"
            icon={<Plus size={15} />}
            label="新建 Worktree"
            disabled={!gitAvailable}
            onClick={() => {
              onChange({
                target: "NEW_WORKTREE",
                autoApplyWhenClean: value.autoApplyWhenClean ?? false,
              });
              setOpen(false);
            }}
          />
          {!loading && !gitAvailable && (
            <p className="draft-environment-notice">
              当前项目不是 Git 仓库，任务将使用 Local。
            </p>
          )}
          {(context?.worktrees ?? [])
            .filter((worktree) => worktree.mode === "WORKTREE" && !worktree.current)
            .map((worktree) => {
            const path = worktree.worktreePath ?? worktree.path;
            return (
              <DraftOption
                active={value.target === "EXISTING_WORKTREE"
                  && value.worktreePath === path}
                description={compactPath(path)}
                icon={<GitFork size={15} />}
                key={path}
                label={worktree.label || worktree.branchName || "Worktree"}
                onClick={() => {
                  onChange({
                    target: "EXISTING_WORKTREE",
                    worktreePath: path,
                  });
                  setOpen(false);
                }}
              />
            );
          })}
        </div>
        {value.target === "NEW_WORKTREE" && (
          <button
            className="workspace-setting-row"
            type="button"
            role="switch"
            aria-checked={Boolean(value.autoApplyWhenClean)}
            onClick={() => onChange({
              ...value,
              autoApplyWhenClean: !value.autoApplyWhenClean,
            })}
          >
            <span>
              <strong>无冲突时自动应用</strong>
              <small>默认关闭，可在任务中随时调整</small>
            </span>
            <i className={value.autoApplyWhenClean ? "is-on" : ""}><span /></i>
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DraftOption({
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
      <span><strong>{label}</strong><small>{description}</small></span>
      {active && <Check size={13} />}
    </button>
  );
}

function compactPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  return normalized.length <= 46
    ? normalized
    : `…/${normalized.split("/").slice(-3).join("/")}`;
}
