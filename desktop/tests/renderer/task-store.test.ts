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
  status: "CREATED",
  lastEventSequence: 0,
  activeStep: "",
  resultSummary: "",
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
