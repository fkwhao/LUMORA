import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/renderer/App";
import { WindowChrome } from "../../src/renderer/components/WindowChrome";
import { ConversationHubPage } from "../../src/renderer/features/tasks/ConversationHubPage";
import type {
  LumoraTaskApi,
  TaskSnapshot,
} from "../../src/shared/task-contract";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("collapsed sidebar conversation workspace", () => {
  it("shows open conversations as browser-like tabs", () => {
    const onShowConversationHub = vi.fn();
    const onNewConversation = vi.fn();
    const onOpenTab = vi.fn();
    const onCloseTab = vi.fn();

    render(
      <WindowChrome
        canGoBack={false}
        canGoForward={false}
        sidebarCollapsed
        activeTaskId="task-1"
        conversationTabs={[
          {
            taskId: "task-1",
            title: "确认项目可见性",
            projectName: "LUMORA",
          },
          {
            taskId: "task-2",
            title: "整理首页交互",
            projectName: "LUMORA",
          },
        ]}
        onGoBack={vi.fn()}
        onGoForward={vi.fn()}
        onShowConversationHub={onShowConversationHub}
        onNewConversation={onNewConversation}
        onOpenTab={onOpenTab}
        onCloseTab={onCloseTab}
        onResizeStart={vi.fn()}
        onToggleSidebar={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: /确认项目可见性/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "会话与项目" }));
    expect(onShowConversationHub).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("tab", { name: /整理首页交互/ }));
    expect(onOpenTab).toHaveBeenCalledWith("task-2");
    expect(screen.getByRole("tab", { name: /整理首页交互/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /确认项目可见性/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "关闭会话页签：确认项目可见性" }),
    );
    expect(onCloseTab).toHaveBeenCalledWith("task-1");
    fireEvent.click(screen.getByRole("button", { name: "新建会话" }));
    expect(onNewConversation).toHaveBeenCalledOnce();
  });

  it("filters conversations by project and opens them in tabs", () => {
    const onNewConversation = vi.fn();
    const onOpenTask = vi.fn();

    render(
      <ConversationHubPage
        tasks={[
          {
            taskId: "lumora-chat",
            goal: "确认项目可见性",
            status: "COMPLETED",
          },
          {
            taskId: "default-chat",
            goal: "整理临时想法",
            status: "COMPLETED",
          },
        ]}
        taskProjectPaths={{ "lumora-chat": "F:\\project\\LUMORA" }}
        projectNames={{ "F:\\project\\LUMORA": "LUMORA" }}
        onNewProject={vi.fn()}
        onNewConversation={onNewConversation}
        onOpenTask={onOpenTask}
      />,
    );

    expect(screen.getByText("确认项目可见性")).toBeVisible();
    expect(screen.queryByText("整理临时想法")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("确认项目可见性"));
    expect(onOpenTask).toHaveBeenCalledWith("lumora-chat");

    fireEvent.click(screen.getByRole("button", { name: /Default Project/ }));
    expect(screen.getByText("整理临时想法")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "新建会话" }));
    expect(onNewConversation).toHaveBeenCalledWith();

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索会话" }), {
      target: { value: "不存在" },
    });
    expect(screen.getByText("没有匹配的会话")).toBeVisible();
  });

  it("keeps the clicked tab selected while its conversation loads", async () => {
    const firstTask = createSnapshot("task-a", "Conversation A");
    const secondTask = createSnapshot("task-b", "Conversation B");
    let delayFirstTask = false;
    let resolveFirstTask: ((task: TaskSnapshot) => void) | undefined;
    const api: LumoraTaskApi = {
      create: vi.fn(async () => firstTask),
      list: vi.fn(async () => [firstTask, secondTask]),
      get: vi.fn(async (taskId) => {
        if (taskId === firstTask.taskId && delayFirstTask) {
          return new Promise<TaskSnapshot>((resolve) => {
            resolveFirstTask = resolve;
          });
        }
        return taskId === firstTask.taskId ? firstTask : secondTask;
      }),
      updateWorkspace: vi.fn(async (input) => ({
        ...(input.taskId === firstTask.taskId ? firstTask : secondTask),
        workspacePath: input.workspacePath,
      })),
      updatePreferences: vi.fn(async (input) => ({
        ...(input.taskId === firstTask.taskId ? firstTask : secondTask),
        selectedModel: input.model,
        selectedReasoningEffort: input.reasoningEffort,
      })),
      subscribe: vi.fn(() => () => undefined),
      decideApproval: vi.fn(async () => firstTask),
    };

    render(<App api={api} />);
    fireEvent.click(await screen.findByText("Conversation A"));
    await screen.findByRole("heading", { name: "Conversation A" });
    fireEvent.click(screen.getByText("Conversation B"));
    await screen.findByRole("heading", { name: "Conversation B" });
    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));

    delayFirstTask = true;
    fireEvent.click(screen.getByRole("tab", { name: /Conversation A/ }));
    const firstTab = screen.getByRole("tab", { name: /Conversation A/ });
    const secondTab = screen.getByRole("tab", { name: /Conversation B/ });
    expect(firstTab).toHaveAttribute("aria-selected", "true");
    expect(secondTab).toHaveAttribute("aria-selected", "false");

    await act(async () => Promise.resolve());
    expect(firstTab).toHaveAttribute("aria-selected", "true");
    expect(secondTab).toHaveAttribute("aria-selected", "false");

    resolveFirstTask?.(firstTask);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Conversation A" }),
      ).toBeVisible(),
    );
    expect(firstTab).toHaveAttribute("aria-selected", "true");
  });
});

function createSnapshot(taskId: string, goal: string): TaskSnapshot {
  return {
    taskId,
    goal,
    status: "COMPLETED",
    lastEventSequence: 0,
    activeStep: "",
    resultSummary: "",
    planSteps: [],
  };
}
