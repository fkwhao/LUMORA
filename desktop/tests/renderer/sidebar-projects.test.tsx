import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppSidebar } from "../../src/renderer/components/AppSidebar";

describe("project conversation sidebar", () => {
  it("groups project conversations and places unscoped conversations in recent", () => {
    const onNewTask = vi.fn();
    const onNewProject = vi.fn();
    const onNewProjectConversation = vi.fn();
    render(
      <AppSidebar
        activeView="home"
        recentTasks={[
          {
            taskId: "project-chat",
            goal: "规划 LUMORA 初始项目框架",
            status: "COMPLETED",
          },
          {
            taskId: "quick-chat",
            goal: "回复问候",
            status: "COMPLETED",
          },
        ]}
        taskProjectPaths={{ "project-chat": "F:\\project\\LUMORA" }}
        projectNames={{ "F:\\project\\LUMORA": "产品设计" }}
        archivedTaskIds={[]}
        isLoadingHistory={false}
        onNewTask={onNewTask}
        onNewProject={onNewProject}
        onNewProjectConversation={onNewProjectConversation}
        onNavigate={vi.fn()}
        onOpenTask={vi.fn()}
        onArchiveTask={vi.fn()}
        onSettings={vi.fn()}
        notify={vi.fn()}
      />,
    );

    const newTaskDock = screen
      .getByRole("button", { name: "新对话" })
      .closest<HTMLElement>(".new-task-sticky");
    const sidebarScroll = screen
      .getByRole("complementary", { name: "主导航" })
      .querySelector<HTMLElement>(".sidebar-scroll");
    expect(newTaskDock).not.toBeNull();
    expect(sidebarScroll).not.toBeNull();
    expect(newTaskDock?.nextElementSibling).toBe(sidebarScroll);
    expect(sidebarScroll).not.toContainElement(newTaskDock);
    expect(screen.getByText("项目")).toBeVisible();
    expect(screen.queryByText("无项目")).not.toBeInTheDocument();

    const projectGroup = screen
      .getByTitle("F:\\project\\LUMORA")
      .closest("section");
    expect(projectGroup).not.toBeNull();
    expect(
      within(projectGroup as HTMLElement).getByText("产品设计"),
    ).toBeVisible();
    expect(
      within(projectGroup as HTMLElement).getByText(
        "规划 LUMORA 初始项目框架",
      ),
    ).toBeVisible();
    fireEvent.click(
      within(projectGroup as HTMLElement).getByRole("button", {
        name: "在项目 产品设计 下新建会话",
      }),
    );
    expect(onNewProjectConversation).toHaveBeenCalledWith({
      name: "产品设计",
      path: "F:\\project\\LUMORA",
    });

    const projectToggle = within(projectGroup as HTMLElement).getByRole(
      "button",
      { name: "收起项目 产品设计 的会话", expanded: true },
    );
    fireEvent.click(projectToggle);
    expect(
      within(projectGroup as HTMLElement)
        .getByText("规划 LUMORA 初始项目框架")
        .closest(".project-task-list"),
    ).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(
      within(projectGroup as HTMLElement).getByRole("button", {
        name: "展开项目 产品设计 的会话",
        expanded: false,
      }),
    );
    expect(
      within(projectGroup as HTMLElement).getByText(
        "规划 LUMORA 初始项目框架",
      ),
    ).toBeVisible();
    expect(
      within(projectGroup as HTMLElement)
        .getByText("规划 LUMORA 初始项目框架")
        .closest(".project-task-list"),
    ).toHaveAttribute("aria-hidden", "false");

    const recentGroup = screen.getByText("最近").closest("section");
    expect(recentGroup).not.toBeNull();
    expect(
      within(recentGroup as HTMLElement).getByText("回复问候"),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
    expect(
      screen.getByRole("dialog", { name: "创建项目" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "关闭创建项目" }));
    fireEvent.click(
      screen.getByRole("button", { name: "新建无项目对话" }),
    );
    expect(onNewProject).not.toHaveBeenCalled();
    expect(onNewTask).toHaveBeenCalledOnce();

    fireEvent.click(
      screen.getByRole("button", { name: "项目", expanded: true }),
    );
    expect(
      screen
        .getByText("规划 LUMORA 初始项目框架")
        .closest(".sidebar-section-list"),
    ).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(
      screen.getByRole("button", { name: "最近", expanded: true }),
    );
    expect(
      screen.getByText("回复问候").closest(".sidebar-section-list"),
    ).toHaveAttribute("aria-hidden", "true");
  });

  it("shows an independent circular indicator for each processing conversation", () => {
    const { container } = render(
      <AppSidebar
        activeView="task"
        activeTaskId="project-running"
        processingTaskIds={new Set(["project-running", "recent-running"])}
        recentTasks={[
          {
            taskId: "project-running",
            goal: "分析项目文件",
            status: "RUNNING",
          },
          {
            taskId: "recent-running",
            goal: "生成产品文档",
            status: "RUNNING",
          },
          {
            taskId: "recent-idle",
            goal: "已完成的会话",
            status: "COMPLETED",
          },
        ]}
        taskProjectPaths={{ "project-running": "F:\\project\\LUMORA" }}
        projectNames={{ "F:\\project\\LUMORA": "LUMORA" }}
        archivedTaskIds={[]}
        isLoadingHistory={false}
        onNewTask={vi.fn()}
        onNewProject={vi.fn()}
        onNewProjectConversation={vi.fn()}
        onNavigate={vi.fn()}
        onOpenTask={vi.fn()}
        onArchiveTask={vi.fn()}
        onSettings={vi.fn()}
        notify={vi.fn()}
      />,
    );

    const indicators = screen.getAllByRole("status", { name: "正在处理" });
    expect(indicators).toHaveLength(2);
    expect(indicators.every((indicator) =>
      indicator.classList.contains("history-processing-indicator"),
    )).toBe(true);
    expect(container.querySelector(".history-processing-pixels")).toBeNull();
    expect(
      screen.getByText("已完成的会话").closest(".history-row"),
    ).not.toHaveClass("processing");
  });
});
