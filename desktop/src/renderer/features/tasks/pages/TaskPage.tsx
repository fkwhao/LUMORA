import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  type AppendMessage,
  type ThreadMessage,
  fromThreadMessageLike,
  useAuiState,
  useRuntimeAdapters,
} from "@assistant-ui/react";
import type {
  AssistantRuntime,
  ExternalStoreAdapter,
} from "@assistant-ui/core";
import {
  AssistantRuntimeImpl,
  ExternalStoreRuntimeCore,
} from "@assistant-ui/core/internal";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  File,
  Folder,
  FolderClosed,
  Hand,
  LoaderCircle,
  Minimize2,
  MoreHorizontal,
  PackageOpen,
  PanelRight,
  Play,
  Plus,
  ShieldAlert,
  Square,
  Target,
  X,
} from "lucide-react";
import { useStore } from "zustand";

import type {
  ChatMessage,
  ConversationRunChanges,
  TaskWorktreeChanges,
  TaskWorktreeStatus,
  LumoraModelApi,
  ModelSettings,
  PermissionMode,
  ReasoningEffort,
  WorkLogItem,
  ArtifactChunk,
} from "../../../../shared/model-contract";
import type {
  CloudModelCatalog,
  LumoraCloudApi,
} from "../../../../shared/cloud-contract";
import type { TaskEvent } from "../../../../shared/task-contract";
import type { CitationReference } from "../../../../shared/citation-contract";
import type { LumoraSkillApi, SkillSummary } from "../../../../shared/skill-contract";
import type {
  GitCommitSummary,
  GitBranchSummary,
  GitReviewChanges,
  GitReviewScope,
  LumoraWorkspaceApi,
  WorkspaceContext,
} from "../../../../shared/workspace-contract";
import {
  executionPlanFromWorkLog,
  isExecutionPlanComplete,
} from "../../../../shared/execution-plan";
import { Thread } from "../../../components/assistant-ui/thread";
import { Button, buttonVariants } from "../../../components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "../../../components/ui/popover";
import { ApprovalDock } from "../components/ApprovalDock";
import { ToolApprovalDialog } from "../components/ToolApprovalDialog";
import { AgentRunSummary } from "../components/AgentRunSummary";
import { DiffReviewPane, type FileChange } from "../components/DiffReviewPane";
import {
  provisionalRunChangesFromWorkLog,
  RunChangesCard,
} from "../components/RunChangesCard";
import { ConversationUsagePane } from "../components/ConversationUsagePane";
import {
  SubagentSessionPane,
} from "../components/SubagentSessionPane";
import {
  TaskRightSidebar,
  type TaskRightSidebarTab,
} from "../components/TaskRightSidebar";
import { ConversationInputQueue } from "../components/ConversationInputQueue";
import { CitationPreviewPane } from "../components/CitationPreviewPane";
import {
  CitationNavigationContext,
  useCitationNavigation,
} from "../components/CitationNavigationContext";
import { InlineCitations } from "../components/InlineCitations";
import { PlanTodoList } from "../components/PlanTodoList";
import { WorkspaceControls } from "../components/WorkspaceControls";
import {
  attachmentReferences,
  completeAttachments,
  lumoraAttachmentAdapter,
} from "../attachments/lumora-attachment-adapter";
import {
  loadContextPaneWidth,
  saveContextPaneWidth,
} from "../../layout/context-pane-preferences";
import { resolveContextUsage } from "../state/context-usage";
import {
  citationsFromMessage,
  citationTabId,
  stripCitationDefinitions,
} from "../state/citations";
import { subagentSessionsFromMessages } from "../state/subagent-sessions";
import {
  INITIAL_RIGHT_SIDEBAR_STATE,
  rightSidebarTabReducer,
} from "../state/right-sidebar-tabs";
import { resolveQuestionRailTooltipPosition } from "../state/question-rail-tooltip";
import {
  resolveModelSubmenuPlacement,
  type ModelSubmenuPlacement,
} from "../state/model-submenu-position";
import type { TaskStore } from "../state/task-store";

interface TaskPageProps {
  store: TaskStore;
  cloudApi?: LumoraCloudApi;
  modelApi?: LumoraModelApi;
  skillApi?: LumoraSkillApi;
  workspaceApi?: LumoraWorkspaceApi;
  composerMotion?: "from-center";
  notify(message: string, tone?: "info" | "success"): void;
}

interface TaskMessageRenderContextValue {
  activeRunId?: string;
  chatStartedAt?: number;
  chatWasStopped: boolean;
  displayMessages: ChatMessage[];
  isChatting: boolean;
  isCompacting: boolean;
  lastChatDurationMs?: number;
  getCachedRunChanges(runId: string): ConversationRunChanges | undefined;
  loadRunChanges(runId: string): Promise<ConversationRunChanges>;
  onOpenArtifact(artifactId: string): void;
  onOpenAgent(agentId: string): void;
  onReviewChange(item?: WorkLogItem, runId?: string): void;
  onReviewRun(runId: string, filePath?: string): void;
  onRevertRun(runId: string): Promise<void>;
  revertingRunId?: string;
  taskEvents: TaskEvent[];
}

interface RuntimeMessageCacheEntry {
  source: ChatMessage;
  status: "complete" | "running";
  message: ThreadMessage;
}

const TaskMessageRenderContext = createContext<
  TaskMessageRenderContextValue | undefined
>(undefined);

const TASK_THREAD_COMPONENTS = {
  AssistantMessageBefore: TaskAssistantMessageRunSummary,
  AssistantMessageAfter: TaskAssistantMessageAfter,
  AssistantIndicator: TaskAssistantProcessingIndicator,
};

type ComposerReasoningEffort = ReasoningEffort;
const EMPTY_TASK_EVENTS: TaskEvent[] = [];

