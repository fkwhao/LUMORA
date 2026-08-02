import {
  Archive,
  Blocks,
  Clock3,
  Folder,
  FolderKanban,
  ListTodo,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { useState } from "react";

import type { TaskSummary } from "../../shared/task-contract";
import lumoraLogoDark from "../assets/lumora-logo-dark.png";
import lumoraLogo from "../assets/lumora-logo.png";
import type { PrototypeView } from "../features/prototype/PrototypePage";

interface AppSidebarProps {
  activeView: "home" | "task" | "settings" | PrototypeView;
  activeTaskId?: string;
  recentTasks: TaskSummary[];
  taskProjectPaths: Record<string, string>;
  archivedTaskIds: string[];
  isLoadingHistory: boolean;
  onNewTask(): void;
  onNavigate(view: PrototypeView): void;
  onOpenTask(taskId: string): void;
  onArchiveTask(taskId: string): void;
  onSettings(): void;
  notify(message: string, tone?: "info" | "success"): void;
}

export function AppSidebar({
  activeView,
  activeTaskId,
  recentTasks,
  taskProjectPaths,
  archivedTaskIds,
  isLoadingHistory,
  onNewTask,
  onNavigate,
  onOpenTask,
  onArchiveTask,
  onSettings,
  notify,
}: AppSidebarProps) {
  const [searchVisible, setSearchVisible] = useState(false);
  const [query, setQuery] = useState("");
  const archivedTaskIdSet = new Set(archivedTaskIds);
  const activeTasks = recentTasks.filter(
    (task) => !archivedTaskIdSet.has(task.taskId),
  );
  const filteredTasks = activeTasks.filter((task) =>
    task.goal.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const taskGroups = groupTasksByProject(filteredTasks, taskProjectPaths);
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
        <div>
          <strong>LUMORA</strong>
          <small>本地通用 AI 助手</small>
        </div>
      </div>

      <button
        className={`new-task-button${activeView === "home" ? " active" : ""}`}
        type="button"
        onClick={onNewTask}
      >
        <Plus size={17} strokeWidth={2.2} />
        <span>新建任务</span>
      </button>

      <nav className="primary-nav" aria-label="主要功能">
        <NavItem
          icon={ListTodo}
          label="任务"
          active={activeView === "task" || activeView === "home"}
          onClick={onNewTask}
        />
        <NavItem
          icon={FolderKanban}
          label="工作空间"
          active={activeView === "workspaces"}
          onClick={() => onNavigate("workspaces")}
        />
        <NavItem
          icon={Clock3}
          label="自动任务"
          active={activeView === "automations"}
          onClick={() => onNavigate("automations")}
        />
        <NavItem
          icon={Blocks}
          label="技能与集成"
          active={activeView === "skills"}
          onClick={() => onNavigate("skills")}
        />
      </nav>

      <section className="task-history" aria-label="任务历史">
        <div className="sidebar-section-heading">
          <span>任务</span>
          <button
            type="button"
            aria-label="搜索任务"
            onClick={() => setSearchVisible((visible) => !visible)}
          >
            <Search size={15} />
          </button>
        </div>

        {searchVisible && (
          <input
            className="history-search"
            aria-label="搜索历史任务"
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
        {taskGroups.map((group) => (
          <section className="project-task-group" key={group.path || "general"}>
            <div className="history-label" title={group.path}>
              <Folder size={12} />
              <span>{group.name}</span>
            </div>
            {group.tasks.map((task) => (
              <div
                className={`history-row${
                  task.taskId === activeTaskId ? " current" : ""
                }`}
                key={task.taskId}
              >
                <button
                  className="history-item"
                  type="button"
                  title={task.goal}
                  onClick={() => onOpenTask(task.taskId)}
                >
                  <span>{task.goal}</span>
                </button>
                <button
                  className="history-archive-action"
                  type="button"
                  aria-label={`归档任务：${task.goal}`}
                  title="归档"
                  onClick={() => {
                    onArchiveTask(task.taskId);
                    notify("任务已归档，可在设置中管理", "success");
                  }}
                >
                  <Archive size={13} />
                </button>
              </div>
            ))}
          </section>
        ))}
      </section>

      <div className="sidebar-spacer" />

      <section className="workspace-shortcut">
        <div className="sidebar-section-heading">
          <span>工作空间</span>
          <button
            type="button"
            aria-label="打开工作空间管理"
            onClick={() => {
              onNavigate("workspaces");
              notify("已打开工作空间创建页");
            }}
          >
            <Plus size={15} />
          </button>
        </div>
        <button
          className="workspace-link"
          type="button"
          onClick={() => onNavigate("workspaces")}
        >
          <Folder size={16} />
          <span>LUMORA</span>
        </button>
      </section>

      <button
        className={`settings-link${activeView === "settings" ? " active" : ""}`}
        type="button"
        onClick={onSettings}
      >
        <Settings size={17} />
        <span>设置</span>
      </button>
    </aside>
  );
}

function groupTasksByProject(
  tasks: TaskSummary[],
  taskProjectPaths: Record<string, string>,
) {
  const groups = new Map<
    string,
    { name: string; path: string; tasks: TaskSummary[] }
  >();
  for (const task of tasks) {
    const path = taskProjectPaths[task.taskId] ?? "";
    const key = path || "__general__";
    const existing = groups.get(key);
    if (existing) {
      existing.tasks.push(task);
      continue;
    }
    groups.set(key, {
      name: path ? projectName(path) : "无项目",
      path,
      tasks: [task],
    });
  }
  return [...groups.values()];
}

function projectName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

interface NavItemProps {
  icon: typeof ListTodo;
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

