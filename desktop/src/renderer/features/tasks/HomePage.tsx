import { useEffect, useRef, useState } from "react";
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
  X,
} from "lucide-react";
import { useStore } from "zustand";

import type { ProjectDirectory } from "../../../shared/window-contract";
import { resizeTextarea } from "../../utils/auto-resize-textarea";
import { submitFormOnEnter } from "../../utils/submit-on-enter";
import {
  loadActiveProject,
  saveActiveProject,
} from "./project-context-storage";
import type { TaskStore } from "./task-store";

interface HomePageProps {
  store: TaskStore;
  composerMotion?: "from-bottom";
  notify(message: string, tone?: "info" | "success"): void;
}

const contextActions = [
  { icon: File, label: "文件" },
  { icon: Folder, label: "文件夹" },
  { icon: Globe2, label: "网页" },
  { icon: Laptop, label: "应用" },
];

export function HomePage({ store, composerMotion, notify }: HomePageProps) {
  const [goal, setGoal] = useState("");
  const [contexts, setContexts] = useState<string[]>([]);
  const [project, setProject] = useState<ProjectDirectory | undefined>(
    loadActiveProject,
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const goalInput = useRef<HTMLTextAreaElement>(null);
  const isCreating = useStore(store, (state) => state.isCreating);
  const error = useStore(store, (state) => state.error);

  useEffect(() => resizeTextarea(goalInput.current, 220), [goal]);

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
    <main
      className={`home-layout${composerMotion ? ` composer-enter-${composerMotion}` : ""}`}
    >
      <section className="home-content">
        <header className="home-hero">
          <PixelRunnerArtwork />
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
              ref={goalInput}
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
                <ArrowUp size={17} strokeWidth={2.1} />
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

function PixelRunnerArtwork() {
  const [isJumping, setIsJumping] = useState(false);
  const [sceneVisible, setSceneVisible] = useState(true);
  const panelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isJumping) {
      return;
    }
    const timer = window.setTimeout(() => setIsJumping(false), 860);
    return () => window.clearTimeout(timer);
  }, [isJumping]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setSceneVisible(entry?.isIntersecting ?? true),
      { rootMargin: "48px" },
    );
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  return (
    <button
      ref={panelRef}
      type="button"
      className={`home-pixel-panel${isJumping ? " is-jumping" : ""}${
        sceneVisible ? "" : " is-scene-paused"
      }`}
      aria-label="像素风景，点击让 LUMORA 软体跳跃"
      onClick={() => setIsJumping(true)}
    >
      <div className="home-pixel-panel-heading">
        <span>LUMORA.FORM_01</span>
        <span className="home-pixel-run-status">
          {isJumping ? "AIRBORNE" : "CLICK / HOP"}
        </span>
      </div>
      <svg
        className="home-pixel-artwork"
        viewBox="0 0 720 220"
        preserveAspectRatio="xMidYMid slice"
        shapeRendering="crispEdges"
      >
        <defs>
          <pattern id="home-pixel-dots" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="1" height="1" fill="currentColor" />
          </pattern>
        </defs>
        <g className="home-pixel-bands">
          {Array.from({ length: 6 }, (_, index) => (
            <rect
              key={index}
              x="0"
              y={index * 24 + 20}
              width="720"
              height="9"
              fill="url(#home-pixel-dots)"
            />
          ))}
        </g>

        <g className="home-pixel-world">
          <g className="home-pixel-clouds" opacity="0.28">
            <rect x="84" y="50" width="54" height="6" fill="currentColor" />
            <rect x="96" y="44" width="24" height="6" fill="currentColor" />
            <rect x="438" y="76" width="68" height="6" fill="currentColor" />
            <rect x="456" y="70" width="30" height="6" fill="currentColor" />
            <rect x="812" y="60" width="82" height="6" fill="currentColor" />
            <rect x="832" y="54" width="38" height="6" fill="currentColor" />
            <rect x="1210" y="42" width="48" height="6" fill="currentColor" />
            <rect x="1220" y="36" width="28" height="6" fill="currentColor" />
            <rect x="1524" y="50" width="54" height="6" fill="currentColor" />
            <rect x="1536" y="44" width="24" height="6" fill="currentColor" />
          </g>
          <g className="home-pixel-scenery">
            <PixelScenerySegment offset={0} variant="wild" />
            <PixelScenerySegment offset={720} variant="ruins" />
            <PixelScenerySegment offset={1440} variant="wild" />
          </g>
          <g className="home-pixel-track">
            <PixelTrackSegment offset={0} variant="wild" />
            <PixelTrackSegment offset={720} variant="ruins" />
            <PixelTrackSegment offset={1440} variant="wild" />
          </g>
        </g>

        <g transform="translate(96 92) scale(2)">
          <g className="home-pixel-blob">
            <path
              d="M5 8H10V3H28V7H34V25H2V13H5Z"
              fill="currentColor"
            />
            <rect x="12" y="13" width="5" height="5" fill="var(--surface)" />
            <rect x="23" y="13" width="5" height="5" fill="var(--surface)" />
            <g className="home-pixel-blob-trail" fill="var(--muted)">
              <rect className="trail-one" x="-5" y="17" width="3" height="3" />
              <rect className="trail-two" x="-11" y="21" width="4" height="3" />
            </g>
          </g>
        </g>

      </svg>
    </button>
  );
}

