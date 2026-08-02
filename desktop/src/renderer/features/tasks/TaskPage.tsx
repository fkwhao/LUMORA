import { Fragment, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Copy,
  Download,
  FileDiff,
  MoreHorizontal,
  Paperclip,
  Pencil,
  X,
} from "lucide-react";
import { useStore } from "zustand";

import type { TaskStatus } from "../../../shared/task-contract";
import { MarkdownMessage } from "../../components/MarkdownMessage";
import { submitFormOnEnter } from "../../utils/submit-on-enter";
import { ApprovalDock } from "./ApprovalDock";
import { AgentRunSummary } from "./AgentRunSummary";
import { DiffReviewPane } from "./DiffReviewPane";
import type { TaskStore } from "./task-store";

interface TaskPageProps {
  store: TaskStore;
  notify(message: string, tone?: "info" | "success"): void;
}

export function TaskPage({ store, notify }: TaskPageProps) {
  const task = useStore(store, (state) => state.activeTask);
  const messages = useStore(store, (state) => state.messages);
  const isChatting = useStore(store, (state) => state.isChatting);
  const chatError = useStore(store, (state) => state.chatError);
  const taskEvents = useStore(store, (state) => state.taskEvents);
  const lastChatDurationMs = useStore(
    store,
    (state) => state.lastChatDurationMs,
  );
  const [followUp, setFollowUp] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewWidth, setReviewWidth] = useState(460);
  const [editingMessageId, setEditingMessageId] = useState<string>();
  const [editingContent, setEditingContent] = useState("");

  if (!task) {
    return null;
  }
  const displayMessages =
    messages.length > 0
      ? messages
      : [
          {
            role: "user" as const,
            content: task.goal,
            createdAt: task.createdAt,
          },
        ];
  const latestUserMessage = [...displayMessages]
    .reverse()
    .find((message) => message.role === "user");

  async function submitFollowUp(event: React.FormEvent) {
    event.preventDefault();
    const content = followUp.trim();
    if (!content || isChatting) {
      return;
    }
    setFollowUp("");
    await store.getState().sendMessage(content);
  }

  async function submitEditedMessage(event: React.FormEvent) {
    event.preventDefault();
    const messageId = editingMessageId;
    const content = editingContent.trim();
    if (!messageId || !content || isChatting) {
      return;
    }
    setEditingMessageId(undefined);
    setEditingContent("");
    try {
      await store.getState().regenerateMessage(messageId, content);
    } catch (error) {
      notify(toErrorMessage(error));
    }
  }

  function exportConversation() {
    if (!task) {
      return;
    }
    const payload = JSON.stringify(
      { task, messages, exportedAt: new Date().toISOString() },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([payload], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lumora-${task.taskId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMoreOpen(false);
    notify("会话记录已导出", "success");
  }

  return (
    <main className="task-layout">
      <header className="task-header">
        <div className="task-title-row">
          <button
            className="icon-button"
            type="button"
            aria-label="返回新建任务"
            onClick={() => store.getState().clearActiveTask()}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1>{task.goal}</h1>
          </div>
          <span className={`status-badge status-${task.status.toLowerCase()}`}>
            {statusLabel(task.status)}
          </span>
        </div>

        <div className="task-actions">
          <button
            className={`review-toggle${reviewOpen ? " active" : ""}`}
            type="button"
            aria-label="审阅文件变更"
            aria-expanded={reviewOpen}
            onClick={() => setReviewOpen((open) => !open)}
          >
            <FileDiff size={15} />
            审阅
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="更多操作"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            <MoreHorizontal size={18} />
          </button>
          {moreOpen && (
            <div className="task-more-menu">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(task.taskId);
                  setMoreOpen(false);
                  notify("任务 ID 已复制", "success");
                }}
              >
                <Copy size={14} />
                复制任务 ID
              </button>
              <button type="button" onClick={exportConversation}>
                <Download size={14} />
                导出会话 JSON
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="task-workspace">
        <section className="conversation-pane">
          <div className="conversation-scroll">
            <div className="conversation-content">
              {task.errorMessage && (
                <div className="task-error-banner">{task.errorMessage}</div>
              )}

              {displayMessages.map((message, index) => (
                <Fragment
                  key={message.messageId ?? `${message.role}-${index}`}
                >
                  {message.role === "assistant" && (
                      <AgentRunSummary
                        durationMs={
                          message.durationMs ||
                          (index === displayMessages.length - 1
                            ? lastChatDurationMs
                            : undefined)
                        }
                        events={
                          index === displayMessages.length - 1
                            ? taskEvents
                            : []
                        }
                        running={
                          isChatting &&
                          index === displayMessages.length - 1
                        }
                      />
                    )}
                  {message.role === "user" ? (
                    <article className="user-message-group">
                      {editingMessageId === message.messageId ? (
                        <form
                          className="user-message user-message-edit"
                          onSubmit={submitEditedMessage}
                        >
                          <textarea
                            autoFocus
                            aria-label="编辑消息"
                            value={editingContent}
                            onChange={(event) =>
                              setEditingContent(event.target.value)
                            }
                            onKeyDown={submitFormOnEnter}
                          />
                          <div className="user-message-edit-actions">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMessageId(undefined);
                                setEditingContent("");
                              }}
                            >
                              <X size={14} />
                              取消
                            </button>
                            <button
                              className="confirm"
                              type="submit"
                              disabled={!editingContent.trim()}
                            >
                              <ArrowUp size={14} />
                              重新发送
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="user-message">
                          <p>{message.content}</p>
                        </div>
                      )}
                      <div className="user-message-meta">
                        <time dateTime={message.createdAt}>
                          {formatMessageTime(message.createdAt)}
                        </time>
                        <span className="user-message-actions">
                          <button
                            type="button"
                            aria-label="复制消息"
                            title="复制"
                            onClick={() => {
                              void navigator.clipboard.writeText(
                                message.content,
                              );
                              notify("消息已复制", "success");
                            }}
                          >
                            <Copy size={14} />
                          </button>
                          {message.messageId &&
                            message.messageId ===
                              latestUserMessage?.messageId && (
                              <button
                                type="button"
                                aria-label="编辑并重新发送消息"
                                title="编辑并重新发送"
                                disabled={isChatting}
                                onClick={() => {
                                  setEditingMessageId(message.messageId);
                                  setEditingContent(message.content);
                                }}
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                        </span>
                      </div>
                    </article>
                  ) : (
                    <article className="assistant-message">
                      {message.content ? (
                        <MarkdownMessage content={message.content} />
                      ) : null}
                      {isChatting &&
                      index === displayMessages.length - 1 && (
                        <span className="stream-cursor" aria-hidden="true" />
                      )}
                    </article>
                  )}
                </Fragment>
              ))}
              {isChatting && messages.at(-1)?.role !== "assistant" && (
                <article className="assistant-message pending">
                  <span>LUMORA</span>
                  <p>
                    正在处理<span className="thinking-dots">•••</span>
                  </p>
                </article>
              )}
              {chatError && (
                <div className="task-error-banner">{chatError}</div>
              )}
            </div>
          </div>

          <div className="conversation-footer">
            <div className="conversation-footer-inner">
              {task.approval && <ApprovalDock store={store} />}
              <form className="follow-up-composer" onSubmit={submitFollowUp}>
                <textarea
                  aria-label="继续任务"
                  placeholder="补充目标、附加上下文或纠正当前任务…"
                  rows={2}
                  value={followUp}
                  onChange={(event) => setFollowUp(event.target.value)}
                  onKeyDown={submitFormOnEnter}
                />
                <div>
                  <button
                    type="button"
                    aria-label="添加上下文"
                    onClick={() =>
                      notify("上下文选择器已响应，任务附件接口待接入")
                    }
                  >
                    <Paperclip size={17} />
                    添加上下文
                  </button>
                  <button
                    className="send-follow-up"
                    type="submit"
                    aria-label="发送消息"
                    disabled={!followUp.trim() || isChatting}
                  >
                    <ArrowUp size={18} />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>

        {reviewOpen && (
          <DiffReviewPane
            width={reviewWidth}
            onClose={() => setReviewOpen(false)}
            onWidthChange={setReviewWidth}
          />
        )}
      </div>
    </main>
  );
}

function statusLabel(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    CREATED: "已创建",
    PLANNING: "规划中",
    RUNNING: "运行中",
    WAITING_APPROVAL: "等待确认",
    COMPLETED: "已完成",
    REJECTED: "已拒绝",
    INTERRUPTED: "已中断",
    FAILED: "失败",
  };
  return labels[status];
}

function formatMessageTime(createdAt?: string): string {
  if (!createdAt) {
    return "";
  }
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "重新生成回答失败";
}
