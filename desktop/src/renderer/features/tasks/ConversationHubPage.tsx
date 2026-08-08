import {
  Folder,
  FolderPlus,
  MessageSquarePlus,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { TaskSummary } from "../../../shared/task-contract";
import type { ProjectDirectory } from "../../../shared/window-contract";

interface ConversationHubPageProps {
  tasks: TaskSummary[];
  taskProjectPaths: Record<string, string>;
  projectNames: Record<string, string>;
  onNewConversation(project?: ProjectDirectory): void;
  onNewProject(project: ProjectDirectory): void;
  onOpenTask(taskId: string): void;
}

interface ProjectGroup {
  key: string;
  name: string;
  path?: string;
  tasks: TaskSummary[];
}

const DEFAULT_PROJECT_KEY = "__default__";

export function ConversationHubPage({
  tasks,
  taskProjectPaths,
  projectNames,
  onNewConversation,
  onNewProject,
  onOpenTask,
}: ConversationHubPageProps) {
  const [query, setQuery] = useState("");
  const groups = useMemo(
    () => createProjectGroups(tasks, taskProjectPaths, projectNames),
    [projectNames, taskProjectPaths, tasks],
  );
  const [selectedProjectKey, setSelectedProjectKey] = useState(
    () => groups[0]?.key ?? DEFAULT_PROJECT_KEY,
  );
  const selectedGroup =
    groups.find((group) => group.key === selectedProjectKey) ?? groups[0];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleTasks = (selectedGroup?.tasks ?? tasks).filter((task) =>
    task.goal.toLocaleLowerCase().includes(normalizedQuery),
  );

  async function chooseNewProject() {
    const project = await window.lumora?.window?.selectProjectDirectory?.();
    if (project) onNewProject(project);
  }

  function startConversation() {
    if (selectedGroup?.path) {
      onNewConversation({
        name: selectedGroup.name,
        path: selectedGroup.path,
      });
      return;
    }
    onNewConversation();
  }

  return (
    <main className="conversation-hub-layout">
      <div className="conversation-hub-content">
        <label className="conversation-hub-search">
          <Search size={19} strokeWidth={1.65} aria-hidden="true" />
          <input
            type="search"
            aria-label="搜索会话"
            placeholder="在 LUMORA 中搜索会话"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="conversation-hub-grid">
          <section className="conversation-projects" aria-labelledby="conversation-projects-title">
            <header>
              <h1 id="conversation-projects-title">项目</h1>
              <button
                type="button"
                aria-label="新建项目"
                title="新建项目"
                onClick={() => void chooseNewProject()}
              >
                <FolderPlus size={19} strokeWidth={1.55} />
              </button>
            </header>
            <div className="conversation-project-list">
              {groups.map((group) => (
                <button
                  className={group.key === selectedGroup?.key ? "active" : ""}
                  type="button"
                  key={group.key}
                  title={group.path}
                  aria-pressed={group.key === selectedGroup?.key}
                  onClick={() => setSelectedProjectKey(group.key)}
                >
                  <span
                    className={`conversation-project-mark${
                      group.path ? " project" : " default"
                    }`}
                    aria-hidden="true"
                  >
                    {group.path ? group.name.slice(0, 1).toUpperCase() : "D"}
                  </span>
                  <span>{group.name}</span>
                  <small>{group.tasks.length}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="conversation-recents" aria-labelledby="conversation-recents-title">
            <header>
              <div>
                <span className="conversation-project-caption">
                  {selectedGroup?.name ?? "全部项目"}
                </span>
                <h2 id="conversation-recents-title">最近会话</h2>
              </div>
              <button
                className="conversation-hub-new"
                type="button"
                onClick={startConversation}
              >
                <MessageSquarePlus size={18} strokeWidth={1.65} />
                <span>新建会话</span>
              </button>
            </header>
            <div className="conversation-recent-list">
              {visibleTasks.length > 0 ? (
                visibleTasks.map((task) => (
                  <button
                    type="button"
                    key={task.taskId}
                    onClick={() => onOpenTask(task.taskId)}
                  >
                    <span
                      className={`conversation-project-mark${
                        selectedGroup?.path ? " project" : " default"
                      }`}
                      aria-hidden="true"
                    >
                      {selectedGroup?.path
                        ? selectedGroup.name.slice(0, 1).toUpperCase()
                        : "L"}
                    </span>
                    <span className="conversation-recent-copy">
                      <strong>{task.goal}</strong>
                      <small>{formatUpdatedAt(task.updatedAt)}</small>
                    </span>
                  </button>
                ))
              ) : (
                <div className="conversation-hub-empty">
                  <Folder size={24} strokeWidth={1.35} />
                  <strong>{normalizedQuery ? "没有匹配的会话" : "这个项目还没有会话"}</strong>
                  <span>{normalizedQuery ? "换个关键词试试" : "新建会话后，它会出现在这里"}</span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function createProjectGroups(
  tasks: TaskSummary[],
  taskProjectPaths: Record<string, string>,
  projectNames: Record<string, string>,
): ProjectGroup[] {
  const projects = new Map<string, ProjectGroup>();
  for (const [path, name] of Object.entries(projectNames)) {
    projects.set(path, { key: path, path, name, tasks: [] });
  }
  const defaultGroup: ProjectGroup = {
    key: DEFAULT_PROJECT_KEY,
    name: "Default Project",
    tasks: [],
  };
  for (const task of tasks) {
    const path = taskProjectPaths[task.taskId];
    if (!path) {
      defaultGroup.tasks.push(task);
      continue;
    }
    const group = projects.get(path) ?? {
      key: path,
      path,
      name: projectNames[path] ?? projectNameFromPath(path),
      tasks: [],
    };
    group.tasks.push(task);
    projects.set(path, group);
  }
  return [...projects.values(), defaultGroup];
}

function projectNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function formatUpdatedAt(value?: string): string {
  if (!value) return "最近打开";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近打开";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