function PixelScenerySegment({
  offset,
  variant,
}: {
  offset: number;
  variant: "wild" | "ruins";
}) {
  return (
    <g transform={`translate(${offset} 0)`}>
      {variant === "wild" ? (
        <>
          <path
            d="M0 150V132h34v-8h28v-12h32v10h26v-20h36v16h28v-10h44v20h38v22Z"
            fill="currentColor"
            opacity="0.07"
          />
          <g fill="currentColor" opacity="0.34">
            <rect x="210" y="114" width="5" height="36" />
            <rect x="200" y="122" width="25" height="5" />
            <rect x="204" y="116" width="17" height="5" />
            <rect x="616" y="106" width="6" height="44" />
            <rect x="603" y="119" width="32" height="6" />
            <rect x="608" y="112" width="22" height="6" />
          </g>
        </>
      ) : (
        <>
          <g fill="currentColor" opacity="0.08">
            <rect x="26" y="112" width="56" height="38" />
            <rect x="36" y="98" width="36" height="14" />
            <rect x="164" y="122" width="70" height="28" />
            <rect x="176" y="108" width="46" height="14" />
            <rect x="420" y="92" width="84" height="58" />
            <rect x="432" y="78" width="60" height="14" />
            <rect x="580" y="116" width="92" height="34" />
          </g>
          <g fill="var(--surface)" opacity="0.72">
            <rect x="45" y="122" width="8" height="8" />
            <rect x="57" y="122" width="8" height="8" />
            <rect x="444" y="105" width="9" height="9" />
            <rect x="465" y="105" width="9" height="9" />
            <rect x="486" y="105" width="9" height="9" />
          </g>
        </>
      )}
    </g>
  );
}

function PixelTrackSegment({
  offset,
  variant,
}: {
  offset: number;
  variant: "wild" | "ruins";
}) {
  return (
    <g transform={`translate(${offset} 0)`}>
      <rect x="0" y="150" width="720" height="4" fill="currentColor" />
      <rect x="0" y="160" width="720" height="2" fill="currentColor" opacity="0.28" />
      <rect x="24" y="168" width="40" height="4" fill="currentColor" opacity="0.45" />
      <rect x="174" y="168" width="18" height="4" fill="currentColor" opacity="0.45" />
      <rect x="308" y="168" width="52" height="4" fill="currentColor" opacity="0.45" />
      <rect x="554" y="168" width="28" height="4" fill="currentColor" opacity="0.45" />
      <rect x="660" y="168" width="46" height="4" fill="currentColor" opacity="0.45" />

      {variant === "wild" ? (
        <>
          <g transform="translate(286 0)">
            <rect x="0" y="126" width="28" height="24" fill="currentColor" />
            <rect x="5" y="121" width="18" height="5" fill="currentColor" />
            <rect x="7" y="132" width="4" height="4" fill="var(--surface)" />
            <rect x="17" y="132" width="4" height="4" fill="var(--surface)" />
          </g>
          <g transform="translate(510 0)">
            <rect x="0" y="138" width="12" height="12" fill="currentColor" />
            <rect x="12" y="126" width="12" height="24" fill="currentColor" />
            <rect x="24" y="114" width="12" height="36" fill="currentColor" />
            <rect x="36" y="132" width="12" height="18" fill="currentColor" />
          </g>
        </>
      ) : (
        <>
          <g transform="translate(238 0)" fill="currentColor">
            <rect x="0" y="132" width="18" height="18" />
            <rect x="18" y="120" width="18" height="30" />
            <rect x="36" y="108" width="18" height="42" />
            <rect x="54" y="126" width="18" height="24" />
          </g>
          <g transform="translate(470 0)" fill="currentColor">
            <rect x="0" y="130" width="44" height="20" />
            <rect x="7" y="123" width="30" height="7" />
            <rect x="13" y="137" width="6" height="6" fill="var(--surface)" />
            <rect x="25" y="137" width="6" height="6" fill="var(--surface)" />
          </g>
          <rect x="630" y="140" width="52" height="10" fill="currentColor" />
        </>
      )}
    </g>
  );
}
