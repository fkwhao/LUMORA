import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  type AppendMessage,
  type ThreadMessage,
  type TextMessagePartProps,
  fromThreadMessageLike,
  useAuiState,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  File,
  FileDiff,
  Folder,
  FolderClosed,
  Hand,
  LoaderCircle,
  Minimize2,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldAlert,
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
  ArtifactChunk,
} from "../../../shared/model-contract";
import type { TaskEvent } from "../../../shared/task-contract";
import { Thread } from "../../components/assistant-ui/thread";
import { Button, buttonVariants } from "../../components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "../../components/ui/popover";
import { MarkdownMessage } from "../../components/MarkdownMessage";
import { ApprovalDock } from "./ApprovalDock";
import { ToolApprovalDialog } from "./ToolApprovalDialog";
import { AgentRunSummary } from "./AgentRunSummary";
import { DiffReviewPane, type FileChange } from "./DiffReviewPane";
import type { TaskStore } from "./task-store";

interface TaskPageProps {
  store: TaskStore;
  modelApi?: LumoraModelApi;
  composerMotion?: "from-center";
  notify(message: string, tone?: "info" | "success"): void;
}

type ComposerReasoningEffort = ReasoningEffort;
const EMPTY_TASK_EVENTS: TaskEvent[] = [];

