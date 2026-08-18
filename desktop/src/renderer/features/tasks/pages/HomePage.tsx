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
  Image as ImageIcon,
  X,
} from "lucide-react";
import { useStore } from "zustand";

import type { ProjectDirectory } from "../../../../shared/window-contract";
import type { MessageAttachment } from "../../../../shared/attachment-contract";
import { resizeTextarea } from "../../../utils/auto-resize-textarea";
import { submitFormOnEnter } from "../../../utils/submit-on-enter";
import {
  loadActiveProject,
  saveActiveProject,
} from "../state/project-context-storage";
import type { TaskStore } from "../state/task-store";
import { HalftoneMountainArtwork } from "../components/HalftoneMountainArtwork";
import { PixelDriftHeading } from "../components/PixelDriftHeading";

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

function HomeAttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: MessageAttachment;
  onRemove(): void;
}) {
  const [preview, setPreview] = useState<string>();

  useEffect(() => {
    let active = true;
    if (attachment.kind !== "IMAGE") {
      setPreview(undefined);
      return;
    }
    void window.lumora.attachments.readImagePreview(attachment)
      .then((src) => {
        if (active) setPreview(src);
      })
      .catch(() => {
        if (active) setPreview(undefined);
      });
    return () => {
      active = false;
    };
  }, [attachment]);

  return (
    <span className="home-attachment-chip">
      <i aria-hidden="true" className={preview ? "has-preview" : undefined}>
        {preview
          ? <img alt="" src={preview} />
          : attachment.kind === "IMAGE"
            ? <ImageIcon size={16} />
            : <File size={16} />}
      </i>
      <span title={attachment.path}>{attachment.name}</span>
      <button
        type="button"
        aria-label={`移除附件 ${attachment.name}`}
        onClick={onRemove}
      >
        <X size={12} />
      </button>
    </span>
  );
}

export function HomePage({ store, composerMotion, notify }: HomePageProps) {
  const [goal, setGoal] = useState("");
  const [contexts, setContexts] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [isDraggingAttachment, setIsDraggingAttachment] = useState(false);
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
      const content = goal.trim()
        || (attachments.length > 0 ? "请查看这些附件。" : "");
      if (!content) return;
      await store.getState().createTask(content, project?.path, { attachments });
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

  async function addAttachmentFiles(files: File[]) {
    const available = Math.max(0, 10 - attachments.length);
    const selected = files.slice(0, available);
    if (selected.length === 0) {
      notify("一次最多添加 10 个附件");
      return;
    }
    try {
      const prepared = await Promise.all(
        selected.map((file) => window.lumora.attachments.prepare(file)),
      );
      setAttachments((current) => [...current, ...prepared]);
      notify(`已添加 ${prepared.length} 个附件`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "添加附件失败");
    }
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
          <HalftoneMountainArtwork />
          <h1
            className="home-pixel-drift-title"
            aria-label="今天想在 LUMORA 中完成什么？"
          >
            <span aria-hidden="true">今天想在</span>
            <PixelDriftHeading text="LUMORA" />
            <span aria-hidden="true">中完成什么？</span>
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

          <form
            className={`goal-composer${isDraggingAttachment ? " is-dragging-attachment" : ""}`}
            onSubmit={submitGoal}
            onDragEnter={(event) => {
              if (event.dataTransfer.types.includes("Files")) {
                event.preventDefault();
                setIsDraggingAttachment(true);
              }
            }}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("Files")) event.preventDefault();
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIsDraggingAttachment(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDraggingAttachment(false);
              void addAttachmentFiles([...event.dataTransfer.files]);
            }}
          >
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              multiple
              onChange={(event) => {
                void addAttachmentFiles([...(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
            {attachments.length > 0 && (
              <div className="home-attachment-strip" aria-label="待发送附件">
                {attachments.map((attachment) => (
                  <HomeAttachmentChip
                    attachment={attachment}
                    key={attachment.attachmentId}
                    onRemove={() => setAttachments((current) =>
                        current.filter((item) =>
                          item.attachmentId !== attachment.attachmentId
                        )
                      )}
                  />
                ))}
              </div>
            )}
            <textarea
              ref={goalInput}
              id="task-goal"
              aria-label="告诉 LUMORA 你的目标"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              onKeyDown={submitFormOnEnter}
              onPaste={(event) => {
                const files = [...event.clipboardData.files];
                if (files.length === 0) return;
                event.preventDefault();
                void addAttachmentFiles(files);
              }}
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
                disabled={(!goal.trim() && attachments.length === 0) || isCreating}
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
