import { useMemo } from "react";
import { useStore } from "zustand";

import type { LumoraTaskApi } from "../shared/task-contract";
import { AppSidebar } from "./components/AppSidebar";
import { HomePage } from "./features/tasks/HomePage";
import { TaskPage } from "./features/tasks/TaskPage";
import { createTaskStore } from "./features/tasks/task-store";

interface AppProps {
  api?: LumoraTaskApi;
}

export function App({ api = window.lumora.tasks }: AppProps) {
  // Store 与能力边界绑定，切换测试 API 时不会泄漏旧任务订阅。
  const store = useMemo(() => createTaskStore(api), [api]);
  const activeTask = useStore(store, (state) => state.activeTask);

  return (
    <div className="app-shell">
      <AppSidebar activeView={activeTask ? "task" : "home"} />
      {activeTask ? (
        <TaskPage store={store} />
      ) : (
        <HomePage store={store} />
      )}
    </div>
  );
}