export const TaskPage = memo(function TaskPage({
  store,
  modelApi,
  composerMotion,
  notify,
}: TaskPageProps) {
  const task = useStore(store, (state) => state.activeTask);
  const messages = useStore(store, (state) => state.messages);
  const isLoadingHistory = useStore(
    store,
    (state) => state.isLoadingHistory,
  );
  const isHydratingHistory = useStore(
    store,
    (state) => state.isHydratingHistory,
  );
  const historyHydrationProgress = useStore(
    store,
    (state) => state.historyHydrationProgress,
  );
  const isChatting = useStore(store, (state) => state.isChatting);
  const isCompacting = useStore(store, (state) => state.isCompacting);
  const chatWasStopped = useStore(store, (state) => state.chatWasStopped);
  const chatError = useStore(store, (state) => state.chatError);
  const chatStartedAt = useStore(store, (state) => state.chatStartedAt);
  const taskEvents = useStore(store, (state) => state.taskEvents);
  const lastChatDurationMs = useStore(
    store,
    (state) => state.lastChatDurationMs,
  );
  const [composerText, setComposerText] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewWidth, setReviewWidth] = useState(460);
  const [selectedChangeId, setSelectedChangeId] = useState<string>();
  const [modelSettings, setModelSettings] = useState<ModelSettings>();
  const [selectedModel, setSelectedModel] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [reasoningEffort, setReasoningEffort] =
    useState<ComposerReasoningEffort>("");
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(
    loadPermissionMode,
  );
  const [composerMenu, setComposerMenu] = useState<
    "context" | "command" | "permission" | "model" | "reasoning" | null
  >(null);
  const [modelPickerSection, setModelPickerSection] = useState<
    "model" | "reasoning" | null
  >(null);
  const [artifact, setArtifact] = useState<ArtifactChunk>();
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [artifactError, setArtifactError] = useState<string>();
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const conversationScrollRef = useRef<HTMLDivElement>(null);
  const conversationContentRef = useRef<HTMLDivElement>(null);
  const followUpInputRef = useRef<HTMLTextAreaElement>(null);
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
  const stopOpeningScrollRef = useRef<() => void>(() => undefined);
  const openChangeReview = useCallback((item: WorkLogItem) => {
    setSelectedChangeId(item.itemId);
    setReviewOpen(true);
  }, []);

  useEffect(() => {
    if (!modelApi) {
      return;
    }
    let cancelled = false;
    void modelApi
      .getSettings()
      .then((settings) => {
        if (cancelled) return;
        const localPreference = task?.taskId
          ? loadTaskComposerPreference(task.taskId)
          : undefined;
        const configuredModels = new Set([
          settings.model,
          ...settings.models.map((model) => model.modelId),
        ]);
        const nextModel =
          task?.selectedModel && configuredModels.has(task.selectedModel)
            ? task.selectedModel
            : localPreference?.model && configuredModels.has(localPreference.model)
              ? localPreference.model
            : settings.model;
        setModelSettings(settings);
        setSelectedModel(nextModel);
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
    return () => {
      cancelled = true;
    };
  }, [modelApi, task?.taskId]);

  const selectedModelConfiguration = modelSettings?.models.find(
    (model) => model.modelId === selectedModel,
  );
  const reasoningEffortOptions = useMemo(
    () =>
      (selectedModelConfiguration?.reasoningEfforts ?? []).map((value) => ({
        value,
        ...reasoningEffortMetadata(value),
      })),
    [selectedModelConfiguration],
  );

  useEffect(() => {
    const values = reasoningEffortOptions.map((option) => option.value);
    if (values.length === 0) {
      setReasoningEffort("");
      setComposerMenu((menu) => (menu === "reasoning" ? null : menu));
      return;
    }
    const databaseEffort =
      task?.selectedModel === selectedModel
        ? task.selectedReasoningEffort
        : undefined;
    const rememberedEffort =
      databaseEffort ||
      (task?.taskId
        ? loadTaskComposerPreference(task.taskId)?.reasoningByModel?.[
            selectedModel
          ]
        : undefined);
    if (rememberedEffort && values.includes(rememberedEffort)) {
      if (reasoningEffort !== rememberedEffort) {
        setReasoningEffort(rememberedEffort);
      }
      return;
    }
    if (!values.includes(reasoningEffort)) {
      setReasoningEffort(values[0] ?? "");
    }
  }, [reasoningEffort, reasoningEffortOptions, selectedModel, task?.taskId]);

  const selectModel = useCallback(
    (model: string) => {
      const efforts =
        modelSettings?.models.find((item) => item.modelId === model)
          ?.reasoningEfforts ?? [];
      const rememberedEffort = task?.taskId
        ? loadTaskComposerPreference(task.taskId)?.reasoningByModel?.[model]
        : undefined;
      const nextEffort =
        rememberedEffort && efforts.includes(rememberedEffort)
          ? rememberedEffort
          : (efforts[0] ?? "");
      setSelectedModel(model);
      setReasoningEffort(nextEffort);
      if (task?.taskId) {
        saveTaskComposerModel(task.taskId, model);
        if (nextEffort) {
          saveTaskComposerReasoning(task.taskId, model, nextEffort);
        }
      }
      void store
        .getState()
        .updateComposerPreferences(model, nextEffort)
        .catch(() => notify("会话模型偏好保存失败", "info"));
    },
    [modelSettings?.models, notify, store, task?.taskId],
  );

  const selectReasoningEffort = useCallback(
    (effort: ComposerReasoningEffort) => {
      setReasoningEffort(effort);
      if (task?.taskId && selectedModel) {
        saveTaskComposerReasoning(task.taskId, selectedModel, effort);
      }
      if (selectedModel) {
        void store
          .getState()
          .updateComposerPreferences(selectedModel, effort)
          .catch(() => notify("会话模型偏好保存失败", "info"));
      }
    },
    [notify, selectedModel, store, task?.taskId],
  );

  useEffect(() => {
    if (!composerMenu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        !target.closest(".composer-menu-anchor") &&
        !target.closest(".composer-popover") &&
        !target.closest('[data-slot="popover-content"]')
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
    if (!task || isLoadingHistory) {
      return;
    }
    const latestQuestion = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    const openedContentKey = `${task.taskId}:${
      latestQuestion?.messageId ??
      latestQuestion?.createdAt ??
      latestQuestion?.content ??
      task.goal
    }`;
    if (lastOpenedTaskRef.current === openedContentKey) return;
    lastOpenedTaskRef.current = openedContentKey;
    let cancelled = false;
    let frame: number | undefined;
    const timers: number[] = [];
    const scrollToLatestQuestion = () => {
      if (cancelled) return;
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = undefined;
        if (cancelled) return;
        const scroll = conversationScrollRef.current;
        if (!scroll) return;
        const questions = scroll.querySelectorAll("[data-question-index]");
        if (questions.length > 0) {
          scrollToQuestion(questions.length - 1, "auto");
        } else {
          scroll.scrollTop = scroll.scrollHeight;
        }
      });
    };
    scrollToLatestQuestion();
    timers.push(
      window.setTimeout(scrollToLatestQuestion, 80),
      window.setTimeout(scrollToLatestQuestion, 240),
    );
    const content = conversationContentRef.current;
    const observer =
      content && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(scrollToLatestQuestion)
        : undefined;
    if (content) observer?.observe(content);
    const stop = () => {
      if (cancelled) return;
      cancelled = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
      observer?.disconnect();
      if (stopOpeningScrollRef.current === stop) {
        stopOpeningScrollRef.current = () => undefined;
      }
    };
    stopOpeningScrollRef.current();
    stopOpeningScrollRef.current = stop;
    timers.push(window.setTimeout(stop, 520));
    return stop;
  }, [isLoadingHistory, messages, task]);

  useEffect(
    () => () => {
      if (scrollStateFrameRef.current !== null) {
        cancelAnimationFrame(scrollStateFrameRef.current);
      }
    },
    [],
  );

  const displayMessages: ChatMessage[] = useMemo(
    () =>
      task && messages.length === 0
        ? [
            {
              role: "user",
              content: task.goal,
              createdAt: task.createdAt,
            },
          ]
        : messages,
    [messages, task],
  );

  const messageRepository = useMemo(() => {
    const persisted = displayMessages.flatMap(
      (message) => message.threadMessages ?? [],
    );
    const byId = new Map<string, ChatMessage>();
    persisted.forEach((message) => {
      if (message.messageId) byId.set(message.messageId, message);
    });
    displayMessages.forEach((message) => {
      if (message.messageId) byId.set(message.messageId, message);
    });

    const repositorySource = [...byId.values()].sort(
      (left, right) => (left.sequence ?? 0) - (right.sequence ?? 0),
    );
    const entries = repositorySource.map((message, index) => {
      const id = message.messageId ?? runtimeMessageId(index);
      return {
        parentId: message.parentMessageId ?? null,
        message: fromThreadMessageLike(
          {
            id,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt
              ? new Date(message.createdAt)
              : undefined,
          },
          id,
          { type: "complete", reason: "unknown" },
        ),
      };
    });

    let activeParentId: string | null = null;
    displayMessages.forEach((message, index) => {
      const id = message.messageId ?? runtimeMessageId(index);
      if (!byId.has(id)) {
        entries.push({
          parentId: message.parentMessageId ?? activeParentId,
          message: fromThreadMessageLike(
            {
              id,
              role: message.role,
              content: message.content,
              createdAt: message.createdAt
                ? new Date(message.createdAt)
                : undefined,
            },
            id,
            isChatting && index === displayMessages.length - 1
              ? { type: "running" }
              : { type: "complete", reason: "unknown" },
          ),
        });
      }
      activeParentId = id;
    });

    const lastIndex = displayMessages.length - 1;
    const headId =
      lastIndex < 0
        ? null
        : displayMessages[lastIndex]?.messageId ?? runtimeMessageId(lastIndex);
    return { messages: entries, headId };
  }, [displayMessages, isChatting]);

  const handleNewMessage = useCallback(
    async (message: AppendMessage) => {
      const content = textFromAppendMessage(message).trim();
      if (!content) return;
      setComposerText("");
      setComposerMenu(null);
      if (content === "/compact") {
        await store.getState().compactContext(selectedModel || undefined);
        return;
      }
      await store.getState().sendMessage(content, {
        model: selectedModel || undefined,
        reasoningEffort: reasoningEffort || undefined,
        permissionMode,
      });
    },
    [permissionMode, reasoningEffort, selectedModel, store],
  );

  const handleEditMessage = useCallback(
    async (message: AppendMessage) => {
      const sourceIndex = message.sourceId
        ? displayMessages.findIndex(
            (candidate, index) =>
              candidate.messageId === message.sourceId ||
              runtimeMessageId(index) === message.sourceId,
          )
        : -1;
      const parentIndex =
        message.parentId === null
          ? -1
          : displayMessages.findIndex(
              (candidate, index) =>
                candidate.messageId === message.parentId ||
                runtimeMessageId(index) === message.parentId,
            );
      const target = displayMessages[
        sourceIndex >= 0 ? sourceIndex : parentIndex + 1
      ];
      const content = textFromAppendMessage(message).trim();
      if (!target?.messageId || target.role !== "user" || !content) {
        notify("无法定位要编辑的消息，请刷新任务后重试", "info");
        return;
      }
      try {
        await store.getState().regenerateMessage(target.messageId, content, {
          model: selectedModel || undefined,
          reasoningEffort: reasoningEffort || undefined,
          permissionMode,
        });
      } catch (error) {
        notify(
          error instanceof Error ? error.message : "编辑后重新发送失败",
          "info",
        );
      }
    },
    [
      displayMessages,
      permissionMode,
      reasoningEffort,
      selectedModel,
      store,
      notify,
    ],
  );

  const handleReloadMessage = useCallback(
    async (parentId: string | null) => {
      const target = parentId
        ? displayMessages.find(
            (message, index) =>
              message.messageId === parentId ||
              runtimeMessageId(index) === parentId,
          )
        : displayMessages.find((message) => message.role === "user");
      if (!target?.messageId || target.role !== "user") {
        notify("无法定位这条回复对应的问题，请刷新任务后重试", "info");
        return;
      }
      try {
        await store
          .getState()
          .regenerateMessage(target.messageId, target.content, {
            model: selectedModel || undefined,
            reasoningEffort: reasoningEffort || undefined,
            permissionMode,
          });
      } catch (error) {
        notify(
          error instanceof Error ? error.message : "重新生成回复失败",
          "info",
        );
      }
    },
    [
      displayMessages,
      permissionMode,
      reasoningEffort,
      selectedModel,
      store,
      notify,
    ],
  );

  const runtime = useExternalStoreRuntime<ThreadMessage>({
    messageRepository,
    setMessages: () => undefined,
    unstable_onBranchChange: ({ headId }) => {
      if (headId && !headId.startsWith("lumora-message-")) {
        void store
          .getState()
          .switchMessageBranch(headId)
          .catch((error: unknown) =>
            notify(
              error instanceof Error ? error.message : "切换历史版本失败",
              "info",
            ),
          );
      }
    },
    isRunning: isChatting || isCompacting,
    isSendDisabled: isCompacting,
    onNew: handleNewMessage,
    onEdit: handleEditMessage,
    onReload: handleReloadMessage,
    onCancel: async () => store.getState().stopChat(),
    adapters: {
      feedback: {
        submit: ({ type }) =>
          notify(type === "positive" ? "已喜欢这条回复" : "已记录反馈", "success"),
      },
    },
    unstable_capabilities: { copy: true },
  });

  const showLegacyThread = Boolean(task && task.taskId.length < 0);
  const fileChanges = fileChangesFromMessages(displayMessages);
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
    stopOpeningScrollRef.current();
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

  const openArtifact = useCallback(async (artifactId: string) => {
    if (!task || !modelApi) return;
    setArtifact(undefined);
    setArtifactError(undefined);
    setArtifactLoading(true);
    try {
      setArtifact(await modelApi.readArtifact(task.taskId, artifactId));
    } catch (error) {
      setArtifactError(error instanceof Error ? error.message : "Artifact 读取失败");
    } finally {
      setArtifactLoading(false);
    }
  }, [modelApi, task]);

  async function loadMoreArtifact() {
    if (!task || !modelApi || !artifact?.hasMore || artifact.nextOffset === undefined) return;
    setArtifactLoading(true);
    try {
      const chunk = await modelApi.readArtifact(
        task.taskId,
        artifact.artifactId,
        artifact.nextOffset,
      );
      setArtifact({ ...chunk, content: artifact.content + chunk.content });
    } catch (error) {
      setArtifactError(error instanceof Error ? error.message : "Artifact 读取失败");
    } finally {
      setArtifactLoading(false);
    }
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
        ...(modelSettings?.models.map((model) => model.modelId) ?? []),
        ...messages.map((message) => message.model ?? ""),
      ].filter(Boolean),
    ),
  ];
  const contextLimit = modelSettings?.models.find(
    (model) => model.modelId === selectedModel,
  )?.contextWindow ?? modelSettings?.contextWindow ?? 128_000;
  const reportedContextTokens = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" &&
        (message.activeContextTokens ?? 0) > 0,
    )?.activeContextTokens;
  const estimatedTokens = estimateConversationTokens(messages);
  const contextTokens = reportedContextTokens ?? estimatedTokens;
  const contextPercent = Math.min(
    100,
    Math.round((contextTokens / contextLimit) * 100),
  );

  const AssistantMessageRunSummary = useCallback(function AssistantMessageRunSummary() {
    const index = useAuiState((state) => state.message.index);
    const originalMessage = displayMessages[index];
    const isCurrentAssistant =
      isChatting &&
      (originalMessage === undefined ||
        index === displayMessages.length - 1);
    const isThinkingStage =
      isCurrentAssistant &&
      !originalMessage?.content.trim() &&
      (originalMessage?.workLog?.length ?? 0) === 0 &&
      taskEvents.length === 0;

    if (!originalMessage || isThinkingStage) return null;

    return (
      <AgentRunSummary
            startedAt={chatStartedAt}
            durationMs={
              originalMessage.durationMs ||
              (index === displayMessages.length - 1
                ? lastChatDurationMs
                : undefined)
            }
            events={
              index === displayMessages.length - 1
                ? taskEvents
                : EMPTY_TASK_EVENTS
            }
            workLog={originalMessage.workLog}
            running={
              (isChatting || isCompacting) &&
              index === displayMessages.length - 1
            }
            stopped={
              chatWasStopped &&
              index === displayMessages.length - 1
            }
            onReviewChange={openChangeReview}
            onOpenArtifact={openArtifact}
      />
    );
  }, [
    chatStartedAt,
    chatWasStopped,
    displayMessages,
    isChatting,
    isCompacting,
    lastChatDurationMs,
    openArtifact,
    openChangeReview,
    taskEvents,
  ]);

  const AssistantProcessingIndicator = useCallback(function AssistantProcessingIndicator() {
    const index = useAuiState((state) => state.message.index);
    const originalMessage = displayMessages[index];
    const isCurrentAssistant =
      isChatting &&
      (originalMessage === undefined || index === displayMessages.length - 1);
    const runSummaryIsVisible =
      (originalMessage?.workLog?.length ?? 0) > 0 ||
      (index === displayMessages.length - 1 && taskEvents.length > 0);
    if (isCurrentAssistant && runSummaryIsVisible) return null;

    if (isCurrentAssistant) {
      return (
        <span
          className="lumora-processing-indicator"
          data-slot="aui_assistant-message-indicator"
          role="status"
        >
          <LoaderCircle
            aria-hidden="true"
            className="lumora-processing-loader"
            size={13}
          />
          <span className="lumora-processing-shimmer">正在处理</span>
        </span>
      );
    }
    return null;
  }, [displayMessages, isChatting, taskEvents]);

  if (!task) {
    return null;
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <main
        className={`task-layout${composerMotion ? ` composer-enter-${composerMotion}` : ""}`}
      >
      <header className="task-header">
        <div className="task-title-row">
          <span className="task-project-folder" aria-hidden="true">
            <FolderClosed size={18} strokeWidth={1.65} />
          </span>
          <div className="task-title-copy">
            <h1>{task.goal}</h1>
          </div>
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

        {showLegacyThread && (
          <>
        <ThreadPrimitive.Root className="conversation-pane aui-thread-root">
          <ThreadPrimitive.Viewport
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

              <ThreadPrimitive.Messages>
                {({ message: runtimeMessage }) => {
                  const index = runtimeMessage.index;
                  const originalMessage = displayMessages[index];
                  const questionIndex =
                    originalMessage?.role === "user"
                      ? questionEntries.findIndex(
                          (entry) => entry.messageIndex === index,
                        )
                      : undefined;
                  const isCurrentAssistant =
                    runtimeMessage.role === "assistant" &&
                    isChatting &&
                    (originalMessage === undefined ||
                      index === displayMessages.length - 1);
                  const isThinkingStage =
                    isCurrentAssistant &&
                    !originalMessage?.content.trim() &&
                    (originalMessage?.workLog?.length ?? 0) === 0 &&
                    taskEvents.length === 0;

                  if (runtimeMessage.composer.isEditing) {
                    return (
                      <ComposerPrimitive.Root className="user-message user-message-edit aui-edit-composer">
                        <ComposerPrimitive.Input
                          autoFocus
                          aria-label="编辑消息"
                          submitMode="enter"
                        />
                        <div className="user-message-edit-actions">
                          <ComposerPrimitive.Cancel asChild>
                            <button type="button">
                              <X size={14} />
                              取消
                            </button>
                          </ComposerPrimitive.Cancel>
                          <ComposerPrimitive.Send asChild>
                            <button className="confirm" type="submit">
                              <ArrowUp size={14} />
                              重新发送
                            </button>
                          </ComposerPrimitive.Send>
                        </div>
                      </ComposerPrimitive.Root>
                    );
                  }

                  if (runtimeMessage.role === "user") {
                    return (
                      <MessagePrimitive.Root
                        className="user-message-group aui-user-message-root"
                        data-question-index={questionIndex}
                      >
                        <div className="user-message">
                          <MessagePrimitive.Parts
                            components={{ Text: PlainTextMessagePart }}
                          />
                        </div>
                        <div className="user-message-meta">
                          <time dateTime={originalMessage?.createdAt}>
                            {formatMessageTime(originalMessage?.createdAt)}
                          </time>
                          <ActionBarPrimitive.Root
                            className="user-message-actions"
                            autohide="not-last"
                          >
                            <ActionBarPrimitive.Copy asChild>
                              <button type="button" aria-label="复制消息" title="复制">
                                <Copy size={14} />
                              </button>
                            </ActionBarPrimitive.Copy>
                            <ActionBarPrimitive.Edit asChild>
                              <button
                                type="button"
                                aria-label="编辑并重新发送消息"
                                title="编辑并重新发送"
                              >
                                <Pencil size={14} />
                              </button>
                            </ActionBarPrimitive.Edit>
                          </ActionBarPrimitive.Root>
                        </div>
                      </MessagePrimitive.Root>
                    );
                  }

                  return (
                    <>
                      {originalMessage && !isThinkingStage && (
                        <AgentRunSummary
                          startedAt={chatStartedAt}
                          durationMs={
                            originalMessage.durationMs ||
                            (index === displayMessages.length - 1
                              ? lastChatDurationMs
                              : undefined)
                          }
                          events={
                            index === displayMessages.length - 1
                              ? taskEvents
                              : EMPTY_TASK_EVENTS
                          }
                          workLog={originalMessage.workLog}
                          running={
                            (isChatting || isCompacting) &&
                            index === displayMessages.length - 1
                          }
                          stopped={
                            chatWasStopped &&
                            index === displayMessages.length - 1
                          }
                          onReviewChange={openChangeReview}
                          onOpenArtifact={openArtifact}
                        />
                      )}
                      <MessagePrimitive.Root className="assistant-message-group aui-assistant-message-root">
                        {isThinkingStage ? (
                          <div className="thinking-stage" role="status">
                            <span>正在思考</span>
                          </div>
                        ) : (
                          <div className="assistant-message">
                            <MessagePrimitive.Parts
                              components={{ Text: AssistantTextMessagePart }}
                            />
                            {isCurrentAssistant && (
                              <span className="stream-cursor" aria-hidden="true" />
                            )}
                          </div>
                        )}
                        {!isCurrentAssistant && !isThinkingStage && (
                          <div className="assistant-message-meta">
                            <ActionBarPrimitive.Root
                              className="assistant-message-actions"
                              autohide="not-last"
                            >
                              <ActionBarPrimitive.Copy asChild>
                                <button type="button" aria-label="复制回复" title="复制">
                                  <Copy size={14} />
                                </button>
                              </ActionBarPrimitive.Copy>
                              <ActionBarPrimitive.FeedbackPositive asChild>
                                <button type="button" aria-label="喜欢这条回复" title="喜欢">
                                  <ThumbsUp size={14} />
                                </button>
                              </ActionBarPrimitive.FeedbackPositive>
                              <ActionBarPrimitive.FeedbackNegative asChild>
                                <button type="button" aria-label="不喜欢这条回复" title="不喜欢">
                                  <ThumbsDown size={14} />
                                </button>
                              </ActionBarPrimitive.FeedbackNegative>
                              <ActionBarPrimitive.Reload asChild>
                                <button type="button" aria-label="重新生成回复" title="重新生成">
                                  <LoaderCircle size={14} />
                                </button>
                              </ActionBarPrimitive.Reload>
                            </ActionBarPrimitive.Root>
                            <time dateTime={originalMessage?.createdAt}>
                              {formatMessageDateTime(originalMessage?.createdAt)}
                            </time>
                          </div>
                        )}
                      </MessagePrimitive.Root>
                    </>
                  );
                }}
              </ThreadPrimitive.Messages>

              {chatError && <div className="task-error-banner">{chatError}</div>}
            </div>

            <ThreadPrimitive.ViewportFooter
              className="conversation-footer"
              ref={conversationFooterRef}
            >
              <div className="conversation-footer-inner">
                {task.approval && <ApprovalDock store={store} />}
                <div className="conversation-composer-wrap">
                  {showScrollToBottom && (
                    <ThreadPrimitive.ScrollToBottom asChild>
                      <button
                        className={
                          "scroll-to-bottom" +
                          (isChatting ? " is-processing" : "")
                        }
                        type="button"
                        aria-label="返回对话底部"
                        title="返回底部"
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
                    </ThreadPrimitive.ScrollToBottom>
                  )}

                  <ComposerPrimitive.Root
                    className="follow-up-composer aui-composer-root"
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
                          notify("已选择 " + count + " 个本地资源", "success");
                        }
                        event.target.value = "";
                      }}
                    />
                    <ComposerPrimitive.Input
                      ref={followUpInputRef}
                      aria-label="继续任务"
                      placeholder="继续任务…"
                      submitMode="enter"
                      onChange={(event) => {
                        const value = event.target.value;
                        setComposerText(value);
                        if (value.startsWith("/")) setComposerMenu("command");
                        else if (composerMenu === "command") setComposerMenu(null);
                      }}
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
                            className={
                              "composer-permission-button" +
                              (permissionMode === "full_access"
                                ? " is-dangerous"
                                : "")
                            }
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
                                strokeDasharray={contextPercent + " 100"}
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
                              {reportedContextTokens === undefined ? "约 " : ""}
                              {contextPercent}% 已用
                            </strong>
                            <b>
                              已用
                              {reportedContextTokens === undefined ? "约 " : " "}
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
                                    selectModel(model);
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

                        {reasoningEffortOptions.length > 0 && (
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
                                      selectReasoningEffort(option.value);
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
                        )}

                        {isChatting ? (
                          <ComposerPrimitive.Cancel asChild>
                            <button
                              className="send-follow-up is-stopping"
                              type="button"
                              aria-label="停止生成"
                            >
                              <span className="stop-glyph" aria-hidden="true" />
                            </button>
                          </ComposerPrimitive.Cancel>
                        ) : (
                          <ComposerPrimitive.Send asChild>
                            <button
                              className="send-follow-up"
                              type="submit"
                              aria-label="发送消息"
                            >
                              <ArrowUp size={16} strokeWidth={2} />
                            </button>
                          </ComposerPrimitive.Send>
                        )}
                      </div>
                    </div>

                    {composerMenu === "context" && (
                      <span
                        className="composer-popover context-picker-popover"
                        role="menu"
                      >
                        <button
                          className="context-compact-command"
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            runtime.thread.composer.setText("/compact");
                            setComposerText("/compact");
                            setComposerMenu("command");
                            requestAnimationFrame(() =>
                              followUpInputRef.current?.focus(),
                            );
                          }}
                        >
                          <Minimize2 size={17} />
                          <span>
                            <strong>压缩上下文</strong>
                            <small>
                              摘要较早消息（已使用 {contextPercent}%）
                            </small>
                          </span>
                        </button>
                        <span className="context-picker-section">添加</span>
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
                      </span>
                    )}

                    {composerMenu === "command" &&
                      composerText.startsWith("/") && (
                        <span
                          className="composer-popover command-picker-popover"
                          role="menu"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              runtime.thread.composer.setText("/compact");
                              setComposerText("/compact");
                              setComposerMenu(null);
                              requestAnimationFrame(() =>
                                followUpInputRef.current?.focus(),
                              );
                            }}
                          >
                            <Minimize2 size={17} />
                            <span>
                              <strong>/compact</strong>
                              <small>摘要较早消息，保留近期原文</small>
                            </span>
                          </button>
                        </span>
                      )}
                  </ComposerPrimitive.Root>
                </div>
              </div>
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
          </>
        )}

        <section className="conversation-pane aui-official-thread-shell">
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
          {(isLoadingHistory || isHydratingHistory) && (
            <div
              className={
                "history-hydration-status" +
                (isLoadingHistory ? " is-indeterminate" : "")
              }
              role="status"
              aria-live="polite"
            >
              <span className="history-hydration-label">
                {isLoadingHistory ? "正在打开会话" : "正在补齐更早的对话"}
              </span>
              <span className="history-hydration-track" aria-hidden="true">
                <i
                  style={
                    isLoadingHistory
                      ? undefined
                      : { width: `${historyHydrationProgress * 100}%` }
                  }
                />
              </span>
            </div>
          )}
          <Thread
            components={{
              AssistantMessageBefore: AssistantMessageRunSummary,
              AssistantIndicator: AssistantProcessingIndicator,
            }}
            composerAriaLabel="继续任务"
            composerPlaceholder="继续任务…"
            contentRef={conversationContentRef}
            showAttachmentButton={false}
            viewportProps={{
              ref: conversationScrollRef,
              onScroll: updateActiveQuestion,
              onWheelCapture: cancelConversationScrollAnimation,
              onPointerDownCapture: cancelConversationScrollAnimation,
            }}
            beforeComposer={
              <>
                {task.errorMessage && (
                  <div className="task-error-banner">{task.errorMessage}</div>
                )}
                {chatError && (
                  <div className="task-error-banner">{chatError}</div>
                )}
                {task.approval && <ApprovalDock store={store} />}
              </>
            }
            composerTools={
              <div className="flex min-w-0 items-center gap-1.5">
                <Popover
                  open={composerMenu === "context"}
                  onOpenChange={(open) =>
                    setComposerMenu(open ? "context" : null)
                  }
                >
                  <PopoverTrigger
                    className={buttonVariants({
                      variant: "ghost",
                      size: "icon-xs",
                      className: "composer-context-trigger",
                    })}
                    aria-label="添加上下文"
                    title="添加上下文"
                  >
                    <Plus />
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="start"
                    sideOffset={10}
                    className="composer-fast-popover w-72 gap-1.5 rounded-xl p-2"
                  >
                    <PopoverHeader className="px-2 py-1">
                      <PopoverTitle>添加</PopoverTitle>
                    </PopoverHeader>
                    <Button
                      className="h-auto w-full justify-start gap-3 px-2.5 py-2 text-start"
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        runtime.thread.composer.setText("/compact");
                        setComposerMenu(null);
                      }}
                    >
                      <Minimize2 />
                      <span className="flex flex-col items-start">
                        <strong>压缩上下文</strong>
                        <small className="text-muted-foreground">
                          摘要较早消息（已使用 {contextPercent}%）
                        </small>
                      </span>
                    </Button>
                    <Button
                      className="h-auto w-full justify-start gap-3 px-2.5 py-2 text-start"
                      type="button"
                      variant="ghost"
                      onClick={() => openLocalContext(false)}
                    >
                      <File />
                      <span className="flex flex-col items-start">
                        <strong>文件</strong>
                        <small className="text-muted-foreground">
                          选择本地文件作为上下文
                        </small>
                      </span>
                    </Button>
                    <Button
                      className="h-auto w-full justify-start gap-3 px-2.5 py-2 text-start"
                      type="button"
                      variant="ghost"
                      onClick={() => openLocalContext(true)}
                    >
                      <Folder />
                      <span className="flex flex-col items-start">
                        <strong>文件夹</strong>
                        <small className="text-muted-foreground">
                          选择一个本地目录
                        </small>
                      </span>
                    </Button>
                    <Button
                      className="h-auto w-full justify-start gap-3 px-2.5 py-2 text-start"
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setComposerMenu(null);
                        notify("持续目标接口待接入");
                      }}
                    >
                      <Target />
                      <span className="flex flex-col items-start">
                        <strong>目标</strong>
                        <small className="text-muted-foreground">
                          设置要持续追求的目标
                        </small>
                      </span>
                    </Button>
                  </PopoverContent>
                </Popover>

                <Popover
                  open={composerMenu === "permission"}
                  onOpenChange={(open) =>
                    setComposerMenu(open ? "permission" : null)
                  }
                >
                  <PopoverTrigger
                    className={buttonVariants({
                      variant: "ghost",
                      size: "xs",
                      className: `composer-permission-trigger${
                        permissionMode === "full_access"
                          ? " is-dangerous text-[#ff7a2f] hover:text-[#ff8a42]"
                          : ""
                      }`,
                    })}
                    aria-label="选择权限模式"
                  >
                    <PermissionModeIcon mode={permissionMode} size={14} />
                    <span className="hidden lg:inline">
                      {permissionModeLabel(permissionMode)}
                    </span>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="start"
                    sideOffset={10}
                    className="composer-fast-popover permission-popover w-[330px] gap-1 rounded-xl p-2"
                  >
                    <PopoverHeader className="px-2 py-1.5">
                      <PopoverTitle>应如何批准 LUMORA 操作？</PopoverTitle>
                    </PopoverHeader>
                    {permissionModeOptions.map((option) => (
                      <Button
                        className={[
                          "h-auto w-full justify-start gap-3 px-2.5 py-2 text-start",
                          option.value === permissionMode
                            ? "is-selected"
                            : "",
                          option.value === "full_access"
                            ? "is-dangerous"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        variant="ghost"
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
                          <PermissionModeIcon mode={option.value} size={18} />
                        </span>
                        <span className="permission-option-copy flex flex-1 flex-col items-start">
                          <strong>{option.label}</strong>
                          <small className="text-muted-foreground font-normal">
                            {option.description}
                          </small>
                        </span>
                        {option.value === permissionMode && (
                          <Check className="permission-option-check" />
                        )}
                      </Button>
                    ))}
                  </PopoverContent>
                </Popover>

                <span className="context-usage-control order-1">
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
                        strokeDasharray={contextPercent + " 100"}
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
                      {reportedContextTokens === undefined ? "约 " : ""}
                      {contextPercent}% 已用
                    </strong>
                    <b>
                      已用
                      {reportedContextTokens === undefined ? "约 " : " "}
                      {formatTokenCount(contextTokens)} 标记，共{" "}
                      {formatTokenCount(contextLimit)}
                    </b>
                  </span>
                </span>

                <Popover
                  open={composerMenu === "model"}
                  onOpenChange={(open) => {
                    setComposerMenu(open ? "model" : null);
                    setModelPickerSection(null);
                  }}
                >
                  <PopoverTrigger
                    className="model-reasoning-trigger flex h-7 min-w-0 max-w-64 items-center gap-1.5 rounded-md border-0 bg-transparent px-1.5 text-xs font-medium text-foreground shadow-none hover:bg-transparent"
                    aria-label="选择模型和推理强度"
                    title={
                      selectedModel
                        ? `${modelDisplayName(selectedModel)}${reasoningEffort ? ` · ${reasoningEffortLabel(reasoningEffort)}` : ""}`
                        : "选择模型"
                    }
                  >
                    <span className="min-w-0 truncate">
                      {selectedModel
                        ? modelDisplayName(selectedModel)
                        : "模型"}
                    </span>
                    {reasoningEffortOptions.length > 0 && reasoningEffort && (
                      <span className="model-reasoning-trigger-effort">
                        {reasoningEffortLabel(reasoningEffort)}
                      </span>
                    )}
                    <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="end"
                    sideOffset={6}
                    className="composer-popover composer-fast-popover model-reasoning-popover w-64 rounded-xl p-1.5"
                  >
                    <button
                      className={`model-reasoning-row${modelPickerSection === "model" ? " active" : ""}`}
                      type="button"
                      onPointerEnter={() => setModelPickerSection("model")}
                      onClick={() => setModelPickerSection("model")}
                    >
                      <span>模型</span>
                      <strong>{modelDisplayName(selectedModel)}</strong>
                      <ChevronRight />
                    </button>
                    {reasoningEffortOptions.length > 0 && (
                      <button
                        className={`model-reasoning-row${modelPickerSection === "reasoning" ? " active" : ""}`}
                        type="button"
                        onPointerEnter={() => setModelPickerSection("reasoning")}
                        onClick={() => setModelPickerSection("reasoning")}
                      >
                        <span>推理强度</span>
                        <strong>{reasoningEffortLabel(reasoningEffort)}</strong>
                        <ChevronRight />
                      </button>
                    )}

                    {modelPickerSection && (
                      <div
                        className={`model-reasoning-submenu is-${modelPickerSection}`}
                        role="menu"
                        aria-label={
                          modelPickerSection === "model"
                            ? "选择模型"
                            : "选择推理强度"
                        }
                      >
                        {modelPickerSection === "model"
                          ? modelOptions.map((model) => (
                            <Button
                              className="model-reasoning-option"
                              variant="ghost"
                              type="button"
                              role="menuitemradio"
                              aria-checked={model === selectedModel}
                              key={model}
                              onClick={() => {
                                selectModel(model);
                                setComposerMenu(null);
                              }}
                            >
                              <span className="truncate">
                                {modelDisplayName(model)}
                              </span>
                              {model === selectedModel && <Check />}
                            </Button>
                            ))
                          : reasoningEffortOptions.map((option) => (
                            <Button
                              className="model-reasoning-option"
                              variant="ghost"
                              type="button"
                              role="menuitemradio"
                              aria-checked={option.value === reasoningEffort}
                              key={option.value}
                              onClick={() => {
                                selectReasoningEffort(option.value);
                                setComposerMenu(null);
                              }}
                            >
                              <span>{option.label}</span>
                              <small>{option.value}</small>
                              {option.value === reasoningEffort && <Check />}
                            </Button>
                            ))}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            }
          />
        </section>

        <ToolApprovalDialog store={store} />

        {(artifactLoading || artifact || artifactError) && (
          <div className="artifact-viewer-backdrop" role="presentation">
            <aside className="artifact-viewer" aria-label="完整 Artifact">
              <header>
                <div>
                  <strong>完整 Artifact</strong>
                  <small>{artifact?.artifactId ?? "正在读取"}</small>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="关闭 Artifact"
                  onClick={() => {
                    setArtifact(undefined);
                    setArtifactError(undefined);
                  }}
                >
                  <X size={18} />
                </button>
              </header>
              {artifactError && <p className="artifact-viewer-error">{artifactError}</p>}
              {artifact && <pre><code>{artifact.content}</code></pre>}
              <footer>
                {artifact && <span>{artifact.characterCount.toLocaleString()} 字符</span>}
                {artifact?.hasMore && (
                  <button type="button" disabled={artifactLoading} onClick={loadMoreArtifact}>
                    {artifactLoading && <LoaderCircle className="spin" size={14} />}
                    继续加载
                  </button>
                )}
              </footer>
            </aside>
          </div>
        )}

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
    </AssistantRuntimeProvider>
  );
});

