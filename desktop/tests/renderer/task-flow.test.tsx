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
      status: "PLANNING",
      lastEventSequence: 0,
      activeStep: "",
      resultSummary: "",
      planSteps: [
        {
          stepId: "step-1",
          title: "分析目录内容",
          description: "识别下载目录中的文件类型",
          requiresApproval: false,
        },
        {
          stepId: "step-2",
          title: "整理文件",
          description: "按类型移动文件到分类目录",
          requiresApproval: true,
        },
      ],
    };
    const api: LumoraTaskApi = {
      create: vi.fn(async () => createdTask),
      list: vi.fn(async () => []),
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

    fireEvent.click(
      screen.getByRole("button", { name: "收起侧边栏" }),
    );
    expect(
      screen.getByRole("button", { name: "展开侧边栏" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("textbox", { name: "告诉 LUMORA 你的目标" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "展开侧边栏" }),
    );

    expect(screen.queryByText("Agent 办公室")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "工作空间" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "选择项目文件夹" }),
    ).toBeVisible();
    const goalInput = screen.getByRole("textbox", {
      name: "告诉 LUMORA 你的目标",
    });
    fireEvent.change(goalInput, {
      target: { value: "整理下载目录" },
    });
    fireEvent.keyDown(goalInput, {
      key: "Enter",
      code: "Enter",
      shiftKey: true,
    });
    expect(api.create).not.toHaveBeenCalled();
    fireEvent.keyDown(goalInput, {
      key: "Enter",
      code: "Enter",
    });

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "整理下载目录",
      }),
    ).toBeVisible();
    expect(screen.queryByText("分析目录内容")).not.toBeInTheDocument();
    expect(screen.queryByText("整理文件")).not.toBeInTheDocument();
    expect(screen.queryByText("执行活动")).not.toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "上下文已用" })).toHaveAttribute(
      "aria-describedby",
      "context-usage-tooltip",
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      /背景信息窗口：约 0% 已用已用约 \d+ 标记，共 128k/,
    );
    const followUpInput = screen.getByRole("textbox", { name: "继续任务" });
    fireEvent.click(screen.getByRole("button", { name: "选择权限模式" }));
    expect(screen.getByText("应如何批准 LUMORA 操作？")).toBeVisible();
    fireEvent.pointerDown(followUpInput);
    expect(
      screen.queryByText("应如何批准 LUMORA 操作？"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "添加上下文" }));
    expect(screen.getByText("设置要持续追求的目标")).toBeVisible();
    fireEvent.pointerDown(followUpInput);
    expect(
      screen.queryByText("设置要持续追求的目标"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "审阅文件变更" }),
    );
    expect(
      screen.getByRole("complementary", { name: "变更审阅" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "关闭审阅" }));
    expect(
      screen.queryByRole("complementary", { name: "变更审阅" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "暂停" }),
    ).not.toBeInTheDocument();

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
