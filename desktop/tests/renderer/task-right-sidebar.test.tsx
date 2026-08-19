import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TaskRightSidebar,
  type TaskRightSidebarTab,
} from "../../src/renderer/features/tasks/components/TaskRightSidebar";

afterEach(cleanup);

const TABS: TaskRightSidebarTab[] = [
  { id: "context", kind: "context", label: "上下文", usagePercent: 28 },
  { id: "review", kind: "review", label: "审阅" },
  {
    id: "agent:architecture",
    kind: "agent",
    label: "负责整体架构检查的子 Agent Session",
    agentId: "architecture",
    status: "running",
  },
];

describe("TaskRightSidebar", () => {
  it("scrolls tabs horizontally and fades only long labels", () => {
    const { container } = render(
      <TaskRightSidebar
        open
        width={520}
        tabs={TABS}
        activeTabId="agent:architecture"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onOpenChange={vi.fn()}
        onWidthChange={vi.fn()}
        onWidthCommit={vi.fn()}
      >
        <p>Agent details</p>
      </TaskRightSidebar>,
    );

    const tablist = screen.getByRole("tablist", { name: "任务详情页签" });
    expect(tablist).toHaveClass("right-sidebar-tabbar");
    expect(
      screen.getByRole("tab", { name: "负责整体架构检查的子 Agent Session" }),
    ).toBeVisible();
    expect(container.querySelector(".right-sidebar-tab.has-long-label"))
      .toBeInTheDocument();

    Object.defineProperties(tablist, {
      clientWidth: { configurable: true, value: 180 },
      scrollWidth: { configurable: true, value: 540 },
    });
    fireEvent.wheel(tablist, { deltaX: 0, deltaY: 48 });
    expect(tablist.scrollLeft).toBe(48);
    expect(container.querySelector(".right-sidebar-tabs-shell"))
      .not.toHaveClass("can-scroll-left", "can-scroll-right");
  });
});