function PlainTextMessagePart({ text }: TextMessagePartProps) {
  return <p>{text}</p>;
}

function AssistantTextMessagePart({ text }: TextMessagePartProps) {
  return <MarkdownMessage content={text} />;
}

function textFromAppendMessage(message: AppendMessage): string {
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
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

function runtimeMessageId(index: number): string {
  return `lumora-message-${index}`;
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

function reasoningEffortMetadata(value: string): {
  label: string;
  description: string;
} {
  const known: Record<string, { label: string; description: string }> = {
    none: { label: "关闭", description: "不启用思考模式" },
    low: { label: "低", description: "更快响应" },
    medium: { label: "中", description: "平衡速度与推理" },
    high: { label: "高", description: "更深入地分析" },
    max: { label: "Max", description: "使用最大推理强度" },
  };
  return known[value] ?? { label: value, description: `API 字段：${value}` };
}

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
  return reasoningEffortMetadata(effort).label;
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
const TASK_COMPOSER_PREFERENCES_STORAGE_KEY =
  "lumora.task-composer-preferences.v1";

interface TaskComposerPreference {
  model?: string;
  reasoningByModel: Record<string, string>;
}

type TaskComposerPreferences = Record<string, TaskComposerPreference>;

function loadTaskComposerPreferences(): TaskComposerPreferences {
  try {
    const value = window.localStorage.getItem(
      TASK_COMPOSER_PREFERENCES_STORAGE_KEY,
    );
    if (!value) return {};
    const parsed = JSON.parse(value) as TaskComposerPreferences;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function loadTaskComposerPreference(
  taskId: string,
): TaskComposerPreference | undefined {
  return loadTaskComposerPreferences()[taskId];
}

function updateTaskComposerPreference(
  taskId: string,
  update: (preference: TaskComposerPreference) => TaskComposerPreference,
): void {
  try {
    const preferences = loadTaskComposerPreferences();
    preferences[taskId] = update(
      preferences[taskId] ?? { reasoningByModel: {} },
    );
    window.localStorage.setItem(
      TASK_COMPOSER_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // Local storage may be unavailable; the in-memory selection still works.
  }
}

function saveTaskComposerModel(taskId: string, model: string): void {
  updateTaskComposerPreference(taskId, (preference) => ({
    ...preference,
    model,
  }));
}

function saveTaskComposerReasoning(
  taskId: string,
  model: string,
  effort: string,
): void {
  updateTaskComposerPreference(taskId, (preference) => ({
    ...preference,
    reasoningByModel: {
      ...preference.reasoningByModel,
      [model]: effort,
    },
  }));
}

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
