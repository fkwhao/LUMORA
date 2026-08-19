import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "../../src/renderer/App";
import {
  PROJECT_NAMES_STORAGE_KEY,
  TASK_PROJECT_PATHS_STORAGE_KEY,
} from "../../src/renderer/constants/storage";
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
    localStorage.setItem(
      TASK_PROJECT_PATHS_STORAGE_KEY,
      JSON.stringify({ "task-archive-1": "F:\\project\\LUMORA" }),
    );
    localStorage.setItem(
      PROJECT_NAMES_STORAGE_KEY,
      JSON.stringify({ "F:\\project\\LUMORA": "LUMORA" }),
    );
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

    expect(
      screen.getByRole("combobox", { name: "筛选归档项目" }),
    ).toBeVisible();
    const projectGroup = screen.getByRole("region", {
      name: "归档项目：LUMORA",
    });
    const unscopedGroup = screen.getByRole("region", {
      name: "归档项目：无项目",
    });
    expect(within(projectGroup).getByText("整理项目文档")).toBeVisible();
    expect(within(projectGroup).getByText("1 个任务")).toBeVisible();
    expect(within(unscopedGroup).getByText("检查代码规范")).toBeVisible();
    expect(within(unscopedGroup).getByText("1 个任务")).toBeVisible();

    fireEvent.click(
      within(projectGroup).getByRole("button", { name: "取消归档" }),
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
    updateWorkspace: vi.fn(async (input) => ({
      ...snapshot(input.taskId),
      workspacePath: input.workspacePath,
    })),
    updatePreferences: vi.fn(async (input) => ({
      ...snapshot(input.taskId),
      selectedModel: input.model,
      selectedReasoningEffort: input.reasoningEffort,
    })),
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
