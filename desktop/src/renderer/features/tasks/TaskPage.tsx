import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Download,
  File,
  FileDiff,
  Folder,
  Globe2,
  Hand,
  Lightbulb,
  Mic,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldAlert,
  Square,
  Target,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useStore } from "zustand";

import type {
  ChatMessage,
  LumoraModelApi,
  ModelSettings,
  PermissionMode,
  ReasoningEffort,
  WorkLogItem,
} from "../../../shared/model-contract";
import type { TaskEvent, TaskStatus } from "../../../shared/task-contract";
import { MarkdownMessage } from "../../components/MarkdownMessage";
import { resizeTextarea } from "../../utils/auto-resize-textarea";
import { submitFormOnEnter } from "../../utils/submit-on-enter";
import { ApprovalDock } from "./ApprovalDock";
import { ToolApprovalDialog } from "./ToolApprovalDialog";
import { AgentRunSummary } from "./AgentRunSummary";
import { DiffReviewPane, type FileChange } from "./DiffReviewPane";
import type { TaskStore } from "./task-store";

interface TaskPageProps {
  store: TaskStore;
  modelApi?: LumoraModelApi;
  notify(message: string, tone?: "info" | "success"): void;
}

type ComposerReasoningEffort = ReasoningEffort;
const EMPTY_TASK_EVENTS: TaskEvent[] = [];

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
  const [selectedChangeId, setSelectedChangeId] = useState<string>();
  const [editingMessageId, setEditingMessageId] = useState<string>();
  const [editingContent, setEditingContent] = useState("");
  const [modelSettings, setModelSettings] = useState<ModelSettings>();
  const [selectedModel, setSelectedModel] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [reasoningEffort, setReasoningEffort] =
    useState<ComposerReasoningEffort>("high");
  const [messageReactions, setMessageReactions] = useState<
    Record<string, "like" | "dislike">
  >({});
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(
    loadPermissionMode,
  );
  const [composerMenu, setComposerMenu] = useState<
    "context" | "permission" | "model" | "reasoning" | null
  >(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const conversationScrollRef = useRef<HTMLDivElement>(null);
  const conversationContentRef = useRef<HTMLDivElement>(null);
  const followUpInputRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const conversationFooterRef = useRef<HTMLDivElement>(null);
  const composerMenuRef = useRef<HTMLFormElement>(null);
  const contextFileInputRef = useRef<HTMLInputElement>(null);
  const taskActionsRef = useRef<HTMLDivElement>(null);
  const scrollStateFrameRef = useRef<number | null>(null);
  const questionLayoutFrameRef = useRef<number | null>(null);
  const questionPositionsRef = useRef<Array<{ index: number; top: number }>>(
    [],
  );
  const railPointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const railWasDraggedRef = useRef(false);
  const lastAutoScrolledQuestionRef = useRef<string | undefined>(undefined);
  const lastOpenedTaskRef = useRef<string | undefined>(undefined);
  const openChangeReview = useCallback((item: WorkLogItem) => {
    setSelectedChangeId(item.itemId);
    setReviewOpen(true);
  }, []);

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
    if (!composerMenu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        !target.closest(".composer-menu-anchor") &&
        !target.closest(".composer-popover")
      ) {
        setComposerMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setComposerMenu(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [composerMenu]);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!taskActionsRef.current?.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

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
    const scroll = conversationScrollRef.current;
    const content = conversationContentRef.current;
    if (!scroll || !content) {
      return;
    }
    const refreshQuestionPositions = () => {
      if (questionLayoutFrameRef.current !== null) {
        cancelAnimationFrame(questionLayoutFrameRef.current);
      }
      questionLayoutFrameRef.current = requestAnimationFrame(() => {
        questionLayoutFrameRef.current = null;
        const scrollTop = scroll.getBoundingClientRect().top;
        questionPositionsRef.current = Array.from(
          content.querySelectorAll<HTMLElement>("[data-question-index]"),
        ).map((question) => ({
          index: Number(question.dataset.questionIndex),
          top:
            scroll.scrollTop +
            question.getBoundingClientRect().top -
            scrollTop,
        }));
      });
    };
    refreshQuestionPositions();
    if (typeof ResizeObserver === "undefined") {
      return () => {
        if (questionLayoutFrameRef.current !== null) {
          cancelAnimationFrame(questionLayoutFrameRef.current);
          questionLayoutFrameRef.current = null;
        }
      };
    }
    const observer = new ResizeObserver(refreshQuestionPositions);
    observer.observe(content);
    return () => {
      observer.disconnect();
      if (questionLayoutFrameRef.current !== null) {
        cancelAnimationFrame(questionLayoutFrameRef.current);
        questionLayoutFrameRef.current = null;
      }
    };
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
  const fileChanges = fileChangesFromMessages(displayMessages);
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
      const positions = questionPositionsRef.current;
      if (positions.length === 0) {
        return;
      }
      const targetTop = scroll.scrollTop + 34;
      let low = 0;
      let high = positions.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        const position = positions[middle];
        if (position && position.top < targetTop) {
          low = middle + 1;
        } else {
          high = middle;
        }
      }
      const after = positions[Math.min(low, positions.length - 1)];
      const before = positions[Math.max(0, low - 1)];
      if (!after || !before) {
        return;
      }
      const nearest =
        Math.abs(after.top - targetTop) < Math.abs(before.top - targetTop)
          ? after
          : before;
      setActiveQuestionIndex((current) =>
        current === nearest.index ? current : nearest.index,
      );
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
      reasoningEffort,
      permissionMode,
    });
  }

  function openLocalContext(folder: boolean) {
    const input = contextFileInputRef.current;
    if (!input) return;
    folder
      ? input.setAttribute("webkitdirectory", "")
      : input.removeAttribute("webkitdirectory");
    setComposerMenu(null);
    input.click();
  }

  function toggleMessageReaction(
    messageKey: string,
    reaction: "like" | "dislike",
  ) {
    setMessageReactions((current) => {
      const next = { ...current };
      if (next[messageKey] === reaction) {
        delete next[messageKey];
      } else {
        next[messageKey] = reaction;
      }
      return next;
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
        reasoningEffort,
        permissionMode,
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
  const modelOptions = [
    ...new Set(
      [
        configuredModel,
        ...availableModels,
        ...messages.map((message) => message.model ?? ""),
      ].filter(Boolean),
    ),
  ];
  const contextLimit = modelSettings?.models.find(
    (model) => model.modelId === selectedModel,
  )?.contextWindow ?? modelSettings?.contextWindow ?? 128_000;
  const reportedTotalTokens = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" &&
        (message.usage?.totalTokens ?? 0) > 0,
    )?.usage?.totalTokens;
  const estimatedTokens = estimateConversationTokens(messages);
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

        <div className="task-actions" ref={taskActionsRef}>
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
            <div className="conversation-content" ref={conversationContentRef}>
              {task.errorMessage && (
                <div className="task-error-banner">{task.errorMessage}</div>
              )}

              {displayMessages.map((message, index) => {
                const messageKey =
                  message.messageId ?? `${message.role}-${index}`;
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
                  (message.workLog?.length ?? 0) === 0 &&
                  taskEvents.length === 0;
                return (
                <Fragment
                  key={messageKey}
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
                            : EMPTY_TASK_EVENTS
                        }
                        workLog={message.workLog}
                        running={
                          isChatting &&
                          index === displayMessages.length - 1
                        }
                        stopped={
                          chatWasStopped &&
                          index === displayMessages.length - 1
                        }
                        onReviewChange={openChangeReview}
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
                    <>
                      {isThinkingStage ? (
                        <div className="thinking-stage" role="status">
                          <span>正在思考</span>
                        </div>
                      ) : message.content ? (
                        <article className="assistant-message-group">
                          <div className="assistant-message">
                            <MarkdownMessage content={message.content} />
                            {isCurrentAssistant && (
                              <span
                                className="stream-cursor"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                          {!isCurrentAssistant && (
                            <div className="assistant-message-meta">
                              <span className="assistant-message-actions">
                                <button
                                  type="button"
                                  aria-label="复制回复"
                                  title="复制"
                                  onClick={() => {
                                    void navigator.clipboard.writeText(
                                      message.content,
                                    );
                                    notify("回复已复制", "success");
                                  }}
                                >
                                  <Copy size={14} />
                                </button>
                                <button
                                  className={
                                    messageReactions[messageKey] === "like"
                                      ? "active"
                                      : undefined
                                  }
                                  type="button"
                                  aria-label="喜欢这条回复"
                                  aria-pressed={
                                    messageReactions[messageKey] === "like"
                                  }
                                  title="喜欢"
                                  onClick={() =>
                                    toggleMessageReaction(messageKey, "like")
                                  }
                                >
                                  <ThumbsUp size={14} />
                                </button>
                                <button
                                  className={
                                    messageReactions[messageKey] === "dislike"
                                      ? "active"
                                      : undefined
                                  }
                                  type="button"
                                  aria-label="不喜欢这条回复"
                                  aria-pressed={
                                    messageReactions[messageKey] === "dislike"
                                  }
                                  title="不喜欢"
                                  onClick={() =>
                                    toggleMessageReaction(
                                      messageKey,
                                      "dislike",
                                    )
                                  }
                                >
                                  <ThumbsDown size={14} />
                                </button>
                              </span>
                              <time dateTime={message.createdAt}>
                                {formatMessageDateTime(message.createdAt)}
                              </time>
                            </div>
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
                <form
                  className="follow-up-composer"
                  onSubmit={submitFollowUp}
                  ref={composerMenuRef}
                >
                  <input
                    ref={contextFileInputRef}
                    className="visually-hidden"
                    type="file"
                    multiple
                    onChange={(event) => {
                      const count = event.target.files?.length ?? 0;
                      if (count > 0) {
                        notify(`已选择 ${count} 个本地资源`, "success");
                      }
                      event.target.value = "";
                    }}
                  />
                  <textarea
                    ref={followUpInputRef}
                    aria-label="继续任务"
                    placeholder="随心输入"
                    rows={2}
                    value={followUp}
                    onChange={(event) => setFollowUp(event.target.value)}
                    onKeyDown={submitFormOnEnter}
                  />
                  <div className="composer-toolbar">
                    <div className="composer-toolbar-left">
                      <span className="composer-menu-anchor">
                        <button
                          className="composer-icon-button"
                          type="button"
                          aria-label="添加上下文"
                          aria-expanded={composerMenu === "context"}
                          onClick={() =>
                            setComposerMenu((open) =>
                              open === "context" ? null : "context",
                            )
                          }
                        >
                          <Plus size={20} strokeWidth={1.7} />
                        </button>
                      </span>

                      <span className="composer-menu-anchor permission-anchor">
                        <button
                          className={`composer-permission-button${
                            permissionMode === "full_access"
                              ? " is-dangerous"
                              : ""
                          }`}
                          type="button"
                          aria-label="选择权限模式"
                          aria-expanded={composerMenu === "permission"}
                          data-permission-mode={permissionMode}
                          onClick={() =>
                            setComposerMenu((open) =>
                              open === "permission" ? null : "permission",
                            )
                          }
                        >
                          <PermissionModeIcon mode={permissionMode} size={17} />
                          <span>{permissionModeLabel(permissionMode)}</span>
                        </button>
                        {composerMenu === "permission" && (
                          <span
                            className="composer-popover permission-popover"
                            role="menu"
                          >
                            <span className="permission-popover-header">
                              <span>应如何批准 LUMORA 操作？</span>
                              <button
                                type="button"
                                onClick={() =>
                                  notify("权限模式说明已在设计文档中同步")
                                }
                              >
                                了解更多
                              </button>
                            </span>
                            {permissionModeOptions.map((option) => (
                              <button
                                className={[
                                  option.value === permissionMode
                                    ? "is-selected"
                                    : "",
                                  option.value === "full_access"
                                    ? "is-dangerous"
                                    : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                type="button"
                                role="menuitemradio"
                                aria-checked={option.value === permissionMode}
                                key={option.value}
                                onClick={() => {
                                  setPermissionMode(option.value);
                                  savePermissionMode(option.value);
                                  setComposerMenu(null);
                                }}
                              >
                                <span className="permission-option-icon">
                                  <PermissionModeIcon
                                    mode={option.value}
                                    size={18}
                                  />
                                </span>
                                <span className="permission-option-copy">
                                  <strong>{option.label}</strong>
                                  <small>{option.description}</small>
                                </span>
                                {option.value === permissionMode && (
                                  <Check
                                    className="permission-option-check"
                                    size={17}
                                    strokeWidth={1.8}
                                  />
                                )}
                              </button>
                            ))}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="composer-controls">
                      <span className="context-usage-control">
                        <span
                          className="context-usage-ring"
                          role="meter"
                          aria-describedby="context-usage-tooltip"
                          aria-label="上下文已用"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={contextPercent}
                          tabIndex={0}
                        >
                          <svg
                            aria-hidden="true"
                            preserveAspectRatio="xMidYMid meet"
                            viewBox="0 0 20 20"
                          >
                            <circle
                              className="context-usage-track"
                              cx="10"
                              cy="10"
                              r="8"
                            />
                            <circle
                              className="context-usage-value"
                              cx="10"
                              cy="10"
                              pathLength="100"
                              r="8"
                              strokeDasharray={`${contextPercent} 100`}
                            />
                          </svg>
                        </span>
                        <span
                          className="context-usage-tooltip"
                          id="context-usage-tooltip"
                          role="tooltip"
                        >
                          <span>背景信息窗口：</span>
                          <strong>
                            {reportedTotalTokens === undefined ? "约 " : ""}
                            {contextPercent}% 已用
                          </strong>
                          <b>
                            已用{reportedTotalTokens === undefined ? "约 " : " "}
                            {formatTokenCount(contextTokens)} 标记，共{" "}
                            {formatTokenCount(contextLimit)}
                          </b>
                        </span>
                      </span>
                      <span className="composer-menu-anchor model-anchor">
                        <button
                          className="composer-choice-button model-choice-button"
                          type="button"
                          aria-label="选择模型"
                          aria-expanded={composerMenu === "model"}
                          onClick={() =>
                            setComposerMenu((open) =>
                              open === "model" ? null : "model",
                            )
                          }
                        >
                          <span>
                            {selectedModel
                              ? modelDisplayName(selectedModel)
                              : "模型"}
                          </span>
                        </button>
                        {composerMenu === "model" && (
                          <span
                            className="composer-popover model-picker-popover align-right"
                            role="menu"
                          >
                            <b>选择模型</b>
                            {modelOptions.map((model) => (
                              <button
                                className={
                                  model === selectedModel
                                    ? "is-selected"
                                    : undefined
                                }
                                type="button"
                                role="menuitemradio"
                                aria-checked={model === selectedModel}
                                key={model}
                                onClick={() => {
                                  setSelectedModel(model);
                                  setComposerMenu(null);
                                }}
                              >
                                <span>{modelDisplayName(model)}</span>
                                {model === selectedModel && (
                                  <Check
                                    className="composer-option-check"
                                    size={16}
                                    strokeWidth={1.8}
                                  />
                                )}
                              </button>
                            ))}
                          </span>
                        )}
                      </span>
                      <span className="composer-menu-anchor reasoning-anchor">
                          <button
                            className="composer-choice-button reasoning-choice-button"
                            type="button"
                            aria-label="选择推理强度"
                            aria-expanded={composerMenu === "reasoning"}
                            onClick={() =>
                              setComposerMenu((open) =>
                                open === "reasoning" ? null : "reasoning",
                              )
                            }
                          >
                            <span>{reasoningEffortLabel(reasoningEffort)}</span>
                            <ChevronDown size={14} strokeWidth={1.7} />
                          </button>
                          {composerMenu === "reasoning" && (
                            <span
                              className="composer-popover reasoning-popover align-right"
                              role="menu"
                            >
                              <b>推理强度</b>
                              {reasoningEffortOptions.map((option) => (
                                <button
                                  className={
                                    option.value === reasoningEffort
                                      ? "is-selected"
                                      : undefined
                                  }
                                  type="button"
                                  role="menuitemradio"
                                  aria-checked={
                                    option.value === reasoningEffort
                                  }
                                  key={option.value}
                                  onClick={() => {
                                    setReasoningEffort(option.value);
                                    setComposerMenu(null);
                                  }}
                                >
                                  <span className="composer-option-copy">
                                    <strong>{option.label}</strong>
                                    <small>{option.description}</small>
                                  </span>
                                  {option.value === reasoningEffort && (
                                    <Check
                                      className="composer-option-check"
                                      size={16}
                                      strokeWidth={1.8}
                                    />
                                  )}
                                </button>
                              ))}
                            </span>
                          )}
                      </span>
                      <button
                        className="composer-icon-button composer-mic-button"
                        type="button"
                        aria-label="语音输入"
                        onClick={() => notify("语音输入接口待接入")}
                      >
                        <Mic size={18} strokeWidth={1.8} />
                      </button>
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
                  {composerMenu === "context" && (
                    <span
                      className="composer-popover context-picker-popover"
                      role="menu"
                    >
                      <b>添加</b>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openLocalContext(false)}
                      >
                        <File size={17} />
                        <span>
                          <strong>文件</strong>
                          <small>选择本地文件作为上下文</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openLocalContext(true)}
                      >
                        <Folder size={17} />
                        <span>
                          <strong>文件夹</strong>
                          <small>选择一个本地目录</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setComposerMenu(null);
                          notify("持续目标接口待接入");
                        }}
                      >
                        <Target size={17} />
                        <span>
                          <strong>目标</strong>
                          <small>设置要持续追求的目标</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setComposerMenu(null);
                          notify("已保持当前工作模式");
                        }}
                      >
                        <Lightbulb size={17} />
                        <span>
                          <strong>计划模式</strong>
                          <small>先规划，再开始执行</small>
                        </span>
                      </button>
                      <span className="context-picker-section">其他上下文</span>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setComposerMenu(null);
                          notify("网页上下文接口待接入");
                        }}
                      >
                        <Globe2 size={17} />
                        <span>
                          <strong>网页链接</strong>
                          <small>添加网页内容作为参考</small>
                        </span>
                      </button>
                    </span>
                  )}
                </form>
              </div>
            </div>
          </div>
        </section>

        <ToolApprovalDialog store={store} />

        {reviewOpen && (
          <DiffReviewPane
            changes={fileChanges}
            width={reviewWidth}
            selectedChangeId={selectedChangeId}
            onClose={() => setReviewOpen(false)}
            onSelectChange={setSelectedChangeId}
            onWidthChange={setReviewWidth}
          />
        )}
      </div>
    </main>
  );
}

function fileChangesFromMessages(messages: ChatMessage[]): FileChange[] {
  return messages.flatMap((message) =>
    (message.workLog ?? []).flatMap((item) => {
      const change = fileChangeFromWorkLog(item);
      return change ? [change] : [];
    }),
  );
}

function fileChangeFromWorkLog(item: WorkLogItem): FileChange | undefined {
  if (item.toolName !== "apply_patch" && item.toolName !== "write_file") {
    return undefined;
  }
  const path = stringValue(item.arguments?.path);
  if (!path) return undefined;
  const unavailableMarker = "[内容未持久化]";
  const oldText =
    item.toolName === "apply_patch"
      ? stringValue(item.arguments?.oldText)
      : "";
  const newText =
    item.toolName === "apply_patch"
      ? stringValue(item.arguments?.newText)
      : stringValue(item.arguments?.content);
  return {
    changeId: item.itemId,
    path,
    oldText,
    newText,
    previewAvailable:
      newText !== unavailableMarker && oldText !== unavailableMarker,
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
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

const permissionModeOptions: Array<{
  value: PermissionMode;
  label: string;
  description: string;
}> = [
  {
    value: "request_approval",
    label: "请求批准",
    description: "编辑外部文件和使用互联网时始终询问",
  },
  {
    value: "auto_approve",
    label: "替我审批",
    description: "仅对检测到的风险操作请求批准",
  },
  {
    value: "full_access",
    label: "完全访问权限",
    description: "允许工作区内操作；外部路径与危险命令仍受保护",
  },
];

const reasoningEffortOptions: Array<{
  value: ComposerReasoningEffort;
  label: string;
  description: string;
}> = [
  { value: "none", label: "关闭", description: "不启用思考模式" },
  { value: "low", label: "低", description: "响应更快" },
  { value: "high", label: "高", description: "更深入地分析" },
  { value: "max", label: "Max", description: "使用最大推理强度" },
];

function permissionModeLabel(mode: PermissionMode): string {
  return (
    permissionModeOptions.find((option) => option.value === mode)?.label ??
    "请求批准"
  );
}

function PermissionModeIcon({
  mode,
  size,
}: {
  mode: PermissionMode;
  size: number;
}) {
  if (mode === "request_approval") {
    return <Hand aria-hidden="true" size={size} strokeWidth={1.65} />;
  }
  if (mode === "full_access") {
    return <ShieldAlert aria-hidden="true" size={size} strokeWidth={1.65} />;
  }
  return (
    <svg
      aria-hidden="true"
      className="permission-auto-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2.7 20 6v5.3c0 5.2-3.25 8.45-8 10-4.75-1.55-8-4.8-8-10V6l8-3.3Z" />
      <path d="m8.5 10.1 2 1.9-2 1.9" />
      <path d="M13 14h2.7" />
    </svg>
  );
}

function reasoningEffortLabel(effort: ComposerReasoningEffort): string {
  return (
    reasoningEffortOptions.find((option) => option.value === effort)?.label ??
    "高"
  );
}

function formatTokenCount(tokens: number): string {
  if (tokens < 1_000) {
    return tokens.toLocaleString();
  }
  const compact = tokens / 1_000;
  return `${compact >= 10 ? Math.round(compact) : compact.toFixed(1).replace(/\.0$/, "")}k`;
}

function estimateConversationTokens(messages: ChatMessage[]): number {
  return messages.reduce(
    (total, message) => total + 6 + estimateTextTokens(message.content),
    0,
  );
}

function estimateTextTokens(content: string): number {
  let asciiCharacters = 0;
  let nonAsciiCharacters = 0;
  for (const character of content) {
    if (character.codePointAt(0)! <= 0x7f) {
      asciiCharacters += 1;
    } else {
      nonAsciiCharacters += 1;
    }
  }
  return nonAsciiCharacters + Math.ceil(asciiCharacters / 4);
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

function formatMessageDateTime(createdAt?: string): string {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

const PERMISSION_MODE_STORAGE_KEY = "lumora.permission-mode";

function loadPermissionMode(): PermissionMode {
  const value = window.localStorage.getItem(PERMISSION_MODE_STORAGE_KEY);
  if (
    value === "full_access" ||
    value === "auto_approve" ||
    value === "request_approval"
  ) {
    return value;
  }
  return "request_approval";
}

function savePermissionMode(mode: PermissionMode): void {
  window.localStorage.setItem(PERMISSION_MODE_STORAGE_KEY, mode);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "重新生成回答失败";
}
