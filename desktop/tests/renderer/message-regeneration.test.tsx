import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskPage } from "../../src/renderer/features/tasks/TaskPage";
import { createTaskStore } from "../../src/renderer/features/tasks/task-store";
import type { LumoraModelApi } from "../../src/shared/model-contract";
import type { LumoraTaskApi, TaskSnapshot } from "../../src/shared/task-contract";

describe("persisted message regeneration", () => {
  it("uses the real persisted parent message ID when reloading an answer", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    const task: TaskSnapshot = {
      taskId: "task-1",
      goal: "Explain context",
      status: "COMPLETED",
      lastEventSequence: 0,
      activeStep: "",
      resultSummary: "",
      planSteps: [],
    };
    const taskApi = {
      create: vi.fn(),
      list: vi.fn(async () => []),
      get: vi.fn(async () => task),
      subscribe: vi.fn(() => () => undefined),
      decideApproval: vi.fn(),
    } as unknown as LumoraTaskApi;
    const regenerateMessage = vi.fn(
      (
        _taskId: string,
        _messageId: string,
        _content: string,
        onEvent: (event: {
          type: "completed";
          delta: string;
          model: string;
          errorMessage: string;
        }) => void,
      ) => {
        queueMicrotask(() =>
          onEvent({
            type: "completed",
            delta: "",
            model: "demo",
            errorMessage: "",
          }),
        );
        return () => undefined;
      },
    );
    const modelApi = {
      getSettings: vi.fn(async () => ({
        providerName: "demo",
        baseUrl: "http://localhost",
        model: "demo",
        apiKeyConfigured: false,
        models: [],
        contextWindow: 128_000,
      })),
      listMessages: vi.fn(async () => [
        {
          messageId: "user-real-id",
          role: "user" as const,
          content: "Explain context",
        },
        {
          messageId: "answer-new-id",
          parentMessageId: "user-real-id",
          role: "assistant" as const,
          content: "Updated answer",
        },
      ]),
      regenerateMessage,
    } as unknown as LumoraModelApi;
    const store = createTaskStore(taskApi, modelApi);
    store.setState({
      activeTask: task,
      messages: [
        {
          messageId: "user-real-id",
          role: "user",
          content: "Explain context",
        },
        {
          messageId: "answer-real-id",
          parentMessageId: "user-real-id",
          role: "assistant",
          content: "Original answer",
        },
      ],
    });

    const { container } = render(
      <TaskPage
        store={store}
        modelApi={modelApi}
        notify={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "重新生成回复" }));

    await waitFor(() =>
      expect(regenerateMessage).toHaveBeenCalledWith(
        "task-1",
        "user-real-id",
        "Explain context",
        expect.any(Function),
        expect.any(Object),
      ),
    );

    await waitFor(() => expect(store.getState().isChatting).toBe(false));
    regenerateMessage.mockClear();
    fireEvent.click(
      screen.getByRole("button", { name: "编辑并重新发送消息" }),
    );
    let editInput: HTMLTextAreaElement | null = null;
    await waitFor(() => {
      editInput = container.querySelector<HTMLTextAreaElement>(
        ".aui-edit-composer-input",
      );
      expect(editInput).not.toBeNull();
    });
    const editSubmit = screen.getByRole("button", { name: "重新发送" });
    expect(editSubmit).toBeDisabled();
    expect(editSubmit).toHaveAttribute(
      "title",
      "内容未修改，请使用回答下方的重新生成",
    );
    fireEvent.change(editInput!, { target: { value: "Explain more context" } });
    expect(editSubmit).toBeEnabled();
    fireEvent.click(editSubmit);

    await waitFor(() =>
      expect(regenerateMessage).toHaveBeenCalledWith(
        "task-1",
        "user-real-id",
        "Explain more context",
        expect.any(Function),
        expect.any(Object),
      ),
    );
  });
});
