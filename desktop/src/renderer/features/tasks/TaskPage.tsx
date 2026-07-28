import {
  ArrowLeft,
  Bot,
  Check,
  FileText,
  FolderOpen,
  MoreHorizontal,
  Pause,
} from "lucide-react";
import { useStore } from "zustand";

import { ApprovalDock } from "./ApprovalDock";
import type { TaskStore } from "./task-store";

interface TaskPageProps {
  store: TaskStore;
}

export function TaskPage({ store }: TaskPageProps) {
  const task = useStore(store, (state) => state.activeTask);
  if (!task) {
    return null;
  }

  const matchedStepIndex = task.planSteps.findIndex(
    (step) =>
      step.title === task.activeStep || step.stepId === task.activeStep,
  );
  const activeStepIndex = Math.max(0, matchedStepIndex);
  const currentStepNumber =
    task.planSteps.length === 0
      ? 0
      : Math.min(activeStepIndex + 1, task.planSteps.length);

  return (
    <main className="task-layout">
      <header className="task-header">
        <div className="task-title-row">
          <button type="button" aria-label="返回">
            <ArrowLeft size={20} />
          </button>
          <h1>{task.goal}</h1>
          <span className={`status-badge status-${task.status.toLowerCase()}`}>
            {task.status === "COMPLETED" ? "已完成" : "运行中"}
          </span>
        </div>
        <div className="task-actions">
          <button type="button">
            <Pause size={17} />
            暂停任务
          </button>
          <button className="danger-action" type="button">
            取消任务
          </button>
          <button type="button" aria-label="更多操作">
            <MoreHorizontal size={18} />
          </button>
        </div>
        <div className="task-progress">
          <strong>{task.status === "COMPLETED" ? "100%" : "60%"}</strong>
          <div className="progress-track">
            <span style={{ width: task.status === "COMPLETED" ? "100%" : "60%" }} />
          </div>
          <small>已运行 18 分钟 · 3 个 Agent 协作</small>
        </div>
        <nav className="task-tabs" aria-label="任务视图">
          <button type="button">任务概览</button>
          <button className="active" type="button">
            执行过程
          </button>
          <button type="button">生成结果</button>
        </nav>
      </header>

      <div className="task-content">
        <aside className="step-panel">
          <h2>任务流程</h2>
          <ol>
            {task.planSteps.map((step, index) => (
              <li
                className={index === activeStepIndex ? "current" : ""}
                key={step.stepId}
              >
                <span>{index < activeStepIndex ? <Check size={14} /> : index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <small>
                    {index < activeStepIndex
                      ? "已完成"
                      : index === activeStepIndex
                        ? "运行中"
                        : "等待中"}
                  </small>
                </div>
              </li>
            ))}
            {task.planSteps.length === 0 && (
              <li className="empty-step">Agent 尚未返回任务计划</li>
            )}
          </ol>
          <p>
            {currentStepNumber} / {task.planSteps.length} 步骤
          </p>
        </aside>

        <section className="execution-panel">
          <header>
            <div>
              <h2>{task.activeStep || "正在整理收集到的资料"}</h2>
              <p>
                <Bot size={16} />
                Browser Agent <span>正在工作</span>
              </p>
            </div>
          </header>

          <div className="work-preview">
            <div className="document-stack" aria-hidden="true">
              <article>
                <span>东京地铁线路图</span>
              </article>
              <article>
                <span>富士山旅行指南</span>
              </article>
              <article>
                <span>日本铁路全攻略</span>
              </article>
            </div>
            <div className="collected-files">
              <h3>已收集 12 个文件</h3>
              {["日本交通攻略.pdf", "东京地铁线路图.png", "交通费用对比.xlsx"].map(
                (file) => (
                  <div key={file}>
                    <FileText size={17} />
                    <span>{file}</span>
                    <small>已同步</small>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="execution-status">
            <SparkStatus />
            <span>{task.activeStep || "正在将资料归类到工作空间"}</span>
            <div className="progress-track">
              <span style={{ width: "72%" }} />
            </div>
            <strong>72%</strong>
          </div>

          {task.status === "COMPLETED" && (
            <div className="completion-banner">
              <Check size={20} />
              <div>
                <strong>任务已完成</strong>
                <p>{task.resultSummary}</p>
              </div>
            </div>
          )}
        </section>

        <aside className="task-rail">
          <section>
            <h2>协作 Agent · 3</h2>
            {["Browser Agent", "File Agent", "Writer Agent"].map((agent) => (
              <div className="agent-row" key={agent}>
                <span>
                  <Bot size={17} />
                </span>
                <div>
                  <strong>{agent}</strong>
                  <small>{agent === "Writer Agent" ? "等待中" : "工作中"}</small>
                </div>
              </div>
            ))}
          </section>

          {task.approval && <ApprovalDock store={store} />}

          <section className="task-data">
            <h2>任务数据</h2>
            <strong>12</strong>
            <p>已收集文件</p>
            <small>4 个网页 · 28.6 MB</small>
          </section>

          <button className="open-folder" type="button">
            <FolderOpen size={17} />
            打开任务文件夹
          </button>
        </aside>
      </div>
    </main>
  );
}

function SparkStatus() {
  return <span className="spark-status">✦</span>;
}
