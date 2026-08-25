import { useState } from "react";
import { FolderOpen, GitBranch, X } from "lucide-react";
import { useStore } from "zustand";

import type { ProjectDirectory } from "../../../../shared/window-contract";
import type { LumoraModelApi } from "../../../../shared/model-contract";
import type {
  LumoraWorkspaceApi,
  WorkspaceEnvironmentSelection,
} from "../../../../shared/workspace-contract";
import {
  loadActiveProject,
  saveActiveProject,
} from "../state/project-context-storage";
import type { TaskStore } from "../state/task-store";
import { HalftoneMountainArtwork } from "../components/HalftoneMountainArtwork";
import { PixelDriftHeading } from "../components/PixelDriftHeading";
import { DraftEnvironmentPicker } from "../components/DraftEnvironmentPicker";
import {
  HomeComposer,
  type HomeComposerSubmission,
} from "../components/HomeComposer";

interface HomePageProps {
  store: TaskStore;
  modelApi?: LumoraModelApi;
  workspaceApi?: LumoraWorkspaceApi;
  composerMotion?: "from-bottom";
  notify(message: string, tone?: "info" | "success"): void;
}
export function HomePage({
  store,
  modelApi,
  workspaceApi,
  composerMotion,
  notify,
}: HomePageProps) {
  const [project, setProject] = useState<ProjectDirectory | undefined>(
    loadActiveProject,
  );
  const [environmentSelection, setEnvironmentSelection] =
    useState<WorkspaceEnvironmentSelection>({ target: "LOCAL" });
  const isCreating = useStore(store, (state) => state.isCreating);
  const error = useStore(store, (state) => state.error);

  async function submitGoal(submission: HomeComposerSubmission) {
    try {
      await store.getState().createTask(submission.content, project?.path, {
        attachments: submission.attachments,
        environmentSelection,
        model: submission.model,
        permissionMode: submission.permissionMode,
      });
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
    setEnvironmentSelection({ target: "LOCAL" });
    saveActiveProject(selected);
    notify(`已选择项目：${selected.name}`, "success");
  }

  function clearProject() {
    setProject(undefined);
    setEnvironmentSelection({ target: "LOCAL" });
    saveActiveProject(undefined);
    notify("已切换为无项目对话");
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
            <DraftEnvironmentPicker
              api={workspaceApi}
              workspacePath={project?.path}
              value={environmentSelection}
              onChange={setEnvironmentSelection}
            />
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

          <HomeComposer
            isCreating={isCreating}
            modelApi={modelApi}
            notify={notify}
            onSubmit={submitGoal}
          />
        </div>
        {error && <p className="form-error">{error}</p>}

        <p className="home-privacy-note">
          项目路径和会话记录仅保存在本机；敏感操作仍会请求确认。
        </p>
      </section>
    </main>
  );
}
