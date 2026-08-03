import { Fragment, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  Copy,
  Download,
  FileDiff,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Square,
  X,
} from "lucide-react";
import { useStore } from "zustand";

import type {
  LumoraModelApi,
  ModelSettings,
  ReasoningEffort,
} from "../../../shared/model-contract";
import type { TaskStatus } from "../../../shared/task-contract";
import { MarkdownMessage } from "../../components/MarkdownMessage";
import { resizeTextarea } from "../../utils/auto-resize-textarea";
import { submitFormOnEnter } from "../../utils/submit-on-enter";
import { ApprovalDock } from "./ApprovalDock";
import { AgentRunSummary } from "./AgentRunSummary";
import { DiffReviewPane } from "./DiffReviewPane";
import type { TaskStore } from "./task-store";

interface TaskPageProps {
  store: TaskStore;
  modelApi?: LumoraModelApi;
  notify(message: string, tone?: "info" | "success"): void;
}

export function TaskPage({ store, modelApi, notify }: TaskPageProps) {
  const task = useStore(store, (state) => state.activeTask);
  const messages = useStore(store, (state) => state.messages);
  const isChatting = useStore(store, (state) => state.isChatting);
  const chatWasStopped = useStore(store, (state) => state.chatWasStopped);
  const chatError = useStore(store, (state) => state.chatError);
  const chatStartedAt = useStore(store, (state) => state.chatStartedAt);
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
  const [modelSettings, setModelSettings] = useState<ModelSettings>();
  const [selectedModel, setSelectedModel] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>("high");
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const conversationScrollRef = useRef<HTMLDivElement>(null);
  const followUpInputRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const conversationFooterRef = useRef<HTMLDivElement>(null);
  const scrollStateFrameRef = useRef<number | null>(null);
  const railPointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const railWasDraggedRef = useRef(false);
  const lastAutoScrolledQuestionRef = useRef<string | undefined>(undefined);
  const lastOpenedTaskRef = useRef<string | undefined>(undefined);

  useEffect(
    () => resizeTextarea(followUpInputRef.current, 180),
    [followUp],
  );

  useEffect(() => {
    if (!modelApi) {
      return;
    }
    void modelApi
      .getSettings()
      .then((settings) => {
        setModelSettings(settings);
        setSelectedModel(settings.model);
        if (settings.apiKeyConfigured) {
          void modelApi
            .listModels({
              providerName: settings.providerName,
              baseUrl: settings.baseUrl,
            })
            .then(setAvailableModels)
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, [modelApi]);
  useEffect(
    () => resizeTextarea(editInputRef.current, 220),
    [editingContent, editingMessageId],
  );

  useEffect(() => {
    const scroll = conversationScrollRef.current;
    const footer = conversationFooterRef.current;
    if (!scroll || !footer) {
      return;
    }
    const syncFooterHeight = () => {
      scroll.style.setProperty(
        "--conversation-footer-height",
        `${footer.getBoundingClientRect().height}px`,
      );
    };
    syncFooterHeight();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(syncFooterHeight);
    observer.observe(footer);
    return () => observer.disconnect();
  }, [task?.taskId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const scroll = conversationScrollRef.current;
      if (scroll) {
        setShowScrollToBottom(
          scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight > 56,
        );
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, isChatting]);

  useEffect(() => {
    if (!isChatting) {
      return;
    }
    const latestUser = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    if (!latestUser) {
      return;
    }
    const questionKey =
      latestUser.messageId ??
      `${latestUser.createdAt ?? ""}:${latestUser.content}`;
    if (lastAutoScrolledQuestionRef.current === questionKey) {
      return;
    }
    lastAutoScrolledQuestionRef.current = questionKey;
    requestAnimationFrame(() => {
      const questionCount =
        conversationScrollRef.current?.querySelectorAll(
          "[data-question-index]",
        ).length ?? 0;
      if (questionCount > 0) {
        scrollToQuestion(questionCount - 1);
      }
    });
  }, [isChatting, messages]);

  useEffect(() => {
    if (!task || lastOpenedTaskRef.current === task.taskId) {
      return;
    }
    lastOpenedTaskRef.current = task.taskId;
    requestAnimationFrame(() => {
      const questionCount =
        conversationScrollRef.current?.querySelectorAll(
          "[data-question-index]",
        ).length ?? 0;
      if (questionCount > 0) {
        scrollToQuestion(questionCount - 1, "auto");
      }
    });
  }, [messages, task]);

  useEffect(
    () => () => {
      if (scrollStateFrameRef.current !== null) {
        cancelAnimationFrame(scrollStateFrameRef.current);
      }
    },
    [],
  );

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
  const questionEntries = displayMessages.flatMap((message, messageIndex) => {
    if (message.role !== "user") {
      return [];
    }
    const responseIndex = messageIndex + 1;
    const response = displayMessages[responseIndex];
    const result =
      response?.role === "assistant" &&
      !(isChatting && responseIndex === displayMessages.length - 1)
        ? response.content.trim()
        : "";
    return [{ message, messageIndex, result }];
  });

  function cancelConversationScrollAnimation() {
    const scroll = conversationScrollRef.current;
    if (scroll) {
      if (typeof scroll.scrollTo === "function") {
        scroll.scrollTo({ top: scroll.scrollTop, behavior: "auto" });
      }
    }
  }

  function animateConversationScroll(targetTop: number) {
    const scroll = conversationScrollRef.current;
    if (!scroll) {
      return;
    }
    const boundedTarget = Math.max(
      0,
      Math.min(targetTop, scroll.scrollHeight - scroll.clientHeight),
    );
    if (typeof scroll.scrollTo === "function") {
      scroll.scrollTo({
        top: boundedTarget,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    } else {
      scroll.scrollTop = boundedTarget;
    }
  }

  function scrollToQuestion(
    questionIndex: number,
    behavior: ScrollBehavior = "smooth",
  ) {
    const scroll = conversationScrollRef.current;
    const question = scroll?.querySelector<HTMLElement>(
      `[data-question-index="${questionIndex}"]`,
    );
    if (!scroll || !question) {
      return;
    }
    const targetTop =
      scroll.scrollTop +
      question.getBoundingClientRect().top -
      scroll.getBoundingClientRect().top -
      34;
    if (behavior === "smooth") {
      animateConversationScroll(targetTop);
    } else {
      cancelConversationScrollAnimation();
      scroll.scrollTop = targetTop;
    }
    setActiveQuestionIndex(questionIndex);
  }

  function scrollToConversationBottom() {
    const scroll = conversationScrollRef.current;
    if (scroll) {
      animateConversationScroll(scroll.scrollHeight - scroll.clientHeight);
    }
  }

  function updateActiveQuestion(event: React.UIEvent<HTMLDivElement>) {
    if (scrollStateFrameRef.current !== null) {
      return;
    }
    const scroll = event.currentTarget;
    scrollStateFrameRef.current = requestAnimationFrame(() => {
      scrollStateFrameRef.current = null;
      setShowScrollToBottom(
        scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight > 56,
      );
      const questions = Array.from(
        scroll.querySelectorAll<HTMLElement>("[data-question-index]"),
      );
      if (questions.length === 0) {
        return;
      }
      const firstQuestion = questions[0];
      if (!firstQuestion) {
        return;
      }
      const scrollTop = scroll.getBoundingClientRect().top + 34;
      let nearest = firstQuestion;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const question of questions) {
        const distance = Math.abs(
          question.getBoundingClientRect().top - scrollTop,
        );
        if (distance < nearestDistance) {
          nearest = question;
          nearestDistance = distance;
        }
      }
      setActiveQuestionIndex(Number(nearest.dataset.questionIndex));
    });
  }

  function scrollConversationFromRail(event: React.WheelEvent<HTMLElement>) {
    event.preventDefault();
    cancelConversationScrollAnimation();
    conversationScrollRef.current?.scrollBy({ top: event.deltaY });
  }

  function scrubQuestionRail(event: React.PointerEvent<HTMLElement>) {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        ".question-rail-item",
      ),
    );
    if (items.length === 0) {
      return;
    }
    const nearest = items.reduce((current, item) => {
      const currentBounds = current.getBoundingClientRect();
      const itemBounds = item.getBoundingClientRect();
      const currentDistance = Math.abs(
        currentBounds.top + currentBounds.height / 2 - event.clientY,
      );
      const itemDistance = Math.abs(
        itemBounds.top + itemBounds.height / 2 - event.clientY,
      );
      return itemDistance < currentDistance ? item : current;
    });
    scrollToQuestion(Number(nearest.dataset.railQuestionIndex), "auto");
  }

  async function submitFollowUp(event: React.FormEvent) {
    event.preventDefault();
    const content = followUp.trim();
    if (!content || isChatting) {
      return;
    }
    setFollowUp("");
    await store.getState().sendMessage(content, {
      model: selectedModel || undefined,
      reasoningEffort: isDeepSeek ? reasoningEffort : undefined,
    });
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
      await store.getState().regenerateMessage(messageId, content, {
        model: selectedModel || undefined,
        reasoningEffort: isDeepSeek ? reasoningEffort : undefined,
      });
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

  const configuredModel = modelSettings?.model || selectedModel;
  const isDeepSeek = [
    modelSettings?.providerName,
    modelSettings?.baseUrl,
    selectedModel,
  ].some((value) => value?.toLowerCase().includes("deepseek"));
  const modelOptions = [
    ...new Set(
      [
        configuredModel,
        ...availableModels,
        ...messages.map((message) => message.model ?? ""),
      ].filter(Boolean),
    ),
  ];
  const contextLimit = modelSettings?.contextWindow ?? 128_000;
  const reportedTotalTokens = [...messages]
    .reverse()
    .find((message) => message.usage)?.usage?.totalTokens;
  const estimatedTokens = Math.ceil(
    messages.reduce((total, message) => total + message.content.length, 0) / 4,
  );
  const contextTokens = reportedTotalTokens ?? estimatedTokens;
  const contextPercent = Math.min(
    100,
    Math.round((contextTokens / contextLimit) * 100),
  );

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

      <div className="task-stage">
        <aside className="question-rail" aria-label="本次会话的问题记录">
          <nav
            className="question-rail-track"
            aria-label="跳转到会话问题"
            onWheel={scrollConversationFromRail}
            onPointerDown={(event) => {
              railPointerStartRef.current = {
                x: event.clientX,
                y: event.clientY,
              };
              railWasDraggedRef.current = false;
            }}
            onPointerMove={(event) => {
              const start = railPointerStartRef.current;
              if (
                start &&
                Math.hypot(
                  event.clientX - start.x,
                  event.clientY - start.y,
                ) > 4
              ) {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.setPointerCapture(event.pointerId);
                }
                railWasDraggedRef.current = true;
                scrubQuestionRail(event);
              }
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              railPointerStartRef.current = null;
            }}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              railPointerStartRef.current = null;
            }}
          >
            <div className="question-rail-list">
              {questionEntries.map(({ message, result }, questionIndex) => (
                <button
                  className={`question-rail-item${
                    activeQuestionIndex === questionIndex ? " active" : ""
                  }`}
                  type="button"
                  key={message.messageId ?? `question-${questionIndex}`}
                  data-rail-question-index={questionIndex}
                  aria-label={`跳转到问题 ${questionIndex + 1}：${message.content}`}
                  aria-current={
                    activeQuestionIndex === questionIndex ? "step" : undefined
                  }
                  onClick={() => {
                    if (railWasDraggedRef.current) {
                      railWasDraggedRef.current = false;
                      return;
                    }
                    scrollToQuestion(questionIndex);
                  }}
                >
                  <span className="question-rail-tooltip" aria-hidden="true">
                    <strong>{message.content}</strong>
                    {result && (
                      <span className="question-rail-result">{result}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </nav>
        </aside>

        <section className="conversation-pane">
          <div
            className="conversation-scroll"
            ref={conversationScrollRef}
            onScroll={updateActiveQuestion}
            onWheelCapture={cancelConversationScrollAnimation}
            onPointerDownCapture={cancelConversationScrollAnimation}
          >
            <div className="conversation-content">
              {task.errorMessage && (
                <div className="task-error-banner">{task.errorMessage}</div>
              )}

              {displayMessages.map((message, index) => {
                const questionIndex =
                  message.role === "user"
                    ? questionEntries.findIndex(
                        (entry) => entry.messageIndex === index,
                      )
                    : undefined;
                const isCurrentAssistant =
                  message.role === "assistant" &&
                  isChatting &&
                  index === displayMessages.length - 1;
                const isThinkingStage =
                  isCurrentAssistant &&
                  !message.content.trim() &&
                  taskEvents.length === 0;
                return (
                <Fragment
                  key={message.messageId ?? `${message.role}-${index}`}
                >
                  {message.role === "assistant" && !isThinkingStage && (
                      <AgentRunSummary
                        startedAt={chatStartedAt}
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
                        stopped={
                          chatWasStopped &&
                          index === displayMessages.length - 1
                        }
                      />
                    )}
                  {message.role === "user" ? (
                    <article
                      className="user-message-group"
                      data-question-index={questionIndex}
                    >
                      {editingMessageId &&
                      editingMessageId === message.messageId ? (
                        <form
                          className="user-message user-message-edit"
                          onSubmit={submitEditedMessage}
                        >
                          <textarea
                            ref={editInputRef}
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
                            <Copy size={16} />
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
                                <Pencil size={16} />
                              </button>
                            )}
                        </span>
                      </div>
                    </article>
                  ) : (
                    <>
                      {isThinkingStage ? (
                        <div className="thinking-stage" role="status">
                          <span>正在思考</span>
                        </div>
                      ) : message.content ? (
                        <article className="assistant-message">
                          <MarkdownMessage content={message.content} />
                          {isCurrentAssistant && (
                            <span className="stream-cursor" aria-hidden="true" />
                          )}
                        </article>
                      ) : null}
                    </>
                  )}
                </Fragment>
                );
              })}
              {isChatting && messages.at(-1)?.role !== "assistant" && (
                <article className="assistant-message pending">
                  <span>LUMORA</span>
                  <p>正在思考</p>
                </article>
              )}
              {chatError && (
                <div className="task-error-banner">{chatError}</div>
              )}
            </div>
          </div>

          <div className="conversation-footer" ref={conversationFooterRef}>
            <div className="conversation-footer-inner">
              {task.approval && <ApprovalDock store={store} />}
              <div className="conversation-composer-wrap">
                {showScrollToBottom && (
                  <button
                    className={`scroll-to-bottom${
                      isChatting ? " is-processing" : ""
                    }`}
                    type="button"
                    aria-label="返回对话底部"
                    title="返回底部"
                    onClick={scrollToConversationBottom}
                  >
                    {isChatting ? (
                      <span className="scroll-to-bottom-dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      <ArrowDown size={19} strokeWidth={1.8} />
                    )}
                  </button>
                )}
                <form className="follow-up-composer" onSubmit={submitFollowUp}>
                  <textarea
                    ref={followUpInputRef}
                    aria-label="继续任务"
                    placeholder="补充目标、附加上下文或纠正当前任务…"
                    rows={2}
                    value={followUp}
                    onChange={(event) => setFollowUp(event.target.value)}
                    onKeyDown={submitFormOnEnter}
                  />
                  <div className="composer-toolbar">
                    <button
                      className="composer-attach"
                      type="button"
                      aria-label="添加上下文"
                      onClick={() =>
                        notify("上下文选择器已响应，任务附件接口待接入")
                      }
                    >
                      <Paperclip size={17} />
                      <span>添加上下文</span>
                    </button>
                    <div className="composer-controls">
                      <span
                        className="context-usage-ring"
                        role="meter"
                        aria-label="上下文已用"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={contextPercent}
                        title={`当前会话上下文 ${contextTokens.toLocaleString()} / ${contextLimit.toLocaleString()} Token${reportedTotalTokens === undefined ? "（估算）" : "（模型精确用量）"}`}
                        style={{
                          "--context-progress": `${contextPercent * 3.6}deg`,
                        } as React.CSSProperties}
                      />
                      <label className="composer-select model-select">
                        <span className="visually-hidden">选择模型</span>
                        <select
                          aria-label="选择模型"
                          value={selectedModel}
                          onChange={(event) =>
                            setSelectedModel(event.target.value)
                          }
                        >
                          {!selectedModel && <option value="">模型</option>}
                          {modelOptions.map((model) => (
                            <option value={model} key={model}>
                              {modelDisplayName(model)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={13} />
                      </label>
                      {isDeepSeek && (
                        <label className="composer-select reasoning-select">
                          <span className="visually-hidden">选择思考强度</span>
                          <select
                            aria-label="选择思考强度"
                            value={reasoningEffort}
                            onChange={(event) =>
                              setReasoningEffort(
                                event.target.value as ReasoningEffort,
                              )
                            }
                          >
                            <option value="low">低</option>
                            <option value="high">高</option>
                            <option value="max">Max</option>
                          </select>
                          <ChevronDown size={13} />
                        </label>
                      )}
                      <button
                        className={`send-follow-up${
                          isChatting ? " is-stopping" : ""
                        }`}
                        type={isChatting ? "button" : "submit"}
                        aria-label={isChatting ? "停止生成" : "发送消息"}
                        disabled={!isChatting && !followUp.trim()}
                        onClick={
                          isChatting
                            ? () => store.getState().stopChat()
                            : undefined
                        }
                      >
                        {isChatting ? (
                          <Square
                            size={10}
                            strokeWidth={2.2}
                            fill="currentColor"
                          />
                        ) : (
                          <ArrowUp size={18} />
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
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

function modelDisplayName(model: string): string {
  if (model === "gpt-5.6-sol") {
    return "5.6 Sol";
  }
  if (model === "gpt-5.6-terra") {
    return "5.6 Terra";
  }
  return model;
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
