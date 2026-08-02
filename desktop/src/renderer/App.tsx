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
import type { LumoraTaskApi } from "../shared/task-contract";
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
import { TaskPage } from "./features/tasks/TaskPage";
import { createTaskStore } from "./features/tasks/task-store";
import {
  clampSidebarWidth,
  loadSidebarCollapsed,
  loadSidebarWidth,
  saveSidebarCollapsed,
  saveSidebarWidth,
} from "./features/layout/sidebar-preferences";

interface AppProps {
  api?: LumoraTaskApi;
  modelApi?: LumoraModelApi;
}

type AppView = "work" | "settings" | PrototypeView;

interface AppLocation {
  view: AppView;
  taskId?: string;
}

interface NavigationState {
  entries: AppLocation[];
  index: number;
}

export function App({ api, modelApi }: AppProps) {
  const resolvedTaskApi = api ?? window.lumora?.tasks;
  const resolvedModelApi = modelApi ?? window.lumora?.model;
  if (!resolvedTaskApi) {
    return <DesktopBridgeError />;
  }
  return (
    <ConnectedApp api={resolvedTaskApi} modelApi={resolvedModelApi} />
  );
}

function ConnectedApp({ api, modelApi }: Required<Pick<AppProps, "api">> & {
  modelApi?: LumoraModelApi;
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
  const [view, setView] = useState<AppView>("work");
  const [notice, setNotice] = useState<ToastNotice>();
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    loadSidebarCollapsed,
  );
  const [navigation, setNavigation] = useState<NavigationState>({
    entries: [{ view: "work" }],
    index: 0,
  });
  const applyingNavigationRef = useRef(false);
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

  function navigateTo(location: AppLocation) {
    if (sameLocation(currentLocation, location)) {
      return;
    }
    const entries = [
      ...navigation.entries.slice(0, navigation.index + 1),
      location,
    ];
    applyingNavigationRef.current = true;
    setNavigation({ entries, index: entries.length - 1 });
    applyLocation(location);
  }

  function moveInHistory(offset: -1 | 1) {
    const targetIndex = navigation.index + offset;
    const target = navigation.entries[targetIndex];
    if (!target) {
      return;
    }
    applyingNavigationRef.current = true;
    setNavigation({ ...navigation, index: targetIndex });
    applyLocation(target);
  }

  function startSidebarResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    stopSidebarResizeRef.current();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    let currentWidth = sidebarWidth;

    document.body.classList.add("resizing-sidebar");
    const handleMove = (moveEvent: PointerEvent) => {
      currentWidth = clampSidebarWidth(
        startWidth + moveEvent.clientX - startX,
      );
      setSidebarWidth(currentWidth);
    };
    const stopResize = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      document.body.classList.remove("resizing-sidebar");
      saveSidebarWidth(currentWidth);
      stopSidebarResizeRef.current = () => undefined;
    };
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
        className={`settings-window-shell${
          sidebarCollapsed ? " sidebar-collapsed" : ""
        }`}
        style={shellStyle}
      >
        {windowChrome}
        <SettingsPage
          api={modelApi}
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
      className={`app-shell${
        sidebarCollapsed ? " sidebar-collapsed" : ""
      }`}
      style={shellStyle}
    >
      {windowChrome}
      <AppSidebar
        activeTaskId={activeTask?.taskId}
        activeView={activeView}
        isLoadingHistory={isLoadingHistory}
        recentTasks={recentTasks}
        taskProjectPaths={taskProjectPaths}
        archivedTaskIds={archivedTaskIds}
        onArchiveTask={(taskId) => store.getState().archiveTask(taskId)}
        onNavigate={(nextView) => navigateTo({ view: nextView })}
        notify={notify}
        onNewTask={() => {
          navigateTo({ view: "work" });
        }}
        onSettings={() => navigateTo({ view: "settings" })}
        onOpenTask={(taskId) => {
          navigateTo({ view: "work", taskId });
        }}
      />
      {view === "workspaces" ||
        view === "automations" ||
        view === "skills" ? (
        <PrototypePage view={view} notify={notify} />
      ) : activeTask ? (
        <TaskPage store={store} notify={notify} />
      ) : (
        <HomePage
          store={store}
          notify={notify}
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
