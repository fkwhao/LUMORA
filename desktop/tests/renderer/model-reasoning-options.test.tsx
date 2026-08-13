import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskPage } from "../../src/renderer/features/tasks/TaskPage";
import { createTaskStore } from "../../src/renderer/features/tasks/task-store";
import type { LumoraModelApi } from "../../src/shared/model-contract";
import type { LumoraTaskApi, TaskSnapshot } from "../../src/shared/task-contract";

const task: TaskSnapshot = {
  taskId: "task-reasoning",
  goal: "Reason about the task",
  status: "COMPLETED",
  lastEventSequence: 0,
  activeStep: "",
  resultSummary: "",
  planSteps: [],
};

describe("model-specific reasoning options", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("shows the configured fields at regular window widths", async () => {
    const { store, modelApi } = createHarness(["none", "low", "ultra"]);
    render(<TaskPage store={store} modelApi={modelApi} notify={vi.fn()} />);

    const trigger = await screen.findByRole("button", {
      name: "选择模型和推理强度",
    });
    await waitFor(() =>
      expect(trigger).toHaveTextContent("deepseek-reasoner关闭"),
    );
    fireEvent.click(trigger);
    expect(
      screen.queryByRole("menu", { name: "选择模型" }),
    ).not.toBeInTheDocument();
    fireEvent.pointerEnter(
      screen.getByRole("button", { name: /^模型/ }),
    );
    const modelMenu = await screen.findByRole("menu", { name: "选择模型" });
    expect(modelMenu).toBeInTheDocument();
    expect(modelMenu).toHaveClass("is-model");
    expect(modelApi.listModels).not.toHaveBeenCalled();

    fireEvent.pointerEnter(
      screen.getByRole("button", { name: /^推理强度/ }),
    );
    expect(
      await screen.findByRole("menu", { name: "选择推理强度" }),
    ).toHaveClass("is-reasoning");
  });

  it("restores the last model and its reasoning strength for the conversation", async () => {
    const firstHarness = createHarness(["none", "low", "ultra"]);
    render(
      <TaskPage
        store={firstHarness.store}
        modelApi={firstHarness.modelApi}
        notify={vi.fn()}
      />,
    );

    const firstTrigger = await screen.findByRole("button", {
      name: "选择模型和推理强度",
    });
    fireEvent.click(firstTrigger);
    fireEvent.pointerEnter(
      screen.getByRole("button", { name: /^推理强度/ }),
    );
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: /ultra/i }),
    );
    fireEvent.click(firstTrigger);
    fireEvent.pointerEnter(screen.getByRole("button", { name: /^模型/ }));
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "deepseek-chat" }),
    );
    cleanup();

    const secondHarness = createHarness(["none", "low", "ultra"]);
    render(
      <TaskPage
        store={secondHarness.store}
        modelApi={secondHarness.modelApi}
        notify={vi.fn()}
      />,
    );

    const restoredTrigger = await screen.findByRole("button", {
      name: "选择模型和推理强度",
    });
    await waitFor(() =>
      expect(restoredTrigger).toHaveTextContent("deepseek-chat"),
    );

    fireEvent.click(restoredTrigger);
    fireEvent.pointerEnter(screen.getByRole("button", { name: /^模型/ }));
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "deepseek-reasoner" }),
    );
    await waitFor(() => expect(restoredTrigger).toHaveTextContent("ultra"));
  });

  it("hides reasoning controls for models without that capability", async () => {
    const { store, modelApi } = createHarness([]);
    render(<TaskPage store={store} modelApi={modelApi} notify={vi.fn()} />);

    await waitFor(() => expect(modelApi.getSettings).toHaveBeenCalled());
    const trigger = await screen.findByRole("button", {
      name: "选择模型和推理强度",
    });
    fireEvent.click(trigger);
    expect(screen.queryByText("推理强度")).not.toBeInTheDocument();
  });
});

function createHarness(reasoningEfforts: string[]) {
  const taskApi = {
    create: vi.fn(),
    list: vi.fn(async () => []),
    get: vi.fn(async () => task),
    updatePreferences: vi.fn(async (input) => ({
      ...task,
      selectedModel: input.model,
      selectedReasoningEffort: input.reasoningEffort,
    })),
    subscribe: vi.fn(() => () => undefined),
    decideApproval: vi.fn(),
  } as unknown as LumoraTaskApi;
  const modelApi = {
    listModels: vi.fn(async () => ["remote-only-model"]),
    getSettings: vi.fn(async () => ({
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-reasoner",
      apiKeyConfigured: true,
      contextWindow: 128_000,
      models: [
        {
          modelConfigurationId: "model-1",
          modelId: "deepseek-reasoner",
          contextWindow: 128_000,
          maxOutputTokens: 8_192,
          reasoningEfforts,
        },
        {
          modelConfigurationId: "model-2",
          modelId: "deepseek-chat",
          contextWindow: 128_000,
          maxOutputTokens: 8_192,
          reasoningEfforts: [],
        },
      ],
    })),
  } as unknown as LumoraModelApi;
  const store = createTaskStore(taskApi, modelApi);
  store.setState({ activeTask: task, messages: [] });
  return { store, modelApi };
}
