import {
  Archive,
  Blocks,
  ChevronDown,
  ChevronRight,
  Clock3,
  Folder,
  FolderOpen,
  Plus,
  Search,
  Settings,
  SquarePen,
  X,
} from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

import type { TaskSummary } from "../../shared/task-contract";
import type { ProjectDirectory } from "../../shared/window-contract";
import lumoraLogoDark from "../assets/lumora-logo-dark.png";
import lumoraLogo from "../assets/lumora-logo.png";
import type { PrototypeView } from "../features/prototype/PrototypePage";

interface AppSidebarProps {
  activeView: "home" | "task" | "settings" | PrototypeView;
  activeTaskId?: string;
  processingTaskId?: string;
  recentTasks: TaskSummary[];
  taskProjectPaths: Record<string, string>;
  projectNames: Record<string, string>;
  archivedTaskIds: string[];
  isLoadingHistory: boolean;
  onNewTask(): void;
  onNewProject(project: ProjectDirectory): void;
  onNavigate(view: PrototypeView): void;
  onOpenTask(taskId: string): void;
  onArchiveTask(taskId: string): void;
  onSettings(): void;
  notify(message: string, tone?: "info" | "success"): void;
}

export function AppSidebar({
  activeView,
  activeTaskId,
  processingTaskId,
  recentTasks,
  taskProjectPaths,
  projectNames,
  archivedTaskIds,
  isLoadingHistory,
  onNewTask,
  onNewProject,
  onNavigate,
  onOpenTask,
  onArchiveTask,
  onSettings,
  notify,
}: AppSidebarProps) {
  const [searchVisible, setSearchVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [recentExpanded, setRecentExpanded] = useState(true);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const archivedTaskIdSet = new Set(archivedTaskIds);
  const activeTasks = recentTasks.filter(
    (task) => !archivedTaskIdSet.has(task.taskId),
  );
  const filteredTasks = activeTasks.filter((task) =>
    task.goal.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const { projectGroups, recentTasks: unscopedTasks } = organizeTasks(
    filteredTasks,
    taskProjectPaths,
    projectNames,
  );
  return (
    <aside className="sidebar" aria-label="主导航">
      <div className="brand">
        <span className="brand-logo" role="img" aria-label="LUMORA">
          <img
            className="brand-mark brand-mark-light"
            src={lumoraLogo}
            alt=""
          />
          <img
            className="brand-mark brand-mark-dark"
            src={lumoraLogoDark}
            alt=""
          />
        </span>
        <strong className="brand-wordmark">LUMORA</strong>
        <button
          className="brand-search"
          type="button"
          aria-label="搜索会话"
          title="搜索"
          onClick={() => setSearchVisible((visible) => !visible)}
        >
          <Search size={17} strokeWidth={1.8} />
        </button>
      </div>

      <div className="sidebar-scroll">
        <div className="new-task-sticky">
          <button
            className={`new-task-button${activeView === "home" ? " active" : ""}`}
            type="button"
            onClick={onNewTask}
          >
            <SquarePen size={17} strokeWidth={1.9} />
            <span>新对话</span>
          </button>
        </div>

        <nav className="primary-nav" aria-label="主要功能">
          <NavItem
            icon={Clock3}
            label="已安排"
            active={activeView === "automations"}
            onClick={() => onNavigate("automations")}
          />
          <NavItem
            icon={Blocks}
            label="插件"
            active={activeView === "skills"}
            onClick={() => onNavigate("skills")}
          />
        </nav>

        <section className="task-history" aria-label="项目会话">
          {searchVisible && (
            <input
              className="history-search"
              aria-label="搜索历史会话"
              autoFocus
              value={query}
              placeholder="搜索本地会话"
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
          {isLoadingHistory && activeTasks.length === 0 && (
            <div className="history-empty">正在读取本地会话…</div>
          )}
          {!isLoadingHistory && activeTasks.length === 0 && (
            <div className="history-empty">还没有历史会话</div>
          )}
          {activeTasks.length > 0 && filteredTasks.length === 0 && (
            <div className="history-empty">没有匹配的本地会话</div>
          )}
          <div className="sidebar-section-heading collapsible-heading">
            <button
              className="section-toggle"
              type="button"
              aria-expanded={projectsExpanded}
              onClick={() => setProjectsExpanded((expanded) => !expanded)}
            >
              <span>项目</span>
              {projectsExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>
            <div className="section-hover-actions">
              <button
                type="button"
                aria-label="新建项目"
                title="新建项目"
                onClick={() => setProjectDialogOpen(true)}
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          {projectsExpanded &&
            projectGroups.map((group) => (
              <section className="project-task-group" key={group.path}>
                <div className="history-label" title={group.path}>
                  <Folder size={16} strokeWidth={1.7} />
                  <span>{group.name}</span>
                </div>
                {group.tasks.map((task) => (
                  <HistoryRow
                    key={task.taskId}
                    task={task}
                    activeTaskId={activeTaskId}
                    processingTaskId={processingTaskId}
                    onOpenTask={onOpenTask}
                    onArchiveTask={onArchiveTask}
                    notify={notify}
                  />
                ))}
              </section>
            ))}

          <section className="recent-task-group">
            <div className="sidebar-section-heading collapsible-heading">
              <button
                className="section-toggle"
                type="button"
                aria-expanded={recentExpanded}
                onClick={() => setRecentExpanded((expanded) => !expanded)}
              >
                <span>最近</span>
                {recentExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>
              <div className="section-hover-actions">
                <button
                  type="button"
                  aria-label="新建无项目对话"
                  title="新对话"
                  onClick={onNewTask}
                >
                  <SquarePen size={14} />
                </button>
              </div>
            </div>
            {recentExpanded &&
              unscopedTasks.map((task) => (
                <HistoryRow
                  key={task.taskId}
                  task={task}
                  activeTaskId={activeTaskId}
                  processingTaskId={processingTaskId}
                  onOpenTask={onOpenTask}
                  onArchiveTask={onArchiveTask}
                  notify={notify}
                />
              ))}
          </section>
        </section>
      </div>

      <button
        className={`settings-link${activeView === "settings" ? " active" : ""}`}
        type="button"
        onClick={onSettings}
      >
        <Settings size={17} />
        <span>设置</span>
      </button>
      {projectDialogOpen &&
        createPortal(
          <CreateProjectDialog
            onCancel={() => setProjectDialogOpen(false)}
            onCreate={(project) => {
              onNewProject(project);
              setProjectDialogOpen(false);
            }}
          />,
          document.body,
        )}
    </aside>
  );
}

interface CreateProjectDialogProps {
  onCancel(): void;
  onCreate(project: ProjectDirectory): void;
}

function CreateProjectDialog({
  onCancel,
  onCreate,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [source, setSource] = useState<ProjectDirectory>();

  async function chooseSource() {
    const selected =
      await window.lumora?.window?.selectProjectDirectory?.();
    if (!selected) {
      return;
    }
    setSource(selected);
    setName((current) => current || selected.name);
  }

  return (
    <div className="project-dialog-backdrop" role="presentation">
      <form
        className="project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (!source || !name.trim()) {
            return;
          }
          onCreate({ ...source, name: name.trim() });
        }}
      >
        <header>
          <h2 id="create-project-title">创建项目</h2>
          <button
            type="button"
            aria-label="关闭创建项目"
            onClick={onCancel}
          >
            <X size={17} />
          </button>
        </header>
        <label className="project-name-field">
          <Folder size={17} />
          <input
            autoFocus
            aria-label="项目名称"
            value={name}
            placeholder="项目名称"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <strong className="project-source-label">源文件夹</strong>
        <button
          className="project-source-picker"
          type="button"
          onClick={() => void chooseSource()}
        >
          <FolderOpen size={21} />
          <span>{source ? source.path : "添加 LUMORA 可读取和编辑的文件夹"}</span>
        </button>
        <footer>
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button
            className="create-project-confirm"
            type="submit"
            disabled={!source || !name.trim()}
          >
            创建项目
          </button>
        </footer>
      </form>
    </div>
  );
}

interface HistoryRowProps {
  task: TaskSummary;
  activeTaskId?: string;
  processingTaskId?: string;
  onOpenTask(taskId: string): void;
  onArchiveTask(taskId: string): void;
  notify(message: string, tone?: "info" | "success"): void;
}

function HistoryRow({
  task,
  activeTaskId,
  processingTaskId,
  onOpenTask,
  onArchiveTask,
  notify,
}: HistoryRowProps) {
  return (
    <div
      className={`history-row${
        task.taskId === activeTaskId ? " current" : ""
      }`}
    >
      <button
        className="history-item"
        type="button"
        title={task.goal}
        onClick={() => onOpenTask(task.taskId)}
      >
        <span className="history-title-viewport">
          <span className="history-title-text">{task.goal}</span>
        </span>
      </button>
      {task.taskId === processingTaskId && (
        <span
          className="history-processing-indicator"
          role="status"
          aria-label="正在处理"
        />
      )}
      <button
        className="history-archive-action"
        type="button"
        aria-label={`归档会话：${task.goal}`}
        title="归档"
        onClick={() => {
          onArchiveTask(task.taskId);
          notify("会话已归档，可在设置中管理", "success");
        }}
      >
        <Archive size={13} />
      </button>
    </div>
  );
}

function organizeTasks(
  tasks: TaskSummary[],
  taskProjectPaths: Record<string, string>,
  projectNames: Record<string, string>,
) {
  const groups = new Map<
    string,
    { name: string; path: string; tasks: TaskSummary[] }
  >();
  const unscopedTasks: TaskSummary[] = [];
  for (const task of tasks) {
    const path = taskProjectPaths[task.taskId] ?? "";
    if (!path) {
      unscopedTasks.push(task);
      continue;
    }
    const existing = groups.get(path);
    if (existing) {
      existing.tasks.push(task);
      continue;
    }
    groups.set(path, {
      name: projectNames[path] || projectName(path),
      path,
      tasks: [task],
    });
  }
  return { projectGroups: [...groups.values()], recentTasks: unscopedTasks };
}

function projectName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

interface NavItemProps {
  icon: typeof Clock3;
  label: string;
  active?: boolean;
  onClick(): void;
}

function NavItem({
  icon: Icon,
  label,
  active = false,
  onClick,
}: NavItemProps) {
  return (
    <button
      className={`nav-item${active ? " active" : ""}`}
      type="button"
      onClick={onClick}
    >
      <Icon size={17} strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  );
}

