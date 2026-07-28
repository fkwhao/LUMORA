import { describe, expect, it, vi } from "vitest";

import type {
  LumoraTaskApi,
  TaskEvent,
  TaskSnapshot,
} from "../../src/shared/task-contract";
import { createTaskStore } from "../../src/renderer/features/tasks/task-store";

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

describe("task store", () => {
  it("rejects an empty goal before calling the process boundary", async () => {
    const api = createApi();
    const store = createTaskStore(api);

    await expect(store.getState().createTask("   ")).rejects.toThrow("任务目标不能为空");
    expect(api.create).not.toHaveBeenCalled();
  });

  it("ignores duplicate events after applying the newest sequence", async () => {
    const api = createApi();
    const store = createTaskStore(api);
    await store.getState().createTask("整理下载目录");

    const applyEvent = vi.mocked(api.subscribe).mock.calls[0]?.[1];
    expect(applyEvent).toBeDefined();

    applyEvent?.(event(2, "RUNNING", "整理任务材料"));
    applyEvent?.(event(1, "PLANNING", "理解目标"));
    applyEvent?.(event(2, "RUNNING", "重复事件"));

    expect(store.getState().activeTask?.lastEventSequence).toBe(2);
    expect(store.getState().activeTask?.activeStep).toBe("整理任务材料");
  });

  it("clears a pending approval when a terminal event arrives", async () => {
    const api = createApi();
    const store = createTaskStore(api);
    await store.getState().createTask("整理下载目录");
    const applyEvent = vi.mocked(api.subscribe).mock.calls[0]?.[1];

    applyEvent?.({
      ...event(1, "WAITING_APPROVAL", "确认敏感操作"),
      type: "APPROVAL_REQUESTED",
      approval: {
        approvalId: "approval-1",
        taskId: "task-1",
        action: "整理文件",
        impactSummary: "移动 12 个文件",
        riskLevel: "MEDIUM",
        reversible: true,
      },
    });
    applyEvent?.({
      ...event(2, "COMPLETED", "任务已完成"),
      type: "RESULT_AVAILABLE",
    });

    expect(store.getState().activeTask?.approval).toBeUndefined();
  });
});

function createApi(): LumoraTaskApi {
  return {
    create: vi.fn(async () => createdTask),
    get: vi.fn(async () => createdTask),
    subscribe: vi.fn(() => () => undefined),
    decideApproval: vi.fn(async () => createdTask),
  };
}

function event(
  sequence: number,
  status: TaskSnapshot["status"],
  title: string,
): TaskEvent {
  return {
    taskId: "task-1",
    sequence,
    type: "STATUS_CHANGED",
    status,
    title,
    userMessage: title,
  };
}
