import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useStore } from "zustand";

import type { LumoraModelApi } from "../shared/model-contract";
import type { LumoraCloudApi } from "../shared/cloud-contract";
import type { LumoraMemoryApi } from "../shared/memory-contract";
import type { LumoraMcpApi } from "../shared/mcp-contract";
import type { LumoraSkillApi } from "../shared/skill-contract";
import type { LumoraTaskApi } from "../shared/task-contract";
import type { ProjectDirectory } from "../shared/window-contract";
import type { LumoraWorkspaceApi } from "../shared/workspace-contract";
import { AppSidebar } from "./components/AppSidebar";
import { WindowChrome } from "./components/WindowChrome";
import {
  ToastViewport,
  type ToastNotice,
} from "./components/ToastViewport";
import {
  PrototypePage,
  type PrototypeView,
} from "./features/prototype/PrototypePage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { HomePage } from "./features/tasks/HomePage";
import { ConversationHubPage } from "./features/tasks/ConversationHubPage";
import { useProcessingTaskIds } from "./features/tasks/state/use-processing-task-ids";
import {
  loadProjectNames,
  saveActiveProject,
  saveProjectName,
} from "./features/tasks/project-context-storage";
import { TaskPage } from "./features/tasks/TaskPage";
import { createTaskStore } from "./features/tasks/task-store";
import {
  clampSidebarWidth,
  loadSidebarCollapsed,
  loadSidebarWidth,
  saveSidebarCollapsed,
  saveSidebarWidth,
  shouldCollapseSidebarOnDrag,
} from "./features/layout/sidebar-preferences";

interface AppProps {
  api?: LumoraTaskApi;
  cloudApi?: LumoraCloudApi;
  modelApi?: LumoraModelApi;
  memoryApi?: LumoraMemoryApi;
  mcpApi?: LumoraMcpApi;
  skillApi?: LumoraSkillApi;
  workspaceApi?: LumoraWorkspaceApi;
}

type AppView = "work" | "conversationHub" | "settings" | PrototypeView;
type ComposerMotion = "to-task" | "to-home";

interface AppLocation {
  view: AppView;
  taskId?: string;
}

interface NavigationState {
  entries: AppLocation[];
  index: number;
}

export function App({
  api,
  cloudApi,
  modelApi,
  memoryApi,
  mcpApi,
  skillApi,
  workspaceApi,
}: AppProps) {
  const resolvedTaskApi = api ?? window.lumora?.tasks;
  const resolvedCloudApi = cloudApi ?? window.lumora?.cloud;
  const resolvedModelApi = modelApi ?? window.lumora?.model;
  const resolvedMemoryApi = memoryApi ?? window.lumora?.memory;
  const resolvedMcpApi = mcpApi ?? window.lumora?.mcp;
  const resolvedSkillApi = skillApi ?? window.lumora?.skill;
  const resolvedWorkspaceApi = workspaceApi ?? window.lumora?.workspace;
  if (!resolvedTaskApi) {
    return <DesktopBridgeError />;
  }
  return (
    <ConnectedApp
      api={resolvedTaskApi}
      cloudApi={resolvedCloudApi}
      modelApi={resolvedModelApi}
      memoryApi={resolvedMemoryApi}
      mcpApi={resolvedMcpApi}
      skillApi={resolvedSkillApi}
      workspaceApi={resolvedWorkspaceApi}
    />
  );
}

