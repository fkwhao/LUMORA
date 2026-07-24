import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "../../src/renderer/App";
import type {
  LumoraTaskApi,
  TaskEvent,
  TaskSnapshot,
} from "../../src/shared/task-contract";

describe("visible task flow", () => {
  it("moves from goal input to an approval decision", async () => {
    let onEvent: ((event: TaskEvent) => void) | undefined;
    const createdTask: TaskSnapshot = {
      taskId: "task-1",
      goal: "整理下载目录",
      status: "CREATED",
      lastEventSequence: 0,
      activeStep: "",
      resultSummary: "",
    };
    const api: LumoraTaskApi = {
      create: vi.fn(async () => createdTask),
      get: vi.fn(async () => createdTask),
      subscribe: vi.fn((_taskId, listener) => {
        onEvent = listener;
        return () => undefined;
      }),
      decideApproval: vi.fn(async () => ({
        ...createdTask,
        status: "COMPLETED" as const,
        resultSummary: "任务材料已整理完成",
      })),
    };

    render(<App api={api} />);

    fireEvent.change(screen.getByRole("textbox", { name: "任务目标" }), {
      target: { value: "整理下载目录" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始任务" }));

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "整理下载目录",
      }),
    ).toBeVisible();

    act(() => {
      onEvent?.({
        taskId: "task-1",
        sequence: 1,
        type: "APPROVAL_REQUESTED",
        status: "WAITING_APPROVAL",
        title: "确认敏感操作",
        userMessage: "LUMORA 想整理下载目录中的 12 个文件",
        approval: {
          approvalId: "approval-1",
          taskId: "task-1",
          action: "整理文件",
          impactSummary: "移动 12 个文件到分类目录",
          riskLevel: "MEDIUM",
          reversible: true,
        },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "仅允许本次" }));

    expect(api.decideApproval).toHaveBeenCalledWith({
      taskId: "task-1",
      approvalId: "approval-1",
      decision: "ALLOW_ONCE",
    });
  });
});