export const TaskPage = memo(function TaskPage({
  store,
  cloudApi,
  modelApi,
  skillApi,
  workspaceApi,
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
  const isPausing = useStore(store, (state) => state.isPausing);
  const activeRun = useStore(store, (state) => state.activeRun);
  const hasQueuedInputs = useStore(store, (state) =>
    state.pendingInputs.some((input) => input.target === "NEXT_TURN"),
  );
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
  const [composerAttachmentCount, setComposerAttachmentCount] = useState(0);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [rightSidebar, dispatchRightSidebar] = useReducer(
    rightSidebarTabReducer,
    INITIAL_RIGHT_SIDEBAR_STATE,
  );
  const [citationTabs, setCitationTabs] = useState(
    () => new Map<`citation:${string}`, CitationReference>(),
  );
  const citationTabsRef = useRef(citationTabs);
  citationTabsRef.current = citationTabs;
  const [contextPaneWidth, setContextPaneWidth] = useState(
    loadContextPaneWidth,
  );
  const [selectedChangeId, setSelectedChangeId] = useState<string>();
  const [reviewRunId, setReviewRunId] = useState<string>();
  const [runChanges, setRunChanges] = useState<ConversationRunChanges>();
  const [taskWorktree, setTaskWorktree] = useState<TaskWorktreeStatus>();
  const [taskWorktreeChanges, setTaskWorktreeChanges] =
    useState<TaskWorktreeChanges>();
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext>();
  const [workspaceRefreshToken, setWorkspaceRefreshToken] = useState(0);
  const [reviewScope, setReviewScope] = useState<GitReviewScope>();
  const [scopedChanges, setScopedChanges] = useState<GitReviewChanges>();
  const [gitHistory, setGitHistory] = useState<GitCommitSummary[]>([]);
  const [gitBranches, setGitBranches] = useState<GitBranchSummary[]>([]);
  const [worktreeAction, setWorktreeAction] = useState<
    "apply" | "branch" | "discard"
  >();
  const [changesLoading, setChangesLoading] = useState(false);
  const [changesError, setChangesError] = useState<string>();
  const [revertingRunId, setRevertingRunId] = useState<string>();
  const [modelSettings, setModelSettings] = useState<ModelSettings>();
  const [cloudModelCatalog, setCloudModelCatalog] = useState<CloudModelCatalog>();
  const [isSwitchingModel, setIsSwitchingModel] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
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
  const [modelSubmenuPlacement, setModelSubmenuPlacement] =
    useState<ModelSubmenuPlacement>("left");
  const [artifact, setArtifact] = useState<ArtifactChunk>();
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [artifactError, setArtifactError] = useState<string>();
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const conversationScrollRef = useRef<HTMLDivElement>(null);
  const conversationContentRef = useRef<HTMLDivElement>(null);
  const questionRailContainerRef = useRef<HTMLElement>(null);
  const questionRailRef = useRef<HTMLElement>(null);
  const questionRailScrollFrameRef = useRef<number | null>(null);
  const followUpInputRef = useRef<HTMLTextAreaElement>(null);
  const modelPopoverRef = useRef<HTMLDivElement>(null);
  const contextFileInputRef = useRef<HTMLInputElement>(null);
  const taskActionsRef = useRef<HTMLDivElement>(null);
  const scrollStateFrameRef = useRef<number | null>(null);
  const questionLayoutFrameRef = useRef<number | null>(null);
  const questionPositionsRef = useRef<Array<{ index: number; top: number }>>(
    [],
  );
  const lastAutoScrolledQuestionRef = useRef<string | undefined>(undefined);
  const refreshedReviewRevisionRef = useRef(0);
  const reviewRefreshGenerationRef = useRef(0);
  const runtimeMessageCacheRef = useRef(
    new Map<string, RuntimeMessageCacheEntry>(),
  );
  const runChangesCacheRef = useRef(
    new Map<string, ConversationRunChanges>(),
  );
  const runChangesRequestsRef = useRef(
    new Map<string, Promise<ConversationRunChanges>>(),
  );
  const workspacePath = useStore(store, (state) =>
    task?.taskId ? state.taskProjectPaths[task.taskId] : undefined,
  );
  const workspaceControlsDisabled = isPausing || Boolean(
    activeRun
    && activeRun.status !== "COMPLETED"
    && activeRun.status !== "FAILED"
    && activeRun.status !== "CANCELLED",
  );
  const acceptWorkspaceContext = useCallback((context: WorkspaceContext) => {
    setWorkspaceContext(context);
    setGitBranches(context.branches);
  }, []);

  useEffect(() => {
    if (!skillApi) return;
    let cancelled = false;
    void skillApi.list(workspacePath).then((items) => {
      if (!cancelled) setSkills(items.filter((item) => item.enabled));
    }).catch(() => {
      if (!cancelled) setSkills([]);
    });
    return () => { cancelled = true; };
  }, [skillApi, workspacePath]);

  useLayoutEffect(() => {
    if (composerMenu !== "model" || !modelPickerSection) return;
    const updatePlacement = () => {
      const popup = modelPopoverRef.current?.getBoundingClientRect();
      if (!popup) return;
      setModelSubmenuPlacement(
        resolveModelSubmenuPlacement(
          popup,
          { left: 0, right: window.innerWidth },
          modelPickerSection === "reasoning" ? "right" : "left",
        ),
      );
    };
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    return () => window.removeEventListener("resize", updatePlacement);
  }, [composerMenu, contextPaneWidth, modelPickerSection, rightSidebar.visible]);
  const questionMessageCount = useMemo(
    () => messages.filter((message) => message.role === "user").length,
    [messages],
  );
  const latestUserMessageKey = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === "user") {
        return (
          message.runtimeId ??
          message.messageId ??
          `${message.createdAt ?? ""}:${message.content}`
        );
      }
    }
    return undefined;
  }, [messages]);
  const observedWorkspaceRevision = useMemo(() => {
    let latest = 0;
    for (const message of messages) {
      for (const item of message.workLog ?? []) {
        const value = item.metadata?.workspaceRevision;
        if (typeof value === "number" && Number.isFinite(value)) {
          latest = Math.max(latest, value);
        }
      }
    }
    return latest;
  }, [messages]);
  const contextTabActive = rightSidebar.visible
    && rightSidebar.activeTabId === "context";
  const openContextTab = useCallback(() => {
    dispatchRightSidebar({ type: "open", tabId: "context" });
  }, []);
  const openChangeReview = useCallback((
    item?: WorkLogItem,
    runId?: string,
    filePath?: string,
  ) => {
    const targetRunId = runId ?? activeRun?.runId;
    const requestedPath = filePath ?? stringValue(item?.arguments?.path);
    setSelectedChangeId(item?.itemId);
    setReviewRunId(targetRunId);
    setRunChanges(undefined);
    setTaskWorktree(undefined);
    setTaskWorktreeChanges(undefined);
    setReviewScope(targetRunId
      ? { scope: "LAST_RUN", runId: targetRunId }
      : undefined);
    setScopedChanges(undefined);
    setChangesError(undefined);
    dispatchRightSidebar({ type: "open", tabId: "review" });
    if (!targetRunId || !task?.taskId || !modelApi) return;
    if (workspaceApi) {
      void Promise.all([
        workspaceApi.listHistory({ taskId: task.taskId, limit: 40 }),
        workspaceApi.listBranches(task.taskId),
      ]).then(([history, branches]) => {
        setGitHistory(history.commits);
        setGitBranches(branches);
      }).catch(() => {
        // Run diff remains available even when repository metadata cannot load.
      });
    }
    setChangesLoading(true);
    void Promise.all([
      modelApi.getRunChanges(task.taskId, targetRunId),
      modelApi.getTaskWorktree(task.taskId),
    ])
      .then(async ([result, worktree]) => {
        const aggregate = worktree?.workspaceMode === "WORKTREE"
          && isTaskChangesVisible(worktree)
          ? await modelApi.getTaskWorktreeChanges(task.taskId)
          : undefined;
        setRunChanges(result);
        setTaskWorktree(worktree);
        setTaskWorktreeChanges(aggregate);
        const reviewedFiles = result.files;
        const selected = reviewedFiles.find((file) =>
          requestedPath && (
            file.path === requestedPath
            || file.path.replaceAll("\\", "/").endsWith(
              requestedPath.replaceAll("\\", "/"),
            )
          ));
        setSelectedChangeId(
          selected
            ? `${result.runId}:${selected.path}`
            : undefined,
        );
      })
      .catch((error: unknown) => {
        setChangesError(
          error instanceof Error ? error.message : "读取 Git 变更失败",
        );
      })
      .finally(() => setChangesLoading(false));
  }, [activeRun?.runId, modelApi, task?.taskId, workspaceApi]);
  const loadRunChanges = useCallback(async (runId: string) => {
    const taskId = task?.taskId;
    if (!taskId || !modelApi) {
      throw new Error("当前任务无法读取 Git 变更");
    }
    const cacheKey = `${taskId}:${runId}`;
    const cached = runChangesCacheRef.current.get(cacheKey);
    if (cached) return cached;
    const pending = runChangesRequestsRef.current.get(cacheKey);
    if (pending) return pending;

    let request: Promise<ConversationRunChanges>;
    request = modelApi.getRunChanges(taskId, runId)
      .then((result) => {
        if (result.status !== "TRACKING") {
          runChangesCacheRef.current.set(cacheKey, result);
        }
        return result;
      })
      .finally(() => {
        if (runChangesRequestsRef.current.get(cacheKey) === request) {
          runChangesRequestsRef.current.delete(cacheKey);
        }
      });
    runChangesRequestsRef.current.set(cacheKey, request);
    return request;
  }, [modelApi, task?.taskId]);
  const getCachedRunChanges = useCallback((runId: string) => {
    const taskId = task?.taskId;
    return taskId
      ? runChangesCacheRef.current.get(`${taskId}:${runId}`)
      : undefined;
  }, [task?.taskId]);
  const reviewRun = useCallback((runId: string, filePath?: string) => {
    openChangeReview(undefined, runId, filePath);
  }, [openChangeReview]);
  const selectReviewScope = useCallback(async (scope: GitReviewScope) => {
    const taskId = task?.taskId;
    if (!taskId) return;
    const generation = ++reviewRefreshGenerationRef.current;
    setReviewScope(scope);
    setSelectedChangeId(undefined);
    setChangesLoading(true);
    setChangesError(undefined);
    try {
      if (workspaceApi) {
        const next = await workspaceApi.getChanges({ taskId, scope });
        if (generation !== reviewRefreshGenerationRef.current) return;
        setScopedChanges(next);
      } else if (
        modelApi
        && scope.scope === "LAST_RUN"
        && scope.runId
      ) {
        const next = await modelApi.getRunChanges(taskId, scope.runId);
        if (generation !== reviewRefreshGenerationRef.current) return;
        setRunChanges(next);
        setScopedChanges(undefined);
      } else {
        throw new Error("当前 Core 版本不支持这个审阅范围");
      }
    } catch (error) {
      if (generation !== reviewRefreshGenerationRef.current) return;
      setChangesError(
        error instanceof Error ? error.message : "读取 Git 变更失败",
      );
    } finally {
      if (generation === reviewRefreshGenerationRef.current) {
        setChangesLoading(false);
      }
    }
  }, [modelApi, task?.taskId, workspaceApi]);

  useEffect(() => {
    const taskId = task?.taskId;
    if (
      !taskId
      || !workspaceApi
      || !reviewScope
      || !rightSidebar.visible
      || rightSidebar.activeTabId !== "review"
      || observedWorkspaceRevision <= refreshedReviewRevisionRef.current
    ) return;

    const revision = observedWorkspaceRevision;
    const generation = ++reviewRefreshGenerationRef.current;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const scopedRequest = workspaceApi.getChanges({ taskId, scope: reviewScope });
      const runRequest = reviewScope.scope === "LAST_RUN"
        && reviewScope.runId
        && modelApi
        ? modelApi.getRunChanges(taskId, reviewScope.runId)
        : Promise.resolve(undefined);
      void Promise.all([scopedRequest, runRequest])
        .then(([nextScopedChanges, nextRunChanges]) => {
          if (cancelled || generation !== reviewRefreshGenerationRef.current) return;
          setScopedChanges(nextScopedChanges);
          if (nextRunChanges) setRunChanges(nextRunChanges);
          refreshedReviewRevisionRef.current = Math.max(
            refreshedReviewRevisionRef.current,
            revision,
          );
          setChangesError(undefined);
        })
        .catch((error: unknown) => {
          if (cancelled || generation !== reviewRefreshGenerationRef.current) return;
          setChangesError(
            error instanceof Error ? error.message : "刷新 Git 变更失败",
          );
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    modelApi,
    observedWorkspaceRevision,
    reviewScope,
    rightSidebar.activeTabId,
    rightSidebar.visible,
    task?.taskId,
    workspaceApi,
  ]);
  const openAgentSession = useCallback((agentId: string) => {
    dispatchRightSidebar({ type: "open", tabId: `agent:${agentId}` });
  }, []);
  const openCitation = useCallback((reference: CitationReference) => {
    const tabId = citationTabId(reference);
    setCitationTabs((current) => {
      const next = new Map(current);
      next.set(tabId, reference);
      return next;
    });
    dispatchRightSidebar({ type: "open", tabId });
  }, []);
  const closeRightSidebarTab = useCallback((tabId: TaskRightSidebarTab["id"]) => {
    dispatchRightSidebar({ type: "close", tabId });
    if (!tabId.startsWith("citation:")) return;
    const citationId = tabId as `citation:${string}`;
    const reference = citationTabsRef.current.get(citationId);
    if (reference?.kind === "web") {
      void window.lumora?.citations.closeWeb(citationId).catch(() => undefined);
    }
    setCitationTabs((current) => {
      const next = new Map(current);
      next.delete(citationId);
      return next;
    });
  }, []);

  const revertRun = useCallback(async (runId: string) => {
    const taskId = task?.taskId;
    if (!taskId || !modelApi) {
      return;
    }
    if (!globalThis.confirm(
      "撤销会把工作区恢复到本轮执行前，并从当前对话分支隐藏本轮消息。是否继续？",
    )) return;
    setRevertingRunId(runId);
    setChangesError(undefined);
    try {
      const reverted = await modelApi.revertRun(taskId, runId);
      runChangesCacheRef.current.set(`${taskId}:${runId}`, reverted);
      if (reviewRunId === runId) setRunChanges(reverted);
      setWorkspaceRefreshToken((value) => value + 1);
      try {
        const worktree = await modelApi.getTaskWorktree(taskId);
        setTaskWorktree(worktree);
        setTaskWorktreeChanges(
          worktree?.workspaceMode === "WORKTREE"
            && isTaskChangesVisible(worktree)
            ? await modelApi.getTaskWorktreeChanges(taskId)
            : undefined,
        );
        await store.getState().openTask(taskId);
      } catch {
        setChangesError("撤回已完成，但界面状态刷新失败；重新打开任务即可同步");
      }
      if (reviewScope) await selectReviewScope(reviewScope);
      notify("本轮文件与对话已撤销", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "撤销本轮失败";
      setChangesError(message);
      notify(message, "info");
    } finally {
      setRevertingRunId(undefined);
    }
  }, [
    modelApi,
    notify,
    reviewRunId,
    reviewScope,
    selectReviewScope,
    store,
    task?.taskId,
  ]);
  const revertReviewedRun = useCallback(async () => {
    if (!reviewRunId || !runChanges?.revertible) return;
    await revertRun(reviewRunId);
  }, [revertRun, reviewRunId, runChanges?.revertible]);
  const runWorktreeAction = useCallback(async (
    action: "apply" | "branch" | "discard",
    branchName?: string,
  ) => {
    const taskId = task?.taskId;
    if (!taskId || !modelApi || worktreeAction) return;
    if (action === "apply" && !globalThis.confirm(
      "将隔离 Worktree 的修改三方合并到 Local 工作区。无冲突时会自动清理临时目录，是否继续？",
    )) return;
    if (action === "discard" && !globalThis.confirm(
      "放弃后会删除这份隔离修改和临时 Worktree，是否继续？",
    )) return;
    setWorktreeAction(action);
    setChangesError(undefined);
    try {
      const result = action === "apply"
        ? await modelApi.applyTaskWorktree(taskId)
        : action === "branch"
          ? await modelApi.createTaskWorktreeBranch(taskId, branchName ?? "")
          : await modelApi.discardTaskWorktree(taskId);
      setTaskWorktree(result);
      setWorkspaceRefreshToken((value) => value + 1);
      try {
        if (result.worktreeState === "REMOVED"
            || result.worktreeState === "RELEASED") {
          setTaskWorktreeChanges(undefined);
        } else {
          setTaskWorktreeChanges(
            await modelApi.getTaskWorktreeChanges(taskId),
          );
        }
      } catch {
        setChangesError("操作已完成，但审阅内容刷新失败；重新打开审阅栏即可同步");
      }
      if (reviewScope) await selectReviewScope(reviewScope);
      if (result.worktreeState === "CONFLICTED") {
        notify("Local 与 Worktree 修改存在冲突，隔离内容已完整保留", "info");
      } else if (result.worktreeState === "CLEANUP_PENDING") {
        notify("操作已完成，临时目录将在后台继续清理", "info");
      } else if (action === "apply") {
        notify("Worktree 修改已应用到 Local", "success");
      } else if (action === "branch") {
        notify(`已创建分支 ${result.branchName}`, "success");
      } else {
        notify("隔离修改已放弃并清理", "success");
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Worktree 操作失败";
      setChangesError(message);
      notify(message, "info");
    } finally {
      setWorktreeAction(undefined);
    }
  }, [
    modelApi,
    notify,
    reviewScope,
    selectReviewScope,
    task?.taskId,
    worktreeAction,
  ]);
  const applyReviewedWorktree = useCallback(() => {
    void runWorktreeAction("apply");
  }, [runWorktreeAction]);
  const createReviewedWorktreeBranch = useCallback((branchName: string) => {
    void runWorktreeAction("branch", branchName);
  }, [runWorktreeAction]);
  const discardReviewedWorktree = useCallback(() => {
    void runWorktreeAction("discard");
  }, [runWorktreeAction]);

  useEffect(() => {
    for (const [tabId, reference] of citationTabsRef.current) {
      if (reference.kind === "web") {
        void window.lumora?.citations.closeWeb(tabId).catch(() => undefined);
      }
    }
    setCitationTabs(new Map());
    dispatchRightSidebar({ type: "reset" });
    setReviewRunId(undefined);
    setRunChanges(undefined);
    setTaskWorktree(undefined);
    setTaskWorktreeChanges(undefined);
    setWorkspaceContext(undefined);
    setReviewScope(undefined);
    setScopedChanges(undefined);
    setGitHistory([]);
    setGitBranches([]);
    refreshedReviewRevisionRef.current = 0;
    reviewRefreshGenerationRef.current += 1;
    setWorktreeAction(undefined);
    setChangesError(undefined);
  }, [task?.taskId]);

  useEffect(() => {
    if (!modelApi) {
      return;
    }
    let cancelled = false;
    void Promise.all([
      modelApi.getSettings(),
      cloudApi?.getModelCatalog().catch(() => undefined),
    ])
      .then(([settings, catalog]) => {
        if (cancelled) return;
        const localPreference = task?.taskId
          ? loadTaskComposerPreference(task.taskId)
          : undefined;
        const cloudManaged = catalog?.state.modelSource === "CLOUD_MANAGED";
        const cloudModels = cloudManaged ? (catalog?.models ?? []) : [];
        const configuredModels = new Set(
          cloudManaged
            ? cloudModels.map((model) => model.code)
            : [settings.model, ...settings.models.map((model) => model.modelId)],
        );
        const nextModel = cloudManaged
          ? selectedCloudModel(catalog!, settings.model)
          : task?.selectedModel && configuredModels.has(task.selectedModel)
              ? task.selectedModel
              : localPreference?.model && configuredModels.has(localPreference.model)
                ? localPreference.model
                : settings.model;
        setModelSettings(settings);
        setCloudModelCatalog(catalog);
        setSelectedModel(nextModel);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [cloudApi, modelApi, task?.taskId]);

  const cloudManaged = cloudModelCatalog?.state.modelSource === "CLOUD_MANAGED";

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
    async (model: string) => {
      let activeSettings = modelSettings;
      if (cloudManaged && cloudApi && modelApi) {
        setIsSwitchingModel(true);
        try {
          const state = await cloudApi.selectCloudModel(model);
          const settings = await modelApi.getSettings();
          activeSettings = settings;
          setCloudModelCatalog((current) => current ? { ...current, state } : current);
          setModelSettings(settings);
        } catch (error) {
          notify(error instanceof Error ? error.message : "切换官方模型失败", "info");
          return;
        } finally {
          setIsSwitchingModel(false);
        }
      }
      const efforts =
        activeSettings?.models.find((item) => item.modelId === model)
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
    [cloudApi, cloudManaged, modelApi, modelSettings, notify, store, task?.taskId],
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
        !target.closest(".composer-context-trigger") &&
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
    let observedWidth = content.getBoundingClientRect().width;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? observedWidth;
      if (Math.abs(nextWidth - observedWidth) < 0.5) {
        return;
      }
      observedWidth = nextWidth;
      refreshQuestionPositions();
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      if (questionLayoutFrameRef.current !== null) {
        cancelAnimationFrame(questionLayoutFrameRef.current);
        questionLayoutFrameRef.current = null;
      }
    };
  }, [task?.taskId, questionMessageCount]);

  useEffect(() => {
    if (!isChatting) {
      return;
    }
    if (!latestUserMessageKey) {
      return;
    }
    if (lastAutoScrolledQuestionRef.current === latestUserMessageKey) {
      return;
    }
    lastAutoScrolledQuestionRef.current = latestUserMessageKey;
    requestAnimationFrame(() => {
      const questionCount =
        conversationScrollRef.current?.querySelectorAll(
          "[data-question-index]",
        ).length ?? 0;
      if (questionCount > 0) {
        scrollToQuestion(questionCount - 1);
      }
    });
  }, [isChatting, latestUserMessageKey]);

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
  const messageCitations = useMemo(
    () => displayMessages.map((message) => citationsFromMessage(message)),
    [displayMessages],
  );
  const citationNavigation = useMemo(
    () => ({
      citationsForMessage: (index: number) => messageCitations[index] ?? [],
      openCitation,
    }),
    [messageCitations, openCitation],
  );
  const executionPlan = useMemo(() => {
    const latestAssistant = [...displayMessages]
      .reverse()
      .find((message) => message.role === "assistant");
    return executionPlanFromWorkLog(latestAssistant?.workLog);
  }, [displayMessages]);
  const showExecutionPlan =
    executionPlan.length > 0 && !isExecutionPlanComplete(executionPlan);

  const messageRepository = useMemo(() => {
    const runtimeMessageCache = runtimeMessageCacheRef.current;
    const activeRuntimeIds = new Set<string>();
    const toRuntimeMessage = (
      message: ChatMessage,
      index: number,
      status: "complete" | "running",
    ) => {
      const id = renderMessageId(message, index);
      activeRuntimeIds.add(id);
      const cached = runtimeMessageCache.get(id);
      if (cached?.source === message && cached.status === status) {
        return cached.message;
      }
      const runtimeMessage = fromThreadMessageLike(
        {
          id,
          role: message.role,
          content: message.content,
          attachments:
            message.role === "user"
              ? completeAttachments(message.attachments)
              : undefined,
          createdAt: message.createdAt
            ? new Date(message.createdAt)
            : undefined,
        },
        id,
        status === "running"
          ? { type: "running" }
          : { type: "complete", reason: "unknown" },
      );
      runtimeMessageCache.set(id, {
        source: message,
        status,
        message: runtimeMessage,
      });
      return runtimeMessage;
    };
    const persisted = displayMessages.flatMap(
      (message) => message.threadMessages ?? [],
    ).filter((message) => message.usageRecordOnly !== true);
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
    const renderIdByPersistedId = new Map(
      repositorySource.flatMap((message, index) =>
        message.messageId
          ? [[message.messageId, renderMessageId(message, index)] as const]
          : [],
      ),
    );
    const entries = repositorySource.map((message, index) => {
      const id = renderMessageId(message, index);
      return {
        parentId: message.parentMessageId
          ? (renderIdByPersistedId.get(message.parentMessageId) ??
            message.parentMessageId)
          : null,
        message: toRuntimeMessage(message, index, "complete"),
      };
    });

    let activeParentId: string | null = null;
    displayMessages.forEach((message, index) => {
      const id = renderMessageId(message, index);
      if (!message.messageId || !byId.has(message.messageId)) {
        entries.push({
          parentId: message.parentMessageId
            ? (renderIdByPersistedId.get(message.parentMessageId) ??
              activeParentId)
            : activeParentId,
          message: toRuntimeMessage(
            message,
            index,
            isChatting && index === displayMessages.length - 1
              ? "running"
              : "complete",
          ),
        });
      }
      activeParentId = id;
    });

    const lastIndex = displayMessages.length - 1;
    const headId =
      lastIndex < 0
        ? null
        : renderMessageId(displayMessages[lastIndex]!, lastIndex);
    runtimeMessageCache.forEach((_entry, id) => {
      if (!activeRuntimeIds.has(id)) {
        runtimeMessageCache.delete(id);
      }
    });
    return { messages: entries, headId };
  }, [displayMessages, isChatting]);

  const handleNewMessage = useCallback(
    async (message: AppendMessage) => {
      const attachments = attachmentReferences(message.attachments);
      const content = textFromAppendMessage(message).trim()
        || (attachments.length > 0 ? "请查看这些附件。" : "");
      if (!content) return;
      setComposerText("");
      setComposerMenu(null);
      if (content === "/compact" && attachments.length === 0) {
        await store.getState().compactContext(selectedModel || undefined);
        return;
      }
      const state = store.getState();
      const runStatus = state.activeRun?.status;
      const shouldQueue = state.isChatting || (
        runStatus === "QUEUED" ||
        runStatus === "RUNNING" ||
        runStatus === "WAITING_APPROVAL" ||
        runStatus === "PAUSING" ||
        runStatus === "PAUSED"
      );
      const options = {
        model: selectedModel || undefined,
        reasoningEffort: reasoningEffort || undefined,
        permissionMode,
        attachments,
      };
      if (shouldQueue) {
        await state.enqueueInput(content, "NEXT_TURN", options);
        notify("问题已加入队列", "success");
        return;
      }
      await state.sendMessage(content, options);
    },
    [notify, permissionMode, reasoningEffort, selectedModel, store],
  );

  const commandQuery = composerText.trim().toLowerCase();
  const matchingSkills = skills.filter((skill) =>
    `/${skill.name}`.startsWith(commandQuery),
  );
  const showCompactCommand = "/compact".startsWith(commandQuery);

  const handleEditMessage = useCallback(
    async (message: AppendMessage) => {
      const sourceIndex = message.sourceId
        ? displayMessages.findIndex(
            (candidate, index) =>
              candidate.messageId === message.sourceId ||
              renderMessageId(candidate, index) === message.sourceId,
          )
        : -1;
      const parentIndex =
        message.parentId === null
          ? -1
          : displayMessages.findIndex(
              (candidate, index) =>
                candidate.messageId === message.parentId ||
                renderMessageId(candidate, index) === message.parentId,
            );
      const target = displayMessages[
        sourceIndex >= 0 ? sourceIndex : parentIndex + 1
      ];
      const content = textFromAppendMessage(message).trim();
      const attachments = attachmentReferences(message.attachments);
      if (!target?.messageId || target.role !== "user" || !content) {
        notify("无法定位要编辑的消息，请刷新任务后重试", "info");
        return;
      }
      try {
        await store.getState().regenerateMessage(target.messageId, content, {
          model: selectedModel || undefined,
          reasoningEffort: reasoningEffort || undefined,
          permissionMode,
          attachments,
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
      const target = findOriginatingUserMessage(displayMessages, parentId);
      if (!target?.messageId) {
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
            attachments: target.attachments,
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

  const runtime = useSynchronousExternalStoreRuntime<ThreadMessage>({
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
      attachments: lumoraAttachmentAdapter,
      feedback: {
        submit: ({ type }) =>
          notify(type === "positive" ? "已喜欢这条回复" : "已记录反馈", "success"),
      },
    },
    unstable_capabilities: { copy: true },
  });

  useEffect(() => {
    const composer = runtime.thread.composer;
    const refresh = () => {
      setComposerAttachmentCount(composer.getState().attachments.length);
    };
    refresh();
    return composer.subscribe(refresh);
  }, [runtime]);

  const enqueueComposerInput = useCallback(
    async () => {
      const composer = runtime.thread.composer;
      const attachments = attachmentReferences(
        composer.getState().attachments,
      );
      const content = composerText.trim()
        || (attachments.length > 0 ? "请查看这些附件。" : "");
      if (!content) {
        followUpInputRef.current?.focus();
        return;
      }
      await store.getState().enqueueInput(content, "NEXT_TURN", {
        model: selectedModel || undefined,
        reasoningEffort: reasoningEffort || undefined,
        permissionMode,
        attachments,
      });
      await composer.reset();
      setComposerText("");
      notify("问题已加入队列", "success");
    }, [
      composerText,
      notify,
      permissionMode,
      reasoningEffort,
      runtime,
      selectedModel,
      store,
    ],
  );

  const chooseSlashCommand = useCallback((command: string) => {
    runtime.thread.composer.setText(command);
    setComposerText(command);
    setComposerMenu(null);
    requestAnimationFrame(() => followUpInputRef.current?.focus());
  }, [runtime]);

  const reviewedChanges = scopedChanges
    ?? (reviewScope?.scope === "LAST_RUN"
      ? runChanges
      : reviewScope
        ? undefined
        : taskWorktreeChanges ?? runChanges);
  const fallbackChangeMessages = reviewedChanges || reviewScope
    ? undefined
    : displayMessages;
  const reviewedChangesId = scopedChanges
    ? [
        "scope",
        reviewScope?.scope ?? "UNKNOWN",
        reviewScope?.runId
          ?? reviewScope?.commitSha
          ?? `${reviewScope?.baseRef ?? ""}..${reviewScope?.headRef ?? ""}`,
      ].join(":")
    : !reviewScope && taskWorktreeChanges
      ? `task:${taskWorktreeChanges.taskId}`
      : runChanges?.runId;
  const fileChanges = useMemo(
    () => reviewedChanges
      ? reviewedChanges.files.map((change) => ({
          changeId: `${reviewedChangesId}:${change.path}`,
          path: change.path,
          previousPath: change.previousPath || undefined,
          status: change.status,
          additions: change.additions,
          deletions: change.deletions,
          binary: change.binary,
          patch: change.patch,
          patchTruncated: change.patchTruncated,
          previewAvailable: !change.binary && Boolean(change.patch),
        }))
      : fileChangesFromMessages(fallbackChangeMessages ?? []),
    [
      fallbackChangeMessages,
      reviewedChanges,
      reviewedChangesId,
    ],
  );
  const questionEntries = displayMessages.flatMap((message, messageIndex) => {
    if (message.role !== "user") {
      return [];
    }
    const responseIndex = messageIndex + 1;
    const response = displayMessages[responseIndex];
    const result =
      response?.role === "assistant" &&
      !(isChatting && responseIndex === displayMessages.length - 1)
        ? stripCitationDefinitions(response.content).trim()
        : "";
    return [{ message, messageIndex, result }];
  });
  const latestQuestionEntry = questionEntries.at(-1);
  const latestQuestionMessageId = latestQuestionEntry
    ? renderMessageId(
        latestQuestionEntry.message,
        latestQuestionEntry.messageIndex,
      )
    : undefined;

  useLayoutEffect(() => {
    const scroll = conversationScrollRef.current;
    const content = conversationContentRef.current;
    if (!task || !scroll || !content || !latestQuestionMessageId) return;

    let frame: number | undefined;
    let stableFrames = 0;
    let attempts = 0;
    let finished = false;
    scroll.classList.add("is-restoring-position");
    questionPositionsRef.current = [];

    const finish = () => {
      if (finished) return;
      finished = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      observer.disconnect();
      scroll.classList.remove("is-restoring-position");
    };
    const alignLatestQuestion = () => {
      frame = undefined;
      if (finished) return;
      attempts += 1;
      const target = Array.from(
        scroll.querySelectorAll<HTMLElement>("[data-message-id]"),
      ).find(
        (element) => element.dataset.messageId === latestQuestionMessageId,
      );
      if (target) {
        const previousScrollBehavior = scroll.style.scrollBehavior;
        scroll.style.scrollBehavior = "auto";
        const targetTop =
          scroll.scrollTop +
          target.getBoundingClientRect().top -
          scroll.getBoundingClientRect().top -
          34;
        const boundedTargetTop = Math.max(
          0,
          Math.min(targetTop, scroll.scrollHeight - scroll.clientHeight),
        );
        scroll.scrollTop = boundedTargetTop;
        scroll.style.scrollBehavior = previousScrollBehavior;
        stableFrames =
          Math.abs(scroll.scrollTop - boundedTargetTop) <= 1
            ? stableFrames + 1
            : 0;
        setActiveQuestionIndex(questionEntries.length - 1);
      } else {
        stableFrames = 0;
      }

      if (
        (!isLoadingHistory && !isHydratingHistory && stableFrames >= 2) ||
        attempts >= 30
      ) {
        finish();
        return;
      }
      frame = requestAnimationFrame(alignLatestQuestion);
    };
    const observer = new MutationObserver(() => {
      stableFrames = 0;
      if (frame === undefined) {
        frame = requestAnimationFrame(alignLatestQuestion);
      }
    });
    observer.observe(content, { childList: true, subtree: true });
    alignLatestQuestion();

    return finish;
  }, [
    isHydratingHistory,
    isLoadingHistory,
    latestQuestionMessageId,
    questionEntries.length,
    task?.taskId,
  ]);

  useEffect(() => {
    const rail = questionRailRef.current;
    const container = questionRailContainerRef.current;
    if (!rail || !container) return;
    const updateEdges = () => {
      const top = rail.scrollTop > 2;
      const bottom = rail.scrollTop + rail.clientHeight < rail.scrollHeight - 2;
      container.classList.toggle("can-scroll-up", top);
      container.classList.toggle("can-scroll-down", bottom);
    };
    const handleScroll = () => {
      if (questionRailScrollFrameRef.current !== null) return;
      questionRailScrollFrameRef.current = requestAnimationFrame(() => {
        questionRailScrollFrameRef.current = null;
        updateEdges();
      });
    };
    const frame = requestAnimationFrame(() => {
      const active = rail.querySelector<HTMLElement>(
        `[data-rail-question-index="${activeQuestionIndex}"]`,
      );
      if (active) {
        const railBounds = rail.getBoundingClientRect();
        const activeBounds = active.getBoundingClientRect();
        if (activeBounds.top < railBounds.top + 18) {
          rail.scrollTop -= railBounds.top + 18 - activeBounds.top;
        } else if (activeBounds.bottom > railBounds.bottom - 18) {
          rail.scrollTop += activeBounds.bottom - (railBounds.bottom - 18);
        }
      }
      updateEdges();
    });
    rail.addEventListener("scroll", handleScroll, { passive: true });
    if (typeof ResizeObserver === "undefined") {
      return () => {
        cancelAnimationFrame(frame);
        rail.removeEventListener("scroll", handleScroll);
      };
    }
    const observer = new ResizeObserver(updateEdges);
    observer.observe(rail);
    const list = rail.querySelector<HTMLElement>(".question-rail-list");
    if (list) observer.observe(list);
    return () => {
      cancelAnimationFrame(frame);
      if (questionRailScrollFrameRef.current !== null) {
        cancelAnimationFrame(questionRailScrollFrameRef.current);
        questionRailScrollFrameRef.current = null;
      }
      rail.removeEventListener("scroll", handleScroll);
      observer.disconnect();
    };
  }, [activeQuestionIndex, questionEntries.length, task?.taskId]);

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

  function updateActiveQuestion(event: React.UIEvent<HTMLDivElement>) {
    if (scrollStateFrameRef.current !== null) {
      return;
    }
    const scroll = event.currentTarget;
    scrollStateFrameRef.current = requestAnimationFrame(() => {
      scrollStateFrameRef.current = null;
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

  function positionQuestionRailTooltip(element: HTMLButtonElement) {
    const bounds = element.getBoundingClientRect();
    const containingBlock = element
      .closest<HTMLElement>(".task-layout")
      ?.getBoundingClientRect();
    const position = resolveQuestionRailTooltipPosition(
      bounds,
      containingBlock,
    );
    element.style.setProperty(
      "--question-rail-tooltip-top",
      `${position.top}px`,
    );
    element.style.setProperty(
      "--question-rail-tooltip-left",
      `${position.left}px`,
    );
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
  const modelOptions = cloudManaged && (cloudModelCatalog?.models.length ?? 0) > 0
    ? cloudModelCatalog!.models.map((model) => model.code)
    : [
        ...new Set(
          [
            configuredModel,
            ...(modelSettings?.models.map((model) => model.modelId) ?? []),
            ...messages.map((message) => message.model ?? ""),
          ].filter(Boolean),
        ),
      ];
  const contextLimit = modelSettings?.models.find(
    (model) => model.modelId === selectedModel,
  )?.contextWindow ?? modelSettings?.contextWindow ?? 128_000;
  const contextUsage = resolveContextUsage(messages);
  const contextTokens = contextUsage.tokens;
  const contextPercent = Math.min(
    100,
    Math.round((contextTokens / contextLimit) * 100),
  );
  const subagentSessions = useMemo(
    () => subagentSessionsFromMessages(displayMessages),
    [displayMessages],
  );
  const activeAgentId = rightSidebar.activeTabId?.startsWith("agent:")
    ? rightSidebar.activeTabId.slice("agent:".length)
    : undefined;
  const selectedAgentSession = activeAgentId
    ? subagentSessions.get(activeAgentId)
    : undefined;
  const rightSidebarTabs = useMemo<TaskRightSidebarTab[]>(
    () => rightSidebar.tabs.map((tabId) => {
      if (tabId === "context") {
        return {
          id: tabId,
          label: "上下文",
          kind: "context",
          usagePercent: contextPercent,
        };
      }
      if (tabId === "review") {
        return { id: tabId, label: "审阅", kind: "review" };
      }
      if (tabId.startsWith("citation:")) {
        const reference = citationTabs.get(tabId as `citation:${string}`);
        return {
          id: tabId,
          label: reference?.label || "引用来源",
          kind: "citation",
          citationKind: reference?.kind,
        };
      }
      const session = subagentSessions.get(tabId.slice("agent:".length));
      return {
        id: tabId,
        label: session?.label || "子 Agent",
        kind: "agent",
        status: session?.status,
        agentId: session?.agentId || tabId.slice("agent:".length),
      };
    }),
    [citationTabs, contextPercent, rightSidebar.tabs, subagentSessions],
  );
  const activeCitationTabId = rightSidebar.activeTabId?.startsWith("citation:")
    ? rightSidebar.activeTabId as `citation:${string}`
    : undefined;
  const selectedCitation = activeCitationTabId
    ? citationTabs.get(activeCitationTabId)
    : undefined;
  const rightSidebarOpen = rightSidebar.visible && rightSidebar.tabs.length > 0;

  const messageRenderContext = useMemo<TaskMessageRenderContextValue>(
    () => ({
      activeRunId: activeRun?.runId,
      chatStartedAt,
      chatWasStopped,
      displayMessages,
      isChatting,
      isCompacting,
      lastChatDurationMs,
      getCachedRunChanges,
      loadRunChanges,
      onOpenArtifact: openArtifact,
      onOpenAgent: openAgentSession,
      onReviewChange: openChangeReview,
      onReviewRun: reviewRun,
      onRevertRun: revertRun,
      revertingRunId,
      taskEvents,
    }),
    [
      activeRun?.runId,
      chatStartedAt,
      chatWasStopped,
      displayMessages,
      isChatting,
      isCompacting,
      lastChatDurationMs,
      getCachedRunChanges,
      loadRunChanges,
      openArtifact,
      openAgentSession,
      openChangeReview,
      reviewRun,
      revertRun,
      revertingRunId,
      taskEvents,
    ],
  );

  if (!task) {
    return null;
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <CitationNavigationContext.Provider value={citationNavigation}>
      <TaskMessageRenderContext.Provider value={messageRenderContext}>
      <main
        className={`task-layout${rightSidebarOpen ? " has-right-sidebar" : ""}${composerMotion ? ` composer-enter-${composerMotion}` : ""}`}
        style={{ "--context-pane-width": `${contextPaneWidth}px` } as CSSProperties}
      >
      <header className="task-header">
        <div className="task-title-row">
          <span className="task-project-folder" aria-hidden="true">
            <FolderClosed size={18} strokeWidth={1.65} />
          </span>
          <div className="task-title-copy">
            <h1>{task.goal}</h1>
          </div>
          <WorkspaceControls
            api={workspaceApi}
            taskId={task.taskId}
            workspacePath={workspacePath}
            refreshToken={workspaceRefreshToken}
            disabled={workspaceControlsDisabled}
            onContextChange={acceptWorkspaceContext}
            notify={notify}
          />
        </div>

        <div className="task-actions" ref={taskActionsRef}>
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

      <div
        className={`task-stage${
          isLoadingHistory || isHydratingHistory
            ? " is-loading-history"
            : ""
        }`}
      >
        <aside
          ref={questionRailContainerRef}
          className="question-rail"
          aria-label="本次会话的问题记录"
        >
          <nav
            ref={questionRailRef}
            className="question-rail-track"
            aria-label="跳转到会话问题"
          >
            <div className="question-rail-list">
              {questionEntries.map(({ message, result }, questionIndex) => (
                <button
                  className={`question-rail-item${
                    activeQuestionIndex === questionIndex ? " active" : ""
                  }`}
                  type="button"
                  key={message.runtimeId ?? message.messageId ?? `question-${questionIndex}`}
                  data-rail-question-index={questionIndex}
                  aria-label={`跳转到问题 ${questionIndex + 1}：${message.content}`}
                  aria-current={
                    activeQuestionIndex === questionIndex ? "step" : undefined
                  }
                  onMouseEnter={(event) =>
                    positionQuestionRailTooltip(event.currentTarget)
                  }
                  onFocus={(event) =>
                    positionQuestionRailTooltip(event.currentTarget)
                  }
                  onClick={() => {
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

        <section className="conversation-pane aui-official-thread-shell">
          <input
            ref={contextFileInputRef}
            className="visually-hidden"
            type="file"
            multiple
            onChange={(event) => {
              const count = event.target.files?.length ?? 0;
              const files = [...(event.target.files ?? [])].slice(0, 10);
              if (files.length > 0) void Promise.all(
                files.map((file) => runtime.thread.composer.addAttachment(file)),
              ).then(() => notify(`已添加 ${files.length} 个附件`, "success"))
                .catch((error) => notify(
                  error instanceof Error ? error.message : "添加附件失败",
                  "info",
                ));
              if (count > 10) notify("一次最多添加 10 个附件", "info");
              event.target.value = "";
            }}
          />
          {showExecutionPlan && (
            <aside className="conversation-plan-float" aria-label="当前执行计划">
              <PlanTodoList steps={executionPlan} />
            </aside>
          )}
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
            components={TASK_THREAD_COMPONENTS}
            composerAriaLabel="继续任务"
            composerPlaceholder="继续任务…"
            composerInputRef={followUpInputRef}
            onComposerTextChange={(value) => {
              setComposerText(value);
              if (value.startsWith("/")) setComposerMenu("command");
              else if (composerMenu === "command") setComposerMenu(null);
            }}
            onComposerKeyDown={(event) => {
              if (
                !isChatting ||
                event.key !== "Enter" ||
                event.shiftKey ||
                event.nativeEvent.isComposing
              ) return;
              event.preventDefault();
              void enqueueComposerInput().catch((error) => notify(
                error instanceof Error ? error.message : "加入问题队列失败",
                "info",
              ));
            }}
            composerRunningActions={
              composerText.trim() || composerAttachmentCount > 0 ? (
                <button
                  className="aui-composer-send inline-flex size-7 items-center justify-center rounded-full transition-transform hover:scale-[1.04] disabled:opacity-35"
                  type="button"
                  aria-label="发送到问题队列"
                  title="发送到问题队列"
                  onClick={() => void enqueueComposerInput().catch(
                    (error) => notify(
                      error instanceof Error ? error.message : "加入问题队列失败",
                      "info",
                    ),
                  )}
                >
                  <ArrowUp className="aui-composer-send-icon size-4" />
                </button>
              ) : (
                <ComposerPrimitive.Cancel asChild>
                  <button
                    className="aui-composer-cancel inline-flex size-7 items-center justify-center rounded-full transition-transform hover:scale-[1.04] disabled:opacity-40"
                    type="button"
                    disabled={isPausing}
                    aria-label="安全暂停"
                    title="安全暂停"
                  >
                    <Square className="aui-composer-cancel-icon size-2.5" />
                  </button>
                </ComposerPrimitive.Cancel>
              )
            }
            composerPopup={
              composerMenu === "context" ? (
                <span
                  className="composer-popover context-picker-popover composer-add-panel"
                  role="menu"
                  aria-label="添加"
                >
                  <b>添加</b>
                  <button
                    className="context-compact-command"
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
                      <strong>压缩上下文</strong>
                      <small>摘要较早消息（已使用 {contextPercent}%）</small>
                    </span>
                  </button>
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
              ) : composerMenu === "command" &&
                composerText.startsWith("/") &&
                (showCompactCommand || matchingSkills.length > 0) ? (
                <span
                  className="composer-popover command-picker-popover"
                  role="menu"
                  aria-label="斜杠指令"
                >
                  {showCompactCommand && (
                    <button type="button" role="menuitem" onClick={() => chooseSlashCommand("/compact")}>
                      <Minimize2 size={17} />
                      <span><strong>/compact</strong><small>压缩上下文，保留近期原文</small></span>
                    </button>
                  )}
                  {matchingSkills.map((skill) => (
                    <button type="button" role="menuitem" key={skill.name} onClick={() => chooseSlashCommand(`/${skill.name} `)}>
                      <PackageOpen size={17} />
                      <span><strong>/{skill.name}</strong><small>{skill.description}</small></span>
                    </button>
                  ))}
                </span>
              ) : null
            }
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
            composerHeader={
              hasQueuedInputs || activeRun?.status === "PAUSED" ? (
                <ConversationInputQueue store={store} notify={notify} />
              ) : undefined
            }
            composerTools={
              <div className="flex min-w-0 items-center gap-1.5">
                <button
                  className={buttonVariants({
                    variant: "ghost",
                    size: "icon-xs",
                    className: "composer-context-trigger",
                  })}
                  type="button"
                  aria-label="添加上下文"
                  aria-expanded={composerMenu === "context"}
                  title="添加上下文"
                  onClick={() =>
                    setComposerMenu((open) =>
                      open === "context" ? null : "context",
                    )
                  }
                >
                  <Plus />
                </button>

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
                    role="button"
                    aria-describedby={
                      contextTabActive ? undefined : "context-usage-tooltip"
                    }
                    aria-label="上下文已用"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={contextPercent}
                    tabIndex={0}
                    aria-expanded={contextTabActive}
                    onClick={openContextTab}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openContextTab();
                      }
                    }}
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
                    <span>
                      {isChatting ? "当前模型请求：" : "最近一次模型请求："}
                    </span>
                    <strong>
                      {contextUsage.estimated ? "约 " : ""}
                      {contextPercent}% 已用
                    </strong>
                    <b>
                      已用
                      {contextUsage.estimated ? "约 " : " "}
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
                        ? `${composerModelDisplayName(selectedModel, cloudModelCatalog)}${reasoningEffort ? ` · ${reasoningEffortLabel(reasoningEffort)}` : ""}`
                        : "选择模型"
                    }
                  >
                    <span className="min-w-0 truncate">
                      {selectedModel
                        ? composerModelDisplayName(selectedModel, cloudModelCatalog)
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
                    ref={modelPopoverRef}
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
                      <strong>{composerModelDisplayName(selectedModel, cloudModelCatalog)}</strong>
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
                        className={`model-reasoning-submenu is-${modelPickerSection} opens-${modelSubmenuPlacement}`}
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
                              disabled={isSwitchingModel}
                              key={model}
                              onClick={() => {
                                void selectModel(model);
                                setComposerMenu(null);
                              }}
                            >
                              <span className="truncate">
                                {composerModelDisplayName(model, cloudModelCatalog)}
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
      </div>

        <TaskRightSidebar
          open={rightSidebarOpen}
          width={contextPaneWidth}
          tabs={rightSidebarTabs}
          activeTabId={rightSidebar.activeTabId}
          onSelectTab={(tabId) => {
            dispatchRightSidebar({ type: "select", tabId });
          }}
          onCloseTab={closeRightSidebarTab}
          onOpenChange={(open) => {
            dispatchRightSidebar({ type: open ? "show" : "hide" });
          }}
          onWidthChange={setContextPaneWidth}
          onWidthCommit={saveContextPaneWidth}
        >
          {rightSidebar.activeTabId === "context" && (
            <ConversationUsagePane
            messages={displayMessages}
            conversationTitle={task.goal}
            provider={modelSettings?.providerName ?? ""}
            model={selectedModel || configuredModel}
            contextTokens={contextTokens}
            contextLimit={contextLimit}
            contextPercent={contextPercent}
            estimated={contextUsage.estimated}
            createdAt={task.createdAt}
            updatedAt={task.updatedAt}
            onExport={exportConversation}
            />
          )}
          {rightSidebar.activeTabId === "review" && (
            <DiffReviewPane
              changes={fileChanges}
              runChanges={runChanges}
              taskChanges={taskWorktreeChanges}
              taskWorktree={taskWorktree}
              scope={reviewScope}
              scopeChanges={scopedChanges}
              lastRunId={reviewRunId}
              branches={gitBranches}
              commits={gitHistory}
              currentBranch={workspaceContext?.branch?.name}
              selectedChangeId={selectedChangeId}
              loading={changesLoading}
              reverting={revertingRunId === reviewRunId}
              worktreeAction={worktreeAction}
              error={changesError}
              onSelectChange={setSelectedChangeId}
              onRevert={revertReviewedRun}
              onApplyWorktree={applyReviewedWorktree}
              onCreateWorktreeBranch={createReviewedWorktreeBranch}
              onDiscardWorktree={discardReviewedWorktree}
              onScopeChange={(scope) => void selectReviewScope(scope)}
            />
          )}
          {activeAgentId && (
            <SubagentSessionPane
              session={selectedAgentSession}
              onOpenAgent={openAgentSession}
            />
          )}
          {rightSidebarOpen && activeCitationTabId && selectedCitation && (
            <CitationPreviewPane
              taskId={task.taskId}
              previewId={activeCitationTabId}
              reference={selectedCitation}
              modelApi={modelApi}
            />
          )}
        </TaskRightSidebar>
        <button
          className="task-sidebar-visibility-toggle"
          type="button"
          aria-label={rightSidebarOpen ? "隐藏侧边栏" : "显示侧边栏"}
          title={rightSidebarOpen ? "隐藏侧边栏" : "显示侧边栏"}
          aria-expanded={rightSidebarOpen}
          onClick={() =>
            dispatchRightSidebar({ type: rightSidebarOpen ? "hide" : "show" })
          }
        >
          <PanelRight size={17} strokeWidth={1.7} />
        </button>
      </main>
      </TaskMessageRenderContext.Provider>
      </CitationNavigationContext.Provider>
    </AssistantRuntimeProvider>
  );
});

function TaskAssistantMessageRunSummary() {
  const context = useTaskMessageRenderContext();
  const index = useAuiState((state) => state.message.index);
  const originalMessage = context.displayMessages[index];

  if (!originalMessage) return null;
  const runId = originalMessage.runId
    ?? (index === context.displayMessages.length - 1
      ? context.activeRunId
      : undefined);

  return (
    <AgentRunSummary
      startedAt={context.chatStartedAt}
      answerStarted={Boolean(originalMessage.content.trim())}
      durationMs={
        originalMessage.durationMs ||
        (index === context.displayMessages.length - 1
          ? context.lastChatDurationMs
          : undefined)
      }
      events={
        index === context.displayMessages.length - 1
          ? context.taskEvents
          : EMPTY_TASK_EVENTS
      }
      workLog={originalMessage.workLog}
      running={
        (context.isChatting || context.isCompacting) &&
        index === context.displayMessages.length - 1
      }
      stopped={
        context.chatWasStopped &&
        index === context.displayMessages.length - 1
      }
      onReviewChange={(item) => context.onReviewChange(item, runId)}
      onOpenArtifact={context.onOpenArtifact}
      onOpenAgent={context.onOpenAgent}
    />
  );
}

function TaskAssistantMessageAfter() {
  return (
    <>
      <TaskAssistantMessageCitations />
      <TaskAssistantMessageChanges />
    </>
  );
}

function TaskAssistantMessageCitations() {
  const navigation = useCitationNavigation();
  const index = useAuiState((state) => state.message.index);
  const references = navigation?.citationsForMessage(index) ?? [];
  if (!navigation || references.length === 0) return null;
  return (
    <InlineCitations
      references={references}
      onOpen={navigation.openCitation}
    />
  );
}

function TaskAssistantMessageChanges() {
  const context = useTaskMessageRenderContext();
  const index = useAuiState((state) => state.message.index);
  const originalMessage = context.displayMessages[index];
  const [changes, setChanges] = useState<ConversationRunChanges>();
  const running = Boolean(originalMessage) && (
    (context.isChatting || context.isCompacting)
    && index === context.displayMessages.length - 1
  );
  const runId = originalMessage?.runId
    ?? (index === context.displayMessages.length - 1
      ? context.activeRunId
      : undefined);
  const provisionalChanges = useMemo(
    () => runId
      ? provisionalRunChangesFromWorkLog(runId, originalMessage?.workLog)
      : undefined,
    [originalMessage?.workLog, runId],
  );
  const provisionalSignature = provisionalChanges?.files
    .map((file) => `${file.path}:${file.additions}:${file.deletions}`)
    .join("|") ?? "";
  const cachedChanges = runId ? context.getCachedRunChanges(runId) : undefined;
  const loadedChanges = changes?.runId === runId
    ? changes
    : cachedChanges?.runId === runId
      ? cachedChanges
      : undefined;
  const visibleChanges = loadedChanges ?? (running ? undefined : provisionalChanges);

  useEffect(() => {
    setChanges((current) => current?.runId === runId ? current : undefined);
    if (!runId || (running && !provisionalSignature)) return;
    let cancelled = false;
    let retryTimer: number | undefined;

    const readChanges = async (attempt: number) => {
      try {
        const result = await context.loadRunChanges(runId);
        if (cancelled) return;
        if (result.status === "TRACKING") {
          if (result.files.length > 0) setChanges(result);
          if (running) return;
        }
        if (result.status === "TRACKING" && attempt < 4) {
          retryTimer = window.setTimeout(() => {
            void readChanges(attempt + 1);
          }, 500);
          return;
        }
        if (result.status === "TRACKING" && result.files.length === 0) return;
        setChanges(result);
      } catch {
        // Keep the work-log summary visible when Git confirmation is delayed.
      }
    };

    void readChanges(0);
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [context.loadRunChanges, provisionalSignature, runId, running]);

  if (!runId || !visibleChanges || visibleChanges.files.length === 0) {
    return null;
  }

  return (
    <RunChangesCard
      changes={visibleChanges}
      reverting={context.revertingRunId === runId}
      onReview={(filePath) => context.onReviewRun(runId, filePath)}
      onRevert={() => context.onRevertRun(runId)}
    />
  );
}

function TaskAssistantProcessingIndicator() {
  return null;
}

function useTaskMessageRenderContext(): TaskMessageRenderContextValue {
  const context = useContext(TaskMessageRenderContext);
  if (!context) {
    throw new Error("Task message components require their render context");
  }
  return context;
}

function useSynchronousExternalStoreRuntime<T>(
  adapter: ExternalStoreAdapter<T>,
): AssistantRuntime {
  const [core] = useState(() => new ExternalStoreRuntimeCore(adapter));
  const [runtime] = useState(() => new AssistantRuntimeImpl(core));
  const { modelContext } = useRuntimeAdapters() ?? {};

  useLayoutEffect(() => {
    core.setAdapter(adapter);
  }, [adapter, core]);

  useEffect(() => {
    if (!modelContext) return;
    return runtime.registerModelContextProvider(modelContext);
  }, [modelContext, runtime]);

  return runtime;
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
    status: item.toolName === "write_file" ? "ADDED" : "MODIFIED",
    additions: lineCount(newText),
    deletions: lineCount(oldText),
    binary: false,
    patch: "",
    oldText,
    newText,
    previewAvailable:
      newText !== unavailableMarker && oldText !== unavailableMarker,
  };
}

function lineCount(value: string): number {
  return value ? value.split(/\r?\n/).length : 0;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isTaskChangesVisible(worktree: TaskWorktreeStatus): boolean {
  return worktree.worktreeState === "WAITING_REVIEW"
    || worktree.worktreeState === "CONFLICTED"
    || worktree.worktreeState === "CLEANUP_PENDING"
    || worktree.worktreeState === "BRANCHED";
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

function composerModelDisplayName(
  model: string,
  catalog?: CloudModelCatalog,
): string {
  return catalog?.models.find((candidate) => candidate.code === model)?.displayName
    ?? modelDisplayName(model);
}

function selectedCloudModel(
  catalog: CloudModelCatalog,
  fallback: string,
): string {
  return catalog.models.find(
    (model) => model.code === catalog.state.selectedCloudModelCode,
  )?.code ?? catalog.models[0]?.code ?? fallback;
}

function runtimeMessageId(index: number): string {
  return `lumora-message-${index}`;
}

function renderMessageId(message: ChatMessage, index: number): string {
  return message.runtimeId ?? message.messageId ?? runtimeMessageId(index);
}

function findOriginatingUserMessage(
  messages: ChatMessage[],
  initialParentId: string | null,
): ChatMessage | undefined {
  if (initialParentId === null) {
    return [...messages].reverse().find((message) => message.role === "user");
  }

  const messageIndexById = new Map<string, number>();
  messages.forEach((message, index) => {
    if (message.messageId) messageIndexById.set(message.messageId, index);
    if (message.runtimeId) messageIndexById.set(message.runtimeId, index);
    messageIndexById.set(renderMessageId(message, index), index);
  });

  const visited = new Set<number>();
  let currentIndex = messageIndexById.get(initialParentId);
  while (currentIndex !== undefined && !visited.has(currentIndex)) {
    visited.add(currentIndex);
    const current = messages[currentIndex];
    if (!current) return undefined;
    if (current.role === "user") return current;

    currentIndex = current.parentMessageId
      ? messageIndexById.get(current.parentMessageId)
      : currentIndex > 0
        ? currentIndex - 1
        : undefined;
  }
  return undefined;
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