function ConnectedApp({
  api,
  cloudApi,
  modelApi,
  memoryApi,
  mcpApi,
  skillApi,
  workspaceApi,
}: Required<Pick<AppProps, "api">> & {
  cloudApi?: LumoraCloudApi;
  modelApi?: LumoraModelApi;
  memoryApi?: LumoraMemoryApi;
  mcpApi?: LumoraMcpApi;
  skillApi?: LumoraSkillApi;
  workspaceApi?: LumoraWorkspaceApi;
}) {
  // Store 与能力边界绑定，切换测试 API 时不会泄漏旧任务订阅。
  const store = useMemo(
    () => createTaskStore(api, modelApi),
    [api, modelApi],
  );
  const activeTask = useStore(store, (state) => state.activeTask);
  const activeRun = useStore(store, (state) => state.activeRun);
  const recentTasks = useStore(store, (state) => state.recentTasks);
  const archivedTaskIds = useStore(
    store,
    (state) => state.archivedTaskIds,
  );
  const taskProjectPaths = useStore(
    store,
    (state) => state.taskProjectPaths,
  );
  const isLoadingHistory = useStore(
    store,
    (state) => state.isLoadingHistory,
  );
  const isChatting = useStore(store, (state) => state.isChatting);
  const [view, setView] = useState<AppView>("work");
  const [notice, setNotice] = useState<ToastNotice>();
  const [homeRevision, setHomeRevision] = useState(0);
  const [composerMotion, setComposerMotion] = useState<ComposerMotion>();
  const [projectNames, setProjectNames] = useState(loadProjectNames);
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string>();
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    loadSidebarCollapsed,
  );
  const [navigation, setNavigation] = useState<NavigationState>({
    entries: [{ view: "work" }],
    index: 0,
  });
  const applyingNavigationRef = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const stopSidebarResizeRef = useRef<() => void>(() => undefined);
  const shellStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
  } as CSSProperties;
  const notify = useCallback(
    (message: string, tone: "info" | "success" = "info") => {
      setNotice({ id: Date.now(), message, tone });
    },
    [],
  );
  const activeView =
    view === "work"
      ? activeTask
        ? "task"
        : "home"
      : view === "conversationHub"
        ? "home"
        : view;
  const activeTasks = useMemo(() => {
    const archivedTaskIdSet = new Set(archivedTaskIds);
    return recentTasks.filter((task) => !archivedTaskIdSet.has(task.taskId));
  }, [archivedTaskIds, recentTasks]);
  const sidebarTaskIds = useMemo(
    () => activeTasks.map((task) => task.taskId),
    [activeTasks],
  );
  const processingTaskIds = useProcessingTaskIds({
    modelApi,
    taskIds: sidebarTaskIds,
    activeTaskId: activeTask?.taskId,
    activeRun,
    isChatting,
  });
  const conversationTabs = useMemo(
    () =>
      openTabIds.flatMap((taskId) => {
        const task =
          activeTasks.find((item) => item.taskId === taskId) ??
          (activeTask?.taskId === taskId
            ? { taskId, goal: activeTask.goal }
            : undefined);
        if (!task) return [];
        const projectPath = taskProjectPaths[taskId];
        return [
          {
            taskId,
            title: task.goal,
            projectName: projectPath ? projectNames[projectPath] : undefined,
          },
        ];
      }),
    [activeTask, activeTasks, openTabIds, projectNames, taskProjectPaths],
  );
  const currentLocation: AppLocation =
    view === "work"
      ? { view, taskId: selectedTabId }
      : { view };

  useEffect(() => {
    void store.getState().loadRecentTasks();
  }, [store]);

  useEffect(() => {
    if (!activeTask) return;
    setOpenTabIds((taskIds) =>
      taskIds.includes(activeTask.taskId)
        ? taskIds
        : [...taskIds, activeTask.taskId],
    );
    setSelectedTabId((taskId) => taskId ?? activeTask.taskId);
  }, [activeTask]);

  useEffect(() => {
    if (view === "work" && !activeTask && !isLoadingHistory) {
      setSelectedTabId(undefined);
    }
  }, [activeTask, isLoadingHistory, view]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(undefined), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(
    () => () => stopSidebarResizeRef.current(),
    [],
  );

  useEffect(() => {
    setNavigation((current) => {
      const expected = current.entries[current.index];
      if (applyingNavigationRef.current) {
        if (sameLocation(expected, currentLocation)) {
          applyingNavigationRef.current = false;
        }
        return current;
      }
      if (sameLocation(expected, currentLocation)) {
        return current;
      }
      const entries = [
        ...current.entries.slice(0, current.index + 1),
        currentLocation,
      ];
      return { entries, index: entries.length - 1 };
    });
  }, [currentLocation.taskId, currentLocation.view]);

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      saveSidebarCollapsed(next);
      return next;
    });
  }

  function applyLocation(location: AppLocation) {
    setView(location.view);
    if (location.view !== "work") {
      return;
    }
    setSelectedTabId(location.taskId);
    if (location.taskId) {
      if (activeTask?.taskId !== location.taskId) {
        void store.getState().openTask(location.taskId);
      }
    } else {
      store.getState().clearActiveTask();
    }
  }

  function updateLocation(
    location: AppLocation,
    updateNavigation: () => void,
  ) {
    const changesComposerPosition =
      currentLocation.view === "work" &&
      location.view === "work" &&
      Boolean(currentLocation.taskId) !== Boolean(location.taskId);
    if (changesComposerPosition) {
      setComposerMotion(location.taskId ? "to-task" : "to-home");
    }
    updateNavigation();
    applyLocation(location);
  }

  function navigateTo(location: AppLocation) {
    if (sameLocation(currentLocation, location)) {
      return;
    }
    const entries = [
      ...navigation.entries.slice(0, navigation.index + 1),
      location,
    ];
    updateLocation(location, () => {
      applyingNavigationRef.current = true;
      setNavigation({ entries, index: entries.length - 1 });
    });
  }

  function moveInHistory(offset: -1 | 1) {
    const targetIndex = navigation.index + offset;
    const target = navigation.entries[targetIndex];
    if (!target) {
      return;
    }
    updateLocation(target, () => {
      applyingNavigationRef.current = true;
      setNavigation({ ...navigation, index: targetIndex });
    });
  }

  function openBlankConversation() {
    saveActiveProject(undefined);
    setSelectedTabId(undefined);
    setHomeRevision((revision) => revision + 1);
    navigateTo({ view: "work" });
  }

  function openTaskInTab(taskId: string) {
    setSelectedTabId(taskId);
    setOpenTabIds((taskIds) =>
      taskIds.includes(taskId) ? taskIds : [...taskIds, taskId],
    );
    navigateTo({ view: "work", taskId });
  }

  function closeConversationTab(taskId: string) {
    const closingIndex = openTabIds.indexOf(taskId);
    const nextTabIds = openTabIds.filter((item) => item !== taskId);
    setOpenTabIds(nextTabIds);
    if (view !== "work" || selectedTabId !== taskId) return;
    const nextTaskId =
      nextTabIds[Math.min(Math.max(closingIndex, 0), nextTabIds.length - 1)];
    if (nextTaskId) {
      navigateTo({ view: "work", taskId: nextTaskId });
    } else {
      openBlankConversation();
    }
  }

  function openNewProjectConversation(project: ProjectDirectory) {
    saveActiveProject(project);
    saveProjectName(project.path, project.name);
    setProjectNames((names) => ({ ...names, [project.path]: project.name }));
    setHomeRevision((revision) => revision + 1);
    navigateTo({ view: "work" });
    notify(`已创建项目：${project.name}`, "success");
  }

  function openConversationInProject(project: ProjectDirectory) {
    saveActiveProject(project);
    saveProjectName(project.path, project.name);
    setProjectNames((names) => ({ ...names, [project.path]: project.name }));
    setHomeRevision((revision) => revision + 1);
    navigateTo({ view: "work" });
    notify(`已在 ${project.name} 下新建会话`, "success");
  }

  function startSidebarResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    stopSidebarResizeRef.current();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    let currentWidth = sidebarWidth;
    let dragCollapsed = sidebarCollapsed;
    let resizing = true;
    let resizeFrame: number | undefined;
    const shell = shellRef.current;

    document.body.classList.add("resizing-sidebar");
    function handleMove(moveEvent: PointerEvent) {
      const requestedWidth = startWidth + moveEvent.clientX - startX;
      currentWidth = clampSidebarWidth(requestedWidth);
      const nextCollapsed = shouldCollapseSidebarOnDrag(requestedWidth);
      if (nextCollapsed !== dragCollapsed) {
        dragCollapsed = nextCollapsed;
        setSidebarCollapsed(nextCollapsed);
        saveSidebarCollapsed(nextCollapsed);
      }
      if (nextCollapsed) {
        if (resizeFrame !== undefined) {
          window.cancelAnimationFrame(resizeFrame);
          resizeFrame = undefined;
        }
        shell?.style.setProperty("--sidebar-width", `${currentWidth}px`);
        return;
      }
      if (resizeFrame !== undefined) {
        return;
      }
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = undefined;
        shell?.style.setProperty("--sidebar-width", `${currentWidth}px`);
      });
    }
    function stopResize() {
      finishResize();
    }
    function finishResize() {
      if (!resizing) return;
      resizing = false;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      if (resizeFrame !== undefined) {
        window.cancelAnimationFrame(resizeFrame);
      }
      shell?.style.setProperty("--sidebar-width", `${currentWidth}px`);
      document.body.classList.remove("resizing-sidebar");
      setSidebarWidth(currentWidth);
      saveSidebarWidth(currentWidth);
      stopSidebarResizeRef.current = () => undefined;
    }
    stopSidebarResizeRef.current = stopResize;
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  const windowChrome = (
    <WindowChrome
      canGoBack={navigation.index > 0}
      canGoForward={navigation.index < navigation.entries.length - 1}
      sidebarCollapsed={sidebarCollapsed}
      activeTaskId={view === "work" ? selectedTabId : undefined}
      conversationHubActive={view === "conversationHub"}
      conversationTabs={conversationTabs}
      onGoBack={() => moveInHistory(-1)}
      onGoForward={() => moveInHistory(1)}
      onShowConversationHub={() => navigateTo({ view: "conversationHub" })}
      onNewConversation={openBlankConversation}
      onOpenTab={openTaskInTab}
      onCloseTab={closeConversationTab}
      onResizeStart={startSidebarResize}
      onToggleSidebar={toggleSidebar}
    />
  );

  if (view === "settings") {
    const archivedTaskIdSet = new Set(archivedTaskIds);
    const archivedTasks = recentTasks.filter((task) =>
      archivedTaskIdSet.has(task.taskId),
    );
    return (
      <div
        ref={shellRef}
        className={`settings-window-shell${
          sidebarCollapsed ? " sidebar-collapsed" : ""
        }`}
        style={shellStyle}
      >
        {windowChrome}
        <SettingsPage
          api={modelApi}
          cloudApi={cloudApi}
          memoryApi={memoryApi}
          mcpApi={mcpApi}
          skillApi={skillApi}
          workspacePath={activeTask ? taskProjectPaths[activeTask.taskId] : undefined}
          archivedTasks={archivedTasks}
          taskProjectPaths={taskProjectPaths}
          projectNames={projectNames}
          notify={notify}
          onBack={() =>
            navigateTo({ view: "work", taskId: activeTask?.taskId })
          }
          onRestoreTask={(taskId) => store.getState().restoreTask(taskId)}
          onDeleteTask={(taskId) =>
            store.getState().deleteArchivedTask(taskId)
          }
          onDeleteAllTasks={() =>
            store.getState().deleteAllArchivedTasks()
          }
        />
        <ToastViewport
          notice={notice}
          onDismiss={() => setNotice(undefined)}
        />
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className={`app-shell${
        sidebarCollapsed ? " sidebar-collapsed" : ""
      }`}
      style={shellStyle}
    >
      {windowChrome}
      <AppSidebar
        activeTaskId={activeTask?.taskId}
        processingTaskIds={processingTaskIds}
        activeView={activeView}
        isLoadingHistory={isLoadingHistory}
        recentTasks={recentTasks}
        taskProjectPaths={taskProjectPaths}
        projectNames={projectNames}
        archivedTaskIds={archivedTaskIds}
        onArchiveTask={(taskId) => store.getState().archiveTask(taskId)}
        onNewProject={openNewProjectConversation}
        onNewProjectConversation={openConversationInProject}
        onNavigate={(nextView) => navigateTo({ view: nextView })}
        notify={notify}
        onNewTask={openBlankConversation}
        onSettings={() => navigateTo({ view: "settings" })}
        onOpenTask={openTaskInTab}
      />
      {view === "automations" ||
        view === "skills" ? (
        <PrototypePage view={view} notify={notify} />
      ) : view === "conversationHub" ? (
        <ConversationHubPage
          tasks={activeTasks}
          taskProjectPaths={taskProjectPaths}
          projectNames={projectNames}
          onNewProject={openNewProjectConversation}
          onNewConversation={(project) =>
            project
              ? openConversationInProject(project)
              : openBlankConversation()
          }
          onOpenTask={openTaskInTab}
        />
      ) : activeTask ? (
        <TaskPage
          store={store}
          cloudApi={cloudApi}
          modelApi={modelApi}
          skillApi={skillApi}
          workspaceApi={workspaceApi}
          notify={notify}
          composerMotion={
            composerMotion === "to-task" ? "from-center" : undefined
          }
        />
      ) : (
        <HomePage
          key={homeRevision}
          store={store}
          cloudApi={cloudApi}
          modelApi={modelApi}
          notify={notify}
          workspaceApi={workspaceApi}
          composerMotion={
            composerMotion === "to-home" ? "from-bottom" : undefined
          }
        />
      )}
      <ToastViewport
        notice={notice}
        onDismiss={() => setNotice(undefined)}
      />
    </div>
  );
}

function sameLocation(
  first: AppLocation | undefined,
  second: AppLocation,
): boolean {
  return first?.view === second.view && first.taskId === second.taskId;
}

function DesktopBridgeError() {
  return (
    <main className="desktop-bridge-error">
      <strong>桌面能力加载失败</strong>
      <p>请完全退出 Electron 后重新启动开发进程。</p>
    </main>
  );
}
