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
import type { LumoraMemoryApi } from "../shared/memory-contract";
import type { LumoraTaskApi } from "../shared/task-contract";
import type { ProjectDirectory } from "../shared/window-contract";
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
  modelApi?: LumoraModelApi;
  memoryApi?: LumoraMemoryApi;
}

type AppView = "work" | "settings" | PrototypeView;
type ComposerMotion = "to-task" | "to-home";

interface AppLocation {
  view: AppView;
  taskId?: string;
}

interface NavigationState {
  entries: AppLocation[];
  index: number;
}

export function App({ api, modelApi, memoryApi }: AppProps) {
  const resolvedTaskApi = api ?? window.lumora?.tasks;
  const resolvedModelApi = modelApi ?? window.lumora?.model;
  const resolvedMemoryApi = memoryApi ?? window.lumora?.memory;
  if (!resolvedTaskApi) {
    return <DesktopBridgeError />;
  }
  return (
    <ConnectedApp
      api={resolvedTaskApi}
      modelApi={resolvedModelApi}
      memoryApi={resolvedMemoryApi}
    />
  );
}

function ConnectedApp({
  api,
  modelApi,
  memoryApi,
}: Required<Pick<AppProps, "api">> & {
  modelApi?: LumoraModelApi;
  memoryApi?: LumoraMemoryApi;
}) {
  // Store 与能力边界绑定，切换测试 API 时不会泄漏旧任务订阅。
  const store = useMemo(
    () => createTaskStore(api, modelApi),
    [api, modelApi],
  );
  const activeTask = useStore(store, (state) => state.activeTask);
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
      : view;
  const currentLocation: AppLocation =
    view === "work"
      ? { view, taskId: activeTask?.taskId }
      : { view };

  useEffect(() => {
    void store.getState().loadRecentTasks();
  }, [store]);

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
    setHomeRevision((revision) => revision + 1);
    navigateTo({ view: "work" });
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
      onGoBack={() => moveInHistory(-1)}
      onGoForward={() => moveInHistory(1)}
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
          memoryApi={memoryApi}
          archivedTasks={archivedTasks}
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
        processingTaskId={isChatting ? activeTask?.taskId : undefined}
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
        onOpenTask={(taskId) => {
          navigateTo({ view: "work", taskId });
        }}
      />
      {view === "automations" ||
        view === "skills" ? (
        <PrototypePage view={view} notify={notify} />
      ) : activeTask ? (
        <TaskPage
          store={store}
          modelApi={modelApi}
          notify={notify}
          composerMotion={
            composerMotion === "to-task" ? "from-center" : undefined
          }
        />
      ) : (
        <HomePage
          key={homeRevision}
          store={store}
          notify={notify}
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
