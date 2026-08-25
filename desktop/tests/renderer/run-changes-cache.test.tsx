import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TaskPage } from "../../src/renderer/features/tasks/TaskPage";
import { createTaskStore } from "../../src/renderer/features/tasks/task-store";
import type {
  ChatMessage,
  ConversationRunChanges,
  LumoraModelApi,
} from "../../src/shared/model-contract";
import type { LumoraTaskApi, TaskSnapshot } from "../../src/shared/task-contract";

const firstTask = task("task-1", "First task");
const secondTask = task("task-2", "Second task");
const firstMessages: ChatMessage[] = [
  {
    messageId: "user-1",
    role: "user",
    content: "Update the file",
  },
  {
    messageId: "assistant-1",
    parentMessageId: "user-1",
    role: "assistant",
    runId: "run-1",
    content: "The file has been updated.",
  },
];
const capturedChanges: ConversationRunChanges = {
  runId: "run-1",
  status: "CAPTURED",
  repositoryRoot: "C:/project",
  reason: "",
  additions: 1,
  deletions: 0,
  revertible: true,
  files: [
    {
      path: "src/main.ts",
      previousPath: "",
      status: "MODIFIED",
      additions: 1,
      deletions: 0,
      binary: false,
      patch: "+const ready = true;",
      patchTruncated: false,
    },
  ],
};

afterEach(cleanup);

describe("conversation run changes cache", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it("restores the edited-files card in the first render after switching back", async () => {
    const taskApi = {
      create: vi.fn(),
      list: vi.fn(async () => []),
      get: vi.fn(async (taskId: string) => taskId === firstTask.taskId
        ? firstTask
        : secondTask),
      subscribe: vi.fn(() => () => undefined),
      decideApproval: vi.fn(),
    } as unknown as LumoraTaskApi;
    const getRunChanges = vi.fn(async () => capturedChanges);
    const modelApi = {
      getSettings: vi.fn(async () => ({
        providerName: "demo",
        baseUrl: "http://localhost",
        model: "demo",
        apiKeyConfigured: false,
        models: [],
        contextWindow: 128_000,
      })),
      getRunChanges,
      listMessages: vi.fn(async () => []),
    } as unknown as LumoraModelApi;
    const store = createTaskStore(taskApi, modelApi);
    store.setState({ activeTask: firstTask, messages: firstMessages });

    render(<TaskPage store={store} modelApi={modelApi} notify={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("已编辑 1 个文件")).toBeInTheDocument();
    });
    expect(getRunChanges).toHaveBeenCalledTimes(1);

    act(() => {
      store.setState({
        activeTask: secondTask,
        messages: [{ messageId: "user-2", role: "user", content: "Second" }],
      });
    });
    expect(screen.queryByText("已编辑 1 个文件")).not.toBeInTheDocument();

    act(() => {
      store.setState({ activeTask: firstTask, messages: firstMessages });
    });

    expect(screen.getByText("已编辑 1 个文件")).toBeInTheDocument();
    expect(getRunChanges).toHaveBeenCalledTimes(1);
  });
});

function task(taskId: string, goal: string): TaskSnapshot {
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
