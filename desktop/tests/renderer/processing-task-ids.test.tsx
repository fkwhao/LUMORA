import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useProcessingTaskIds } from "../../src/renderer/features/tasks/state/use-processing-task-ids";
import type {
  ConversationRunSnapshot,
  ConversationRunStatus,
  LumoraModelApi,
} from "../../src/shared/model-contract";

const TASK_IDS = ["task-a", "task-b"];

describe("processing task activity", () => {
  it("discovers every active background run from Core", async () => {
    const modelApi = {
      getActiveRun: vi.fn(async (taskId: string) => run(taskId, "RUNNING")),
    } as unknown as LumoraModelApi;
    const { result } = renderHook(() =>
      useProcessingTaskIds({
        modelApi,
        taskIds: TASK_IDS,
        isChatting: false,
      }),
    );

    await waitFor(() =>
      expect(new Set(result.current)).toEqual(new Set(TASK_IDS)),
    );
    expect(modelApi.getActiveRun).toHaveBeenCalledWith("task-a");
    expect(modelApi.getActiveRun).toHaveBeenCalledWith("task-b");
  });

  it("keeps background tasks visible while another task starts processing", async () => {
    const { result, rerender } = renderHook(
      ({
        activeTaskId,
        activeRun,
        isChatting,
      }: {
        activeTaskId?: string;
        activeRun?: ConversationRunSnapshot;
        isChatting: boolean;
      }) =>
        useProcessingTaskIds({
          taskIds: TASK_IDS,
          activeTaskId,
          activeRun,
          isChatting,
        }),
      {
        initialProps: {
          activeTaskId: "task-a",
          activeRun: run("task-a", "RUNNING") as
            | ConversationRunSnapshot
            | undefined,
          isChatting: true,
        },
      },
    );

    await waitFor(() => expect([...result.current]).toEqual(["task-a"]));

    rerender({
      activeTaskId: "task-b",
      activeRun: undefined,
      isChatting: false,
    });
    expect([...result.current]).toEqual(["task-a"]);

    rerender({
      activeTaskId: "task-b",
      activeRun: run("task-b", "RUNNING"),
      isChatting: true,
    });
    await waitFor(() =>
      expect(new Set(result.current)).toEqual(new Set(["task-a", "task-b"])),
    );

    rerender({
      activeTaskId: "task-b",
      activeRun: run("task-b", "COMPLETED"),
      isChatting: false,
    });
    await waitFor(() => expect([...result.current]).toEqual(["task-a"]));
  });
});

function run(
  taskId: string,
  status: ConversationRunStatus,
): ConversationRunSnapshot {
  return {
    runId: `run-${taskId}`,
    taskId,
    status,
    triggerType: "MESSAGE",
    lastEventSequence: 0,
    replayFromSequence: 0,
    errorMessage: "",
    createdAt: "2026-08-17T00:00:00Z",
    updatedAt: "2026-08-17T00:00:00Z",
  };
}
