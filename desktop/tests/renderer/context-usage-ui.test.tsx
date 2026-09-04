import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { TaskPage } from "../../src/renderer/features/tasks/TaskPage";
import { createTaskStore } from "../../src/renderer/features/tasks/task-store";
import { createContextUsageState } from "../../src/renderer/features/tasks/state/context-usage";
import { applyChatEvent } from "../../src/renderer/features/tasks/state/chat-event-handler";
import type { ChatMessage, LumoraModelApi } from "../../src/shared/model-contract";
import type { LumoraTaskApi, TaskSnapshot } from "../../src/shared/task-contract";

it("renders the same settled snapshot in the context ring and usage pane during tool-stage changes", () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  const task: TaskSnapshot = {
    taskId: "context-ui",
    goal: "检查上下文快照",
    status: "RUNNING",
    lastEventSequence: 0,
    activeStep: "",
    resultSummary: "",
    planSteps: [],
  };
  const messages: ChatMessage[] = [
    { role: "user", content: "编辑文件" },
    { role: "assistant", content: "正在处理", activeContextTokens: 4_000 },
  ];
  const store = createTaskStore({} as LumoraTaskApi);
  store.setState({
    activeTask: task,
    isChatting: true,
    messages,
    contextUsage: createContextUsageState(messages),
  });
  const { container } = render(<TaskPage store={store} notify={vi.fn()} />);
  const ring = container.querySelector(".context-usage-value");
  expect(ring).toHaveAttribute("stroke-dasharray", "3 100");
  expect(screen.getByRole("tooltip")).toHaveTextContent("已用约 4k 标记");

  act(() => {
    store.setState({ messages: [messages[0]!, {
      ...messages[1]!,
      content: "正在分析文件".repeat(1_000),
      activeContextTokens: 90_000,
    }] });
  });
  expect(ring).toHaveAttribute("stroke-dasharray", "3 100");
  act(() => {
    store.setState({ messages: [messages[0]!, { ...messages[1]!, content: "" }] });
  });
  expect(ring).toHaveAttribute("stroke-dasharray", "3 100");
  fireEvent.click(screen.getByRole("button", { name: "上下文已用" }));
  expect(screen.getByText("约 3%")).toBeVisible();

  act(() => {
    for (const event of [
      { type: "protocol_message" as const, metadata: { message: { role: "assistant" } } },
      { type: "usage" as const, activeContextTokens: 25_600 },
    ]) {
      applyChatEvent(
        { delta: "", model: "demo", errorMessage: "", ...event },
        task.taskId,
        {} as LumoraModelApi,
        store.getState,
        store.setState,
        vi.fn(),
      );
    }
  });
  expect(ring).toHaveAttribute("stroke-dasharray", "20 100");
  expect(screen.getByText("约 20%")).toBeVisible();
});
