import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "../../src/renderer/App";
import type {
  LumoraTaskApi,
  TaskSnapshot,
  TaskSummary,
} from "../../src/shared/task-contract";

const tasks: TaskSummary[] = [
  {
    taskId: "task-archive-1",
    goal: "整理项目文档",
    status: "COMPLETED",
    updatedAt: "2026-07-30T08:00:00Z",
  },
  {
    taskId: "task-archive-2",
    goal: "检查代码规范",
    status: "COMPLETED",
    updatedAt: "2026-07-30T07:00:00Z",
  },
];

describe("task archive flow", () => {
  it("archives from the task row and manages tasks in settings", async () => {
    localStorage.clear();
    const api = createApi();
    render(<App api={api} />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "归档会话：整理项目文档",
      }),
    );
    expect(screen.queryByText("整理项目文档")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "归档会话：检查代码规范",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(
      screen.getByRole("complementary", { name: "设置导航" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: /已归档任务/ }),
    );

    expect(screen.getByText("整理项目文档")).toBeVisible();
    expect(screen.getByText("检查代码规范")).toBeVisible();

    fireEvent.click(
      screen.getAllByRole("button", { name: "取消归档" })[0]!,
    );
    expect(screen.queryByText("整理项目文档")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "删除归档任务：检查代码规范",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "确认删除" }),
    );
    expect(screen.getByText("没有已归档任务")).toBeVisible();
    localStorage.clear();
  });
});

function createApi(): LumoraTaskApi {
  return {
    create: vi.fn(),
    list: vi.fn(async () => tasks),
    get: vi.fn(async (taskId) => snapshot(taskId)),
    subscribe: vi.fn(() => () => undefined),
    decideApproval: vi.fn(),
  };
}

function snapshot(taskId: string): TaskSnapshot {
  const task = tasks.find((item) => item.taskId === taskId) ?? tasks[0]!;
  return {
    ...task,
    lastEventSequence: 0,
    activeStep: "",
    resultSummary: "",
    planSteps: [],
  };
}
