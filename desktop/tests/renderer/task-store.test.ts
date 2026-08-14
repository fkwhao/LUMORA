import { describe, expect, it, vi } from "vitest";

import type {
  ChatMessage,
  LumoraModelApi,
} from "../../src/shared/model-contract";
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

  it("loads persisted messages when opening a recent task", async () => {
    const api = createApi();
    vi.mocked(api.list).mockResolvedValue([
      {
        taskId: createdTask.taskId,
        goal: createdTask.goal,
        status: createdTask.status,
      },
    ]);
    const modelApi = createModelApi();
    const store = createTaskStore(api, modelApi);

    await store.getState().loadRecentTasks();
    await store.getState().openTask(createdTask.taskId);

    expect(store.getState().recentTasks).toHaveLength(1);
    expect(store.getState().activeTask?.taskId).toBe(createdTask.taskId);
    expect(store.getState().messages[1]).toMatchObject({
      role: "assistant",
      content: "可以开始整理。",
      durationMs: 2_100,
    });
  });

  it("shows recent messages first and progressively prepends long history", async () => {
    const api = createApi();
    const modelApi = createModelApi();
    const messages: ChatMessage[] = Array.from({ length: 80 }, (_, index) => ({
      messageId: `message-${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `history-${index}`,
    }));
    let resolveMessages: ((messages: ChatMessage[]) => void) | undefined;
    vi.mocked(modelApi.listMessages).mockImplementation(
      () =>
        new Promise<ChatMessage[]>((resolve) => {
          resolveMessages = resolve;
        }),
    );
    const store = createTaskStore(api, modelApi);

    const opening = store.getState().openTask(createdTask.taskId);
    resolveMessages?.(messages);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getState().isLoadingHistory).toBe(false);
    expect(store.getState().isHydratingHistory).toBe(true);
    expect(store.getState().messages.length).toBeLessThan(messages.length);
    expect(store.getState().messages.at(-1)?.content).toBe("history-79");

    await opening;
    expect(store.getState().messages).toEqual(messages);
    expect(store.getState().isHydratingHistory).toBe(false);
    expect(store.getState().historyHydrationProgress).toBe(1);
  });

  it("switches immediately, reuses cached conversations, and ignores stale loads", async () => {
    const firstTask = { ...createdTask, taskId: "task-a", goal: "Task A" };
    const secondTask = { ...createdTask, taskId: "task-b", goal: "Task B" };
    const api = createApi();
    vi.mocked(api.list).mockResolvedValue([firstTask, secondTask]);
    let resolveFirst: ((task: TaskSnapshot) => void) | undefined;
    let resolveSecond: ((task: TaskSnapshot) => void) | undefined;
    vi.mocked(api.get).mockImplementation(
      (taskId) =>
        new Promise<TaskSnapshot>((resolve) => {
          if (taskId === firstTask.taskId) resolveFirst = resolve;
          else resolveSecond = resolve;
        }),
    );
    const modelApi = createModelApi();
    vi.mocked(modelApi.listMessages).mockImplementation(async (taskId) =>
      Array.from({ length: taskId === firstTask.taskId ? 80 : 1 }, (_, index) => ({
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: index === 0 ? `message-${taskId}` : `history-${index}`,
      })),
    );
    const store = createTaskStore(api, modelApi);
    await store.getState().loadRecentTasks();

    const firstOpen = store.getState().openTask(firstTask.taskId);
    expect(store.getState().activeTask?.taskId).toBe(firstTask.taskId);
    const secondOpen = store.getState().openTask(secondTask.taskId);
    expect(store.getState().activeTask?.taskId).toBe(secondTask.taskId);

    resolveSecond?.(secondTask);
    await secondOpen;
    expect(store.getState().activeTask?.taskId).toBe(secondTask.taskId);
    resolveFirst?.(firstTask);
    await firstOpen;
    expect(store.getState().activeTask?.taskId).toBe(secondTask.taskId);

    const cachedOpen = store.getState().openTask(firstTask.taskId);
    expect(store.getState().activeTask?.taskId).toBe(firstTask.taskId);
    expect(store.getState().isLoadingHistory).toBe(false);
    expect(store.getState().isHydratingHistory).toBe(false);
    expect(store.getState().messages).toHaveLength(80);
    expect(store.getState().messages[0]?.content).toBe("message-task-a");
    resolveFirst?.(firstTask);
    await cachedOpen;
  });

  it("shows manual compaction as an independent processing record", async () => {
    const api = createApi();
    const modelApi = createModelApi();
    let finishCompaction: (() => void) | undefined;
    vi.mocked(modelApi.compactContext).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCompaction = () =>
            resolve({
              beforeTokens: 8_000,
              afterTokens: 2_800,
              usage: {
                promptTokens: 8_000,
                completionTokens: 800,
                totalTokens: 8_800,
              },
            });
        }),
    );
    vi.mocked(modelApi.listMessages)
      .mockResolvedValueOnce([
        { role: "user", content: "整理下载目录" },
        { role: "assistant", content: "可以开始整理。" },
      ])
      .mockResolvedValueOnce([
        { role: "user", content: "整理下载目录" },
        { role: "assistant", content: "可以开始整理。" },
        {
          role: "assistant",
          content: "",
          activeContextTokens: 2_800,
          workLog: [
            {
              itemId: "manual-context-compact-persisted",
              kind: "context",
              status: "completed",
              title: "已压缩上下文",
            },
          ],
        },
      ]);
    const store = createTaskStore(api, modelApi);
    await store.getState().openTask(createdTask.taskId);

    const pending = store.getState().compactContext();

    expect(store.getState().messages).toHaveLength(3);
    expect(store.getState().messages[1]?.workLog).toBeUndefined();
    expect(store.getState().messages[2]).toMatchObject({
      role: "assistant",
      content: "",
      workLog: [
        expect.objectContaining({
          itemId: expect.stringMatching(/^manual-context-compact-/),
          status: "running",
        }),
      ],
    });

    finishCompaction?.();
    await pending;

    expect(store.getState().messages[2]).toMatchObject({
      activeContextTokens: 2_800,
      workLog: [expect.objectContaining({ status: "completed" })],
    });
  });

  it("replaces the latest answer after editing the latest user message", async () => {
    const api = createApi();
    const modelApi = createModelApi();
    vi.mocked(modelApi.listMessages)
      .mockResolvedValueOnce([
        {
          messageId: "message-1",
          role: "user",
          content: "整理下载目录",
        },
        {
          messageId: "message-2",
          role: "assistant",
          content: "旧回答",
          durationMs: 800,
        },
      ])
      .mockResolvedValueOnce([
        {
          messageId: "message-1",
          role: "user",
          content: "只整理图片",
        },
        {
          messageId: "message-3",
          role: "assistant",
          content: "新回答",
          durationMs: 1_500,
        },
      ]);
    vi.mocked(modelApi.regenerateMessage).mockImplementation(
      (_taskId, _messageId, _content, onEvent) => {
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
    const store = createTaskStore(api, modelApi);
    await store.getState().openTask(createdTask.taskId);

    await store
      .getState()
      .regenerateMessage("message-1", "只整理图片", {
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
      });

    expect(modelApi.regenerateMessage).toHaveBeenCalledWith(
      createdTask.taskId,
      "message-1",
      "只整理图片",
      expect.any(Function),
      {
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
      },
    );
    expect(store.getState().messages).toEqual([
      expect.objectContaining({ content: "只整理图片" }),
      expect.objectContaining({
        content: "新回答",
        durationMs: 1_500,
      }),
    ]);
  });

  it("cancels an active streamed answer and keeps the sent message", async () => {
    const api = createApi();
    const modelApi = createModelApi();
    const cancel = vi.fn();
    vi.mocked(modelApi.streamMessage).mockReturnValue(cancel);
    const store = createTaskStore(api, modelApi);
    await store.getState().openTask(createdTask.taskId);

    const pendingSend = store.getState().sendMessage("继续整理文档");

    expect(store.getState().isChatting).toBe(true);
    expect(store.getState().messages.at(-2)).toMatchObject({
      role: "user",
      content: "继续整理文档",
    });

    store.getState().stopChat();
    await pendingSend;

    expect(cancel).toHaveBeenCalledOnce();
    expect(store.getState().isChatting).toBe(false);
    expect(store.getState().messages.at(-2)).toMatchObject({
      role: "user",
      content: "继续整理文档",
    });
    expect(store.getState().messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "",
    });
    expect(store.getState().chatWasStopped).toBe(true);
  });

  it("moves a streamed stage reply into the work log without a blank frame", async () => {
    const api = createApi();
    const modelApi = createModelApi();
    let onEvent: Parameters<LumoraModelApi["streamMessage"]>[2] | undefined;
    vi.mocked(modelApi.streamMessage).mockImplementation(
      (_taskId, _content, eventHandler) => {
        onEvent = eventHandler;
        return () => undefined;
      },
    );
    const store = createTaskStore(api, modelApi);
    await store.getState().openTask(createdTask.taskId);
    const pendingSend = store.getState().sendMessage("继续完成项目");
    const renderedStates: Array<{ content: string; progress?: string }> = [];
    const unsubscribe = store.subscribe((state) => {
      const assistant = state.messages.at(-1);
      renderedStates.push({
        content: assistant?.content ?? "",
        progress: assistant?.workLog?.find((item) => item.kind === "progress")
          ?.content,
      });
    });

    onEvent?.({
      type: "text_delta",
      delta: "环境已确认，接下来启动服务并验证。",
      model: "demo",
      errorMessage: "",
    });
    onEvent?.({
      type: "progress_message",
      delta: "环境已确认，接下来启动服务并验证。",
      model: "demo",
      errorMessage: "",
      itemId: "stage-1",
      metadata: { replacesAssistantContent: true },
    });
    onEvent?.({
      type: "text_reset",
      delta: "",
      model: "demo",
      errorMessage: "",
    });

    expect(store.getState().messages.at(-1)).toMatchObject({
      content: "",
      workLog: [
        expect.objectContaining({
          itemId: "stage-1",
          content: "环境已确认，接下来启动服务并验证。",
        }),
      ],
    });
    expect(renderedStates).not.toContainEqual({
      content: "",
      progress: undefined,
    });

    onEvent?.({
      type: "completed",
      delta: "",
      model: "demo",
      errorMessage: "",
    });
    unsubscribe();
    await pendingSend;
  });

  it("pauses on a tool approval event and forwards the human decision", async () => {
    const api = createApi();
    const modelApi = createModelApi();
    let onEvent: Parameters<LumoraModelApi["streamMessage"]>[2] | undefined;
    vi.mocked(modelApi.streamMessage).mockImplementation(
      (_taskId, _content, eventHandler) => {
        onEvent = eventHandler;
        queueMicrotask(() =>
          eventHandler({
            type: "tool_approval_requested",
            delta: "",
            model: "demo",
            errorMessage: "",
            approvalId: "approval-1",
            itemId: "item-1",
            toolCallId: "call-1",
            toolName: "shell_command",
            title: "git status",
            arguments: { command: "git status" },
            permissionLayer: "mode",
            reason: "当前权限模式要求用户确认",
            riskLevel: "MEDIUM",
            reversible: true,
          }),
        );
        return () => undefined;
      },
    );
    const store = createTaskStore(api, modelApi);
    await store.getState().openTask(createdTask.taskId);

    const pendingSend = store.getState().sendMessage("检查仓库");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getState().pendingToolApproval).toMatchObject({
      approvalId: "approval-1",
      toolName: "shell_command",
    });
    await store.getState().decideToolApproval("allow_once");
    expect(modelApi.decideToolApproval).toHaveBeenCalledWith(
      createdTask.taskId,
      "approval-1",
      "allow_once",
    );

    onEvent?.({
      type: "tool_approval_resolved",
      delta: "",
      model: "demo",
      errorMessage: "",
      approvalId: "approval-1",
      decision: "allow",
    });
    expect(store.getState().pendingToolApproval).toBeUndefined();
    onEvent?.({
      type: "completed",
      delta: "",
      model: "demo",
      errorMessage: "",
    });
    await pendingSend;
  });

  it("persists archived tasks locally and allows restoring them", async () => {
    localStorage.clear();
    const api = createApi();
    const store = createTaskStore(api);

    await store.getState().createTask("整理下载目录");
    store.getState().archiveTask(createdTask.taskId);

    expect(store.getState().activeTask).toBeUndefined();
    expect(store.getState().archivedTaskIds).toEqual([createdTask.taskId]);

    const restoredStore = createTaskStore(api);
    expect(restoredStore.getState().archivedTaskIds).toEqual([
      createdTask.taskId,
    ]);

    restoredStore.getState().restoreTask(createdTask.taskId);
    expect(restoredStore.getState().archivedTaskIds).toEqual([]);
    localStorage.clear();
  });
});

function createApi(): LumoraTaskApi {
  return {
    create: vi.fn(async () => createdTask),
    list: vi.fn(async () => []),
    get: vi.fn(async () => createdTask),
    updatePreferences: vi.fn(async (input) => ({
      ...createdTask,
      selectedModel: input.model,
      selectedReasoningEffort: input.reasoningEffort,
    })),
    subscribe: vi.fn(() => () => undefined),
    decideApproval: vi.fn(async () => createdTask),
  };
}

function createModelApi(): LumoraModelApi {
  return {
    getUsageStatistics: vi.fn(),
    listProviders: vi.fn(async () => []),
    createProvider: vi.fn(),
    updateProvider: vi.fn(),
    activateProvider: vi.fn(),
    disableProvider: vi.fn(),
    deleteProvider: vi.fn(async () => undefined),
    listProviderModels: vi.fn(async () => []),
    createProviderModel: vi.fn(),
    updateProviderModel: vi.fn(),
    deleteProviderModel: vi.fn(async () => undefined),
    testProviderModel: vi.fn(async () => true),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    listModels: vi.fn(async () => []),
    complete: vi.fn(),
    compactContext: vi.fn(),
    readArtifact: vi.fn(),
    listMessages: vi.fn(async () => [
      { role: "user" as const, content: "整理下载目录" },
      {
        role: "assistant" as const,
        content: "可以开始整理。",
        durationMs: 2_100,
      },
    ]),
    decideToolApproval: vi.fn(async () => undefined),
    streamMessage: vi.fn(() => () => undefined),
    regenerateMessage: vi.fn(() => () => undefined),
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
