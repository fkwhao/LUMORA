import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TaskPage } from "../../src/renderer/features/tasks/TaskPage";
import { createTaskStore } from "../../src/renderer/features/tasks/task-store";
import type { LumoraModelApi } from "../../src/shared/model-contract";
import type { LumoraTaskApi, TaskSnapshot } from "../../src/shared/task-contract";

const task: TaskSnapshot = {
  taskId: "task-citations",
  goal: "Explain transformers",
  status: "COMPLETED",
  lastEventSequence: 0,
  activeStep: "",
  resultSummary: "",
  planSteps: [],
};

afterEach(cleanup);

describe("inline citations", () => {
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

  it("renders citation marks and opens the source in a right-sidebar tab", async () => {
    const messages = [
      { messageId: "user-1", role: "user" as const, content: task.goal },
      {
        messageId: "assistant-1",
        parentMessageId: "user-1",
        role: "assistant" as const,
        content: [
          "Transformers scale well with data and compute[1].",
          "",
          '[1]: https://arxiv.org/abs/1706.03762 "Attention Is All You Need"',
        ].join("\n"),
      },
    ];
    const taskApi = {
      create: vi.fn(),
      list: vi.fn(async () => []),
      get: vi.fn(async () => task),
      subscribe: vi.fn(() => () => undefined),
      decideApproval: vi.fn(),
    } as unknown as LumoraTaskApi;
    const modelApi = {
      getSettings: vi.fn(async () => ({
        providerName: "demo",
        baseUrl: "http://localhost",
        model: "demo",
        apiKeyConfigured: false,
        models: [],
        contextWindow: 128_000,
      })),
      listMessages: vi.fn(async () => messages),
    } as unknown as LumoraModelApi;
    const store = createTaskStore(taskApi, modelApi);
    store.setState({
      activeTask: task,
      messages,
    });

    render(<TaskPage store={store} modelApi={modelApi} notify={vi.fn()} />);

    const citation = await screen.findByRole("button", {
      name: "查看引用 1：Attention Is All You Need",
    });
    expect(screen.getAllByRole("button", { name: /Attention Is All You Need/ }))
      .toHaveLength(2);

    fireEvent.click(citation);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Attention Is All You Need/ }))
        .toHaveAttribute("aria-selected", "true");
    });
    expect(screen.getByText("arxiv.org/abs/1706.03762")).toBeInTheDocument();
  });
});
