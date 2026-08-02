import { useRef, useState } from "react";
import {
  ArrowUp,
  File,
  Folder,
  FolderOpen,
  Globe2,
  GitBranch,
  Laptop,
  MoreHorizontal,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import { useStore } from "zustand";

import type { ProjectDirectory } from "../../../shared/window-contract";
import { submitFormOnEnter } from "../../utils/submit-on-enter";
import {
  loadActiveProject,
  saveActiveProject,
} from "./project-context-storage";
import type { TaskStore } from "./task-store";

interface HomePageProps {
  store: TaskStore;
  notify(message: string, tone?: "info" | "success"): void;
}

const contextActions = [
  { icon: File, label: "文件" },
  { icon: Folder, label: "文件夹" },
  { icon: Globe2, label: "网页" },
  { icon: Laptop, label: "应用" },
];

export function HomePage({ store, notify }: HomePageProps) {
  const [goal, setGoal] = useState("");
  const [contexts, setContexts] = useState<string[]>([]);
  const [project, setProject] = useState<ProjectDirectory | undefined>(
    loadActiveProject,
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const isCreating = useStore(store, (state) => state.isCreating);
  const error = useStore(store, (state) => state.error);

  async function submitGoal(event: React.FormEvent) {
    event.preventDefault();
    try {
      await store.getState().createTask(goal, project?.path);
    } catch {
      // Store 已经提供面向用户的错误信息，表单无需重复处理异常。
    }
  }

  async function chooseProject() {
    const selected =
      await window.lumora?.window?.selectProjectDirectory?.();
    if (!selected) {
      return;
    }
    setProject(selected);
    saveActiveProject(selected);
    notify(`已选择项目：${selected.name}`, "success");
  }

  function clearProject() {
    setProject(undefined);
    saveActiveProject(undefined);
    notify("已切换为无项目对话");
  }

  function chooseLocalContext(folder: boolean) {
    const input = fileInput.current;
    if (!input) {
      return;
    }
    folder
      ? input.setAttribute("webkitdirectory", "")
      : input.removeAttribute("webkitdirectory");
    input.click();
  }

  function addContext(label: string) {
    setContexts((items) =>
      items.includes(label) ? items : [...items, label],
    );
    notify(`已添加${label}上下文`, "success");
  }

  return (
    <main className="home-layout">
      <section className="home-content">
        <header className="home-hero">
          <span className="home-hero-mark" aria-hidden="true">
            <Sparkles size={25} />
          </span>
          <h1>
            今天想在 <strong>LUMORA</strong> 中完成什么？
          </h1>
          <p>选择一个项目开始工作，或直接发起普通对话。</p>
        </header>

        <div className="home-composer-stack">
          <div className="project-context-bar">
            <button
              type="button"
              className="project-picker"
              title={project?.path ?? "选择项目所在文件夹"}
              onClick={() => void chooseProject()}
            >
              <FolderOpen size={15} />
              <span>{project?.name ?? "选择项目文件夹"}</span>
            </button>
            <span className="project-mode">
              <Laptop size={14} />
              本地
            </span>
            <span className="project-branch">
              <GitBranch size={14} />
              {project?.gitBranch ?? "未关联 Git"}
            </span>
            {project && (
              <button
                type="button"
                className="clear-project"
                aria-label="取消项目选择"
                title="不关联项目"
                onClick={clearProject}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <form className="goal-composer" onSubmit={submitGoal}>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              multiple
              onChange={(event) => {
                const names = [...(event.target.files ?? [])]
                  .slice(0, 4)
                  .map((file) => file.name);
                if (names.length > 0) {
                  setContexts((items) => [...new Set([...items, ...names])]);
                  notify(`已选择 ${names.length} 个本地资源`, "success");
                }
                event.target.value = "";
              }}
            />
            <textarea
              id="task-goal"
              aria-label="告诉 LUMORA 你的目标"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              onKeyDown={submitFormOnEnter}
              placeholder="描述要完成的任务…"
              rows={4}
            />
            <div className="composer-footer">
              <div className="context-actions">
                <button
                  type="button"
                  aria-label="添加上下文"
                  onClick={() => chooseLocalContext(false)}
                >
                  <Paperclip size={17} />
                </button>
                {contextActions.map(({ icon: Icon, label }) => (
                  <button
                    type="button"
                    key={label}
                    onClick={() => {
                      if (label === "文件") {
                        chooseLocalContext(false);
                      } else if (label === "文件夹") {
                        chooseLocalContext(true);
                      } else {
                        addContext(
                          label === "网页"
                            ? "网页链接（待配置）"
                            : "当前应用（待授权）",
                        );
                      }
                    }}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="更多上下文"
                  onClick={() => notify("更多上下文类型将在技能接入后显示")}
                >
                  <MoreHorizontal size={17} />
                </button>
              </div>
              <button
                className="submit-task"
                type="submit"
                aria-label="开始任务"
                disabled={!goal.trim() || isCreating}
              >
                <ArrowUp size={19} strokeWidth={2.2} />
              </button>
            </div>
            {contexts.length > 0 && (
              <div className="selected-contexts">
                {contexts.map((context) => (
                  <span key={context}>
                    {context}
                    <button
                      type="button"
                      aria-label={`移除${context}`}
                      onClick={() =>
                        setContexts((items) =>
                          items.filter((item) => item !== context),
                        )
                      }
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </form>
        </div>
        {error && <p className="form-error">{error}</p>}

        <p className="home-privacy-note">
          项目路径和会话记录仅保存在本机；敏感操作仍会请求确认。
        </p>
      </section>
    </main>
  );
}
