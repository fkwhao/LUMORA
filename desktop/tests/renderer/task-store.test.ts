import { describe, expect, it, vi } from "vitest";

import type {
  ChatMessage,
  ConversationInput,
  ConversationRunSnapshot,
  LumoraModelApi,
} from "../../src/shared/model-contract";
import type {
  LumoraTaskApi,
  TaskEvent,
  TaskSnapshot,
} from "../../src/shared/task-contract";
import { createTaskStore } from "../../src/renderer/features/tasks/task-store";
import { TASK_PROJECT_PATHS_STORAGE_KEY } from "../../src/renderer/constants/storage";

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
  it("migrates legacy task project mappings into Core persistence", async () => {
    localStorage.clear();
    localStorage.setItem(
      TASK_PROJECT_PATHS_STORAGE_KEY,
      JSON.stringify({ [createdTask.taskId]: "F:\\project\\test" }),
    );
    const api = createApi();
    vi.mocked(api.list).mockResolvedValue([
      {
        taskId: createdTask.taskId,
        goal: createdTask.goal,
        status: createdTask.status,
        workspacePath: "",
      },
    ]);
    const store = createTaskStore(api);

    await store.getState().loadRecentTasks();

    expect(api.updateWorkspace).toHaveBeenCalledWith({
      taskId: createdTask.taskId,
      workspacePath: "F:\\project\\test",
    });
    expect(store.getState().recentTasks[0]?.workspacePath)
      .toBe("F:\\project\\test");
    expect(store.getState().taskProjectPaths).toEqual({
      [createdTask.taskId]: "F:\\project\\test",
    });
    expect(localStorage.getItem(TASK_PROJECT_PATHS_STORAGE_KEY)).toBe("{}");
    localStorage.clear();
  });

  it("treats the database workspace as authoritative over stale local data", async () => {
    localStorage.clear();
    localStorage.setItem(
      TASK_PROJECT_PATHS_STORAGE_KEY,
      JSON.stringify({ [createdTask.taskId]: "F:\\project\\stale" }),
    );
    const api = createApi();
    vi.mocked(api.list).mockResolvedValue([
      {
        taskId: createdTask.taskId,
        goal: createdTask.goal,
        status: createdTask.status,
        workspacePath: "F:\\project\\database",
      },
    ]);
    const store = createTaskStore(api);

    await store.getState().loadRecentTasks();

    expect(api.updateWorkspace).not.toHaveBeenCalled();
    expect(store.getState().taskProjectPaths).toEqual({
      [createdTask.taskId]: "F:\\project\\database",
    });
    expect(localStorage.getItem(TASK_PROJECT_PATHS_STORAGE_KEY)).toBe("{}");
    localStorage.clear();
  });

  it("persists the selected workspace when a task is created", async () => {
    localStorage.clear();
    const api = createApi();
    vi.mocked(api.create).mockImplementation(async (goal, workspacePath) => ({
      ...createdTask,
      goal,
      workspacePath,
    }));
    const store = createTaskStore(api);

    await store.getState().createTask(
      "整理下载目录",
      "F:\\project\\test",
    );

    expect(api.create).toHaveBeenCalledWith(
      "整理下载目录",
      "F:\\project\\test",
      { target: "LOCAL" },
    );
    expect(store.getState().taskProjectPaths).toEqual({
      [createdTask.taskId]: "F:\\project\\test",
    });
    expect(localStorage.getItem(TASK_PROJECT_PATHS_STORAGE_KEY)).toBeNull();
    localStorage.clear();
  });

  it("forwards explicit Worktree environment choices when the first task is created", async () => {
    const api = createApi();
    const store = createTaskStore(api);

    await store.getState().createTask(
      "并行处理登录模块",
      "F:\\project\\test",
      {
        environmentSelection: {
          target: "NEW_WORKTREE",
          autoApplyWhenClean: true,
        },
      },
    );

    expect(api.create).toHaveBeenLastCalledWith(
      "并行处理登录模块",
      "F:\\project\\test",
      {
        target: "NEW_WORKTREE",
        autoApplyWhenClean: true,
      },
    );

    await store.getState().createTask(
      "继续既有隔离任务",
      "F:\\project\\test",
      {
        environmentSelection: {
          target: "EXISTING_WORKTREE",
          worktreePath: "F:\\worktrees\\auth",
          autoApplyWhenClean: false,
        },
      },
    );

    expect(api.create).toHaveBeenLastCalledWith(
      "继续既有隔离任务",
      "F:\\project\\test",
      {
        target: "EXISTING_WORKTREE",
        worktreePath: "F:\\worktrees\\auth",
        autoApplyWhenClean: false,
      },
    );
  });

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

  it("keeps a running conversation timer and work log stable across task switches", async () => {
    const firstTask = {
      ...createdTask,
      taskId: "task-running",
      goal: "运行任务",
    };
    const secondTask = {
      ...createdTask,
      taskId: "task-idle",
      goal: "空闲任务",
    };
    const startedAt = "2026-08-17T01:02:03.000Z";
    const api = createApi();
    vi.mocked(api.list).mockResolvedValue([firstTask, secondTask]);
    vi.mocked(api.get).mockImplementation(async (taskId) =>
      taskId === firstTask.taskId ? firstTask : secondTask,
    );
    const modelApi = createModelApi();
    const runningMessages: ChatMessage[] = [
      {
        messageId: "running-user",
        role: "user",
        content: "检查并发状态",
      },
      {
        runtimeId: "running-assistant-runtime",
        role: "assistant",
        content: "",
        workLog: [
          {
            itemId: "progress-preserved",
            kind: "progress",
            status: "running",
            content: "正在检查任务队列",
          },
        ],
      },
    ];
    let persistedMessages = runningMessages;
    let firstRunStatus: ConversationRunSnapshot["status"] = "RUNNING";
    vi.mocked(modelApi.listMessages).mockImplementation(async (taskId) =>
      taskId === firstTask.taskId ? persistedMessages : [],
    );
    vi.mocked(modelApi.getActiveRun).mockImplementation(async (taskId) =>
      taskId === firstTask.taskId
        ? {
            ...activeRun(firstRunStatus, "run-running"),
            taskId: firstTask.taskId,
            startedAt,
            lastEventSequence: 5,
          }
        : undefined,
    );
    let onRunningEvent:
      | Parameters<LumoraModelApi["subscribeRun"]>[3]
      | undefined;
    vi.mocked(modelApi.subscribeRun).mockImplementation(
      (taskId, _runId, _afterSequence, onEvent) => {
        if (taskId === firstTask.taskId) onRunningEvent = onEvent;
        return () => undefined;
      },
    );
    const store = createTaskStore(api, modelApi);
    await store.getState().loadRecentTasks();
    await store.getState().openTask(firstTask.taskId);

    expect(store.getState().chatStartedAt).toBe(Date.parse(startedAt));
    onRunningEvent?.({
      runId: "run-running",
      sequence: 3,
      occurredAt: "2026-08-17T01:02:06.000Z",
      event: {
        type: "usage",
        delta: "",
        model: "test-model",
        errorMessage: "",
      },
    });
    const liveMessages = store.getState().messages;
    expect(store.getState().activeRun?.lastEventSequence).toBe(3);

    await store.getState().openTask(secondTask.taskId);
    const reopening = store.getState().openTask(firstTask.taskId);

    expect(store.getState().isChatting).toBe(true);
    expect(store.getState().chatStartedAt).toBe(Date.parse(startedAt));
    expect(store.getState().messages).toBe(liveMessages);
    expect(store.getState().messages.at(-1)?.workLog).toEqual([
      expect.objectContaining({ itemId: "progress-preserved" }),
    ]);

    await reopening;
    expect(store.getState().isChatting).toBe(true);
    expect(store.getState().chatStartedAt).toBe(Date.parse(startedAt));
    expect(store.getState().messages).toBe(liveMessages);
    expect(modelApi.subscribeRun).toHaveBeenLastCalledWith(
      firstTask.taskId,
      "run-running",
      3,
      expect.any(Function),
    );

    await store.getState().openTask(secondTask.taskId);
    firstRunStatus = "COMPLETED";
    persistedMessages = [
      runningMessages[0]!,
      {
        messageId: "running-assistant",
        role: "assistant",
        content: "并发状态检查完成",
        durationMs: 12_000,
      },
    ];
    await store.getState().openTask(firstTask.taskId);

    expect(store.getState().isChatting).toBe(false);
    expect(store.getState().chatStartedAt).toBeUndefined();
    expect(store.getState().messages.at(-1)).toMatchObject({
      content: "并发状态检查完成",
      durationMs: 12_000,
    });
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

  it("pauses an active streamed answer and keeps the sent message", async () => {
    const api = createApi();
    const modelApi = createModelApi();
    const cancel = vi.fn();
    vi.mocked(modelApi.streamMessage).mockReturnValue(cancel);
    vi.mocked(modelApi.getActiveRun).mockResolvedValue(activeRun("RUNNING"));
    vi.mocked(modelApi.pauseRun).mockResolvedValue(activeRun("PAUSED"));
    vi.mocked(modelApi.listMessages)
      .mockResolvedValueOnce([
        { role: "user", content: "整理下载目录" },
        { role: "assistant", content: "可以开始整理。", durationMs: 2_100 },
      ])
      .mockResolvedValueOnce([
        { role: "user", content: "整理下载目录" },
        { role: "assistant", content: "可以开始整理。", durationMs: 2_100 },
        { role: "user", content: "继续整理文档" },
        { role: "assistant", content: "" },
      ]);
    const store = createTaskStore(api, modelApi);
    await store.getState().openTask(createdTask.taskId);

    const pendingSend = store.getState().sendMessage("继续整理文档");

    expect(store.getState().isChatting).toBe(true);
    expect(store.getState().messages.at(-2)).toMatchObject({
      role: "user",
      content: "继续整理文档",
    });

    await store.getState().stopChat();
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

  it("settles without a pause error when the run completes during the request", async () => {
    const api = createApi();
    const modelApi = createModelApi();
    const cancel = vi.fn();
    vi.mocked(modelApi.streamMessage).mockReturnValue(cancel);
    vi.mocked(modelApi.getActiveRun).mockResolvedValue(activeRun("RUNNING"));
    vi.mocked(modelApi.pauseRun).mockResolvedValue(activeRun("COMPLETED"));
    vi.mocked(modelApi.listMessages)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { messageId: "user-1", role: "user", content: "继续整理" },
        {
          messageId: "assistant-1",
          role: "assistant",
          content: "已经自然完成",
        },
      ]);
    const store = createTaskStore(api, modelApi);
    await store.getState().openTask(createdTask.taskId);

    const pendingSend = store.getState().sendMessage("继续整理");
    await expect(store.getState().stopChat()).resolves.toBeUndefined();
    await pendingSend;

    expect(cancel).toHaveBeenCalledOnce();
    expect(store.getState().isChatting).toBe(false);
    expect(store.getState().isPausing).toBe(false);
    expect(store.getState().chatWasStopped).toBe(false);
    expect(store.getState().chatError).toBeUndefined();
    expect(store.getState().messages.at(-1)?.content).toBe("已经自然完成");
  });

  it("clears the optimistic pause when a pausing run completes naturally", async () => {
    const api = createApi();
    const modelApi = createModelApi();
    let onEvent: Parameters<LumoraModelApi["streamMessage"]>[2] | undefined;
    vi.mocked(modelApi.streamMessage).mockImplementation(
      (_taskId, _content, eventHandler) => {
        onEvent = eventHandler;
        return () => undefined;
      },
    );
    vi.mocked(modelApi.getActiveRun).mockResolvedValue(activeRun("RUNNING"));
    vi.mocked(modelApi.pauseRun).mockResolvedValue(activeRun("PAUSING"));
    vi.mocked(modelApi.listMessages)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { messageId: "user-1", role: "user", content: "继续整理" },
        {
          messageId: "assistant-1",
          role: "assistant",
          content: "刚好完成",
        },
      ]);
    const store = createTaskStore(api, modelApi);
    await store.getState().openTask(createdTask.taskId);

    const pendingSend = store.getState().sendMessage("继续整理");
    await store.getState().stopChat();
    expect(store.getState().isPausing).toBe(true);
    onEvent?.({
      type: "completed",
      delta: "",
      model: "test-model",
      errorMessage: "",
    });
    await pendingSend;

    expect(store.getState().activeRun?.status).toBe("COMPLETED");
    expect(store.getState().isPausing).toBe(false);
    expect(store.getState().chatWasStopped).toBe(false);
    expect(store.getState().messages.at(-1)?.content).toBe("刚好完成");
  });

  it("tolerates an older Core reporting that a raced run already ended", async () => {
    const api = createApi();
    const modelApi = createModelApi();
    vi.mocked(modelApi.getActiveRun)
      .mockResolvedValueOnce(activeRun("RUNNING"))
      .mockResolvedValueOnce(undefined);
    vi.mocked(modelApi.pauseRun).mockRejectedValue(
      new Error("已结束的运行不能暂停"),
    );
    vi.mocked(modelApi.listMessages)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { messageId: "user-1", role: "user", content: "继续整理" },
        {
          messageId: "assistant-1",
          role: "assistant",
          content: "运行已经结束",
        },
      ]);
    const store = createTaskStore(api, modelApi);
    await store.getState().openTask(createdTask.taskId);

    const pendingSend = store.getState().sendMessage("继续整理");
    await expect(store.getState().stopChat()).resolves.toBeUndefined();
    await pendingSend;

    expect(store.getState().isChatting).toBe(false);
    expect(store.getState().isPausing).toBe(false);
    expect(store.getState().chatWasStopped).toBe(false);
    expect(store.getState().chatError).toBeUndefined();
    expect(store.getState().messages.at(-1)?.content).toBe("运行已经结束");
  });

  it("freezes output immediately while the pause settles in the background", async () => {
    const api = createApi();
    const modelApi = createModelApi();
    const cancel = vi.fn();
    let onEvent: Parameters<LumoraModelApi["streamMessage"]>[2] | undefined;
    vi.mocked(modelApi.streamMessage).mockImplementation(
      (_taskId, _content, eventHandler) => {
        onEvent = eventHandler;
        return cancel;
      },
    );
    vi.mocked(modelApi.getActiveRun).mockResolvedValue(activeRun("RUNNING"));
    let resolvePause:
      | ((run: ConversationRunSnapshot) => void)
      | undefined;
    vi.mocked(modelApi.pauseRun).mockImplementation(
      () => new Promise<ConversationRunSnapshot>((resolve) => {
        resolvePause = resolve;
      }),
    );
    vi.mocked(modelApi.listMessages)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { messageId: "user-1", role: "user", content: "继续整理" },
        {
          messageId: "assistant-1",
          role: "assistant",
          content: "已完成第一步",
        },
      ]);
    const store = createTaskStore(api, modelApi);
    await store.getState().openTask(createdTask.taskId);

    let settled = false;
    const pendingSend = store.getState().sendMessage("继续整理").then(() => {
      settled = true;
    });
    const stopping = store.getState().stopChat();

    expect(store.getState().isPausing).toBe(true);
    expect(store.getState().isChatting).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    onEvent?.({
      type: "text_delta",
      delta: "这段迟到的输出不应继续展示",
      model: "test-model",
      errorMessage: "",
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(store.getState().messages.at(-1)?.content).toBe("");

    resolvePause?.(activeRun("PAUSING"));
    await stopping;

    onEvent?.({
      type: "paused",
      delta: "",
      model: "test-model",
      errorMessage: "",
    });
    await pendingSend;

    expect(cancel).toHaveBeenCalledOnce();
    expect(store.getState().activeRun?.status).toBe("PAUSED");
    expect(store.getState().isPausing).toBe(false);
    expect(store.getState().isChatting).toBe(false);
    expect(store.getState().chatWasStopped).toBe(true);
    expect(store.getState().messages.at(-1)?.content).toBe("已完成第一步");
  });

  it("keeps the latest usage snapshot while stopped usage persistence catches up", async () => {
    const api = createApi();
    const modelApi = createModelApi();
    vi.mocked(modelApi.getActiveRun).mockResolvedValue(activeRun("RUNNING"));
    vi.mocked(modelApi.pauseRun).mockResolvedValue(activeRun("PAUSED"));
    let onEvent: Parameters<LumoraModelApi["streamMessage"]>[2] | undefined;
    vi.mocked(modelApi.streamMessage).mockImplementation(
      (_taskId, _content, eventHandler) => {
        onEvent = eventHandler;
        return () => undefined;
      },
    );
    vi.mocked(modelApi.listMessages)
      .mockResolvedValueOnce([
        { messageId: "old-user", role: "user", content: "旧问题" },
        { messageId: "old-answer", role: "assistant", content: "旧回答" },
      ])
      .mockResolvedValueOnce([
        { messageId: "old-user", role: "user", content: "旧问题" },
        { messageId: "old-answer", role: "assistant", content: "旧回答" },
        { messageId: "current-user", role: "user", content: "继续" },
      ]);
    const store = createTaskStore(api, modelApi);
    await store.getState().openTask(createdTask.taskId);
    const pending = store.getState().sendMessage("继续");
    onEvent?.({
      type: "usage",
      delta: "",
      model: "deepseek-v4-pro",
      errorMessage: "",
      usage: {
        promptTokens: 120,
        completionTokens: 30,
        totalTokens: 150,
      },
    });

    await store.getState().stopChat();
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getState().messages.at(-1)?.usage?.totalTokens).toBe(150);
  });

  it("resumes the same run without inserting a synthetic user message", async () => {
    const api = createApi();
    const modelApi = createModelApi();
    vi.mocked(modelApi.getActiveRun).mockResolvedValue(activeRun("PAUSED"));
    vi.mocked(modelApi.resumeRun).mockResolvedValue(activeRun("RUNNING"));
    vi.mocked(modelApi.listMessages)
      .mockResolvedValueOnce([
        { messageId: "user-1", role: "user", content: "整理下载目录" },
        {
          messageId: "paused-assistant-1",
          role: "assistant",
          content: "已经完成扫描",
        },
      ])
      .mockResolvedValueOnce([
        { messageId: "user-1", role: "user", content: "整理下载目录" },
        {
          messageId: "paused-assistant-1",
          role: "assistant",
          content: "已经完成扫描",
        },
        { messageId: "assistant-1", role: "assistant", content: "整理完成" },
      ]);
    let onRunEvent: Parameters<LumoraModelApi["subscribeRun"]>[3] | undefined;
    vi.mocked(modelApi.subscribeRun).mockImplementation(
      (_taskId, runId, _afterSequence, onEvent) => {
        onRunEvent = onEvent;
        return () => undefined;
      },
    );
    const store = createTaskStore(api, modelApi);
    await store.getState().openTask(createdTask.taskId);
    expect(store.getState().messages).toHaveLength(2);

    const pendingResume = store.getState().resumeChat();
    await Promise.resolve();
    expect(store.getState().messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "",
    });
    onRunEvent?.({
      runId: "run-1",
      sequence: 1,
      occurredAt: "2026-08-15T00:00:01Z",
      event: {
        type: "progress_message",
        delta: "继续执行剩余步骤",
        itemId: "stage-1",
        model: "test-model",
        errorMessage: "",
        metadata: { replacesAssistantContent: true },
      },
    });

    expect(store.getState().messages.at(-1)).toMatchObject({
      role: "assistant",
      workLog: [
        expect.objectContaining({
          itemId: "stage-1",
          content: "继续执行剩余步骤",
        }),
      ],
    });

    onRunEvent?.({
      runId: "run-1",
      sequence: 2,
      occurredAt: "2026-08-15T00:00:02Z",
      event: {
        type: "completed",
        delta: "",
        model: "test-model",
        errorMessage: "",
      },
    });
    await pendingResume;

    expect(modelApi.resumeRun).toHaveBeenCalledWith(
      createdTask.taskId,
      "run-1",
    );
    expect(store.getState().messages.filter((message) => message.role === "user"))
      .toEqual([expect.objectContaining({ content: "整理下载目录" })]);
  });

  it("does not pause a completed run cached from an earlier answer", async () => {
    const api = createApi();
    const modelApi = createModelApi();
    vi.mocked(modelApi.listMessages).mockResolvedValue([
      { messageId: "message-1", role: "user", content: "整理下载目录" },
      { messageId: "message-2", role: "assistant", content: "旧回答" },
    ]);
    vi.mocked(modelApi.getActiveRun)
      .mockResolvedValueOnce(activeRun("COMPLETED", "old-run"))
      .mockResolvedValueOnce(activeRun("COMPLETED", "old-run"))
      .mockResolvedValueOnce(activeRun("RUNNING", "new-run"));
    vi.mocked(modelApi.pauseRun).mockResolvedValue(
      activeRun("PAUSED", "new-run"),
    );
    const store = createTaskStore(api, modelApi);
    await store.getState().openTask(createdTask.taskId);

    const pendingRegeneration = store
      .getState()
      .regenerateMessage("message-1", "重新整理下载目录");
    await store.getState().stopChat();
    await pendingRegeneration;

    expect(modelApi.pauseRun).toHaveBeenCalledOnce();
    expect(modelApi.pauseRun).toHaveBeenCalledWith(
      createdTask.taskId,
      "new-run",
    );
  });

  it("keeps paused work visible when an earlier usage refresh completes", async () => {
    vi.useFakeTimers();
    try {
      const api = createApi();
      const modelApi = createModelApi();
      let onEvent: Parameters<LumoraModelApi["streamMessage"]>[2] | undefined;
      let resolveStaleRefresh:
        | ((messages: ChatMessage[]) => void)
        | undefined;
      vi.mocked(modelApi.streamMessage).mockImplementation(
        (_taskId, _content, eventHandler) => {
          onEvent = eventHandler;
          return () => undefined;
        },
      );
      vi.mocked(modelApi.getActiveRun).mockResolvedValue(activeRun("RUNNING"));
      vi.mocked(modelApi.pauseRun).mockResolvedValue(activeRun("PAUSED"));
      vi.mocked(modelApi.listMessages)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { messageId: "user-1", role: "user", content: "第一轮" },
          { messageId: "assistant-1", role: "assistant", content: "第一轮完成" },
        ])
        .mockImplementationOnce(
          () => new Promise<ChatMessage[]>((resolve) => {
            resolveStaleRefresh = resolve;
          }),
        )
        .mockResolvedValueOnce([
          { messageId: "user-1", role: "user", content: "第一轮" },
          { messageId: "assistant-1", role: "assistant", content: "第一轮完成" },
          { messageId: "user-2", role: "user", content: "第二轮" },
        ]);
      const store = createTaskStore(api, modelApi);
      await store.getState().openTask(createdTask.taskId);

      const firstAnswer = store.getState().sendMessage("第一轮");
      onEvent?.({
        type: "completed",
        delta: "",
        model: "test-model",
        errorMessage: "",
      });
      await firstAnswer;
      await vi.advanceTimersByTimeAsync(5_000);
      expect(modelApi.listMessages).toHaveBeenCalledTimes(3);

      const secondAnswer = store.getState().sendMessage("第二轮");
      onEvent?.({
        type: "progress_message",
        delta: "第二轮正在执行",
        itemId: "stage-2",
        model: "test-model",
        errorMessage: "",
        metadata: { replacesAssistantContent: true },
      });
      await store.getState().stopChat();
      await secondAnswer;
      resolveStaleRefresh?.([
        { messageId: "user-1", role: "user", content: "第一轮" },
        { messageId: "assistant-1", role: "assistant", content: "第一轮完成" },
        {
          messageId: "usage-1",
          parentMessageId: "user-1",
          role: "assistant",
          content: "",
          usageRecordOnly: true,
          usage: {
            promptTokens: 100,
            completionTokens: 20,
            totalTokens: 120,
          },
        },
      ]);
      await Promise.resolve();

      expect(modelApi.listMessages).toHaveBeenCalledTimes(4);
      expect(store.getState().messages.at(-1)?.workLog).toEqual([
        expect.objectContaining({
          itemId: "stage-2",
          content: "第二轮正在执行",
        }),
      ]);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("refreshes delayed background usage after a completed answer", async () => {
    vi.useFakeTimers();
    try {
      const api = createApi();
      const modelApi = createModelApi();
      let onEvent: Parameters<LumoraModelApi["streamMessage"]>[2] | undefined;
      vi.mocked(modelApi.streamMessage).mockImplementation(
        (_taskId, _content, eventHandler) => {
          onEvent = eventHandler;
          return () => undefined;
        },
      );
      const user = {
        messageId: "user-1",
        role: "user" as const,
        content: "remember this",
      };
      const assistant = {
        messageId: "assistant-1",
        role: "assistant" as const,
        content: "remembered",
        usage: {
          promptTokens: 10,
          completionTokens: 2,
          totalTokens: 12,
        },
      };
      const supplemental = {
        messageId: "memory-usage-1",
        parentMessageId: "user-1",
        role: "assistant" as const,
        content: "",
        usageRecordOnly: true,
        usage: {
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
        },
      };
      vi.mocked(modelApi.listMessages)
        .mockResolvedValueOnce([user, assistant])
        .mockResolvedValueOnce([user, assistant])
        .mockResolvedValueOnce([
          user,
          { ...assistant, threadMessages: [user, assistant, supplemental] },
        ]);
      const store = createTaskStore(api, modelApi);
      await store.getState().openTask(createdTask.taskId);
      const pending = store.getState().sendMessage("remember this");

      onEvent?.({
        type: "completed",
        delta: "",
        model: "deepseek-v4-pro",
        errorMessage: "",
      });
      await pending;
      await vi.advanceTimersByTimeAsync(5_000);

      expect(
        store.getState().messages.some((message) =>
          message.threadMessages?.some(
            (candidate) => candidate.messageId === "memory-usage-1",
          ),
        ),
      ).toBe(true);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
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

  it("persists, edits, reorders, and deletes queued conversation inputs", async () => {
    const api = createApi();
    const modelApi = createModelApi();
    let inputs: ConversationInput[] = [];
    vi.mocked(modelApi.getActiveRun).mockResolvedValue(activeRun("RUNNING"));
    vi.mocked(modelApi.listInputs).mockImplementation(async () =>
      [...inputs].sort((left, right) => left.position - right.position));
    vi.mocked(modelApi.createInput).mockImplementation(async (_taskId, input) => {
      const sequence = inputs.length + 1;
      const created: ConversationInput = {
        inputId: `input-${sequence}`,
        taskId: createdTask.taskId,
        runId: "run-1",
        target: input.target,
        status: input.target === "NEXT_STEP" ? "DELIVERED" : "PENDING",
        content: input.content,
        model: input.model ?? "demo",
        reasoningEffort: input.reasoningEffort ?? "",
        workspacePath: input.workspacePath ?? "",
        permissionMode: input.permissionMode ?? "request_approval",
        position: sequence,
        createdAt: "2026-08-16T00:00:00Z",
        updatedAt: "2026-08-16T00:00:00Z",
      };
      inputs = [...inputs, created];
      return created;
    });
    vi.mocked(modelApi.updateInput).mockImplementation(
      async (_taskId, inputId, update) => {
        inputs = inputs.map((input) => input.inputId === inputId
          ? { ...input, ...update }
          : input);
        return inputs.find((input) => input.inputId === inputId)!;
      },
    );
    vi.mocked(modelApi.deleteInput).mockImplementation(async (_taskId, inputId) => {
      inputs = inputs.filter((input) => input.inputId !== inputId);
    });
    const store = createTaskStore(api, modelApi);
    await store.getState().openTask(createdTask.taskId);

    await store.getState().enqueueInput(
      "先检查测试配置",
      "NEXT_STEP",
      { model: "demo" },
    );
    expect(store.getState().pendingInputs).toMatchObject([
      { inputId: "input-1", target: "NEXT_STEP", status: "DELIVERED" },
    ]);

    await store.getState().updateInput("input-1", {
      content: "先检查生产配置",
      target: "NEXT_TURN",
    });
    expect(store.getState().pendingInputs[0]).toMatchObject({
      content: "先检查生产配置",
      target: "NEXT_TURN",
    });

    await store.getState().enqueueInput("然后运行测试", "NEXT_TURN");
    await store.getState().moveInput("input-2", -1);
    expect(store.getState().pendingInputs.map((input) => input.inputId)).toEqual([
      "input-2",
      "input-1",
    ]);

    await store.getState().deleteInput("input-1");
    expect(store.getState().pendingInputs.map((input) => input.inputId)).toEqual([
      "input-2",
    ]);
  });

  it("turns a queued question into a visible steer bubble", async () => {
    const api = createApi();
    const modelApi = createModelApi();
    let inputs: ConversationInput[] = [{
      inputId: "input-steer",
      taskId: createdTask.taskId,
      runId: undefined,
      target: "NEXT_TURN",
      status: "PENDING",
      content: "改为先检查安全边界",
      model: "demo",
      reasoningEffort: "",
      workspacePath: "",
      permissionMode: "request_approval",
      position: 1,
      createdAt: "2026-08-16T00:00:00Z",
      updatedAt: "2026-08-16T00:00:00Z",
    }];
    vi.mocked(modelApi.getActiveRun).mockResolvedValue(activeRun("RUNNING"));
    vi.mocked(modelApi.listInputs).mockImplementation(async () => inputs);
    vi.mocked(modelApi.updateInput).mockImplementation(
      async (_taskId, inputId, update) => {
        inputs = inputs.map((input) => input.inputId === inputId
          ? { ...input, ...update, runId: "run-1", status: "DELIVERED" }
          : input);
        return inputs[0]!;
      },
    );
    const store = createTaskStore(api, modelApi);
    await store.getState().openTask(createdTask.taskId);

    await store.getState().updateInput("input-steer", {
      target: "NEXT_STEP",
    });

    expect(store.getState().messages.at(-2)).toMatchObject({
      runtimeId: "steer-input-steer",
      role: "user",
      content: "改为先检查安全边界",
    });
    expect(store.getState().messages.at(-1)?.role).toBe("assistant");
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
    updateWorkspace: vi.fn(async (input) => ({
      ...createdTask,
      taskId: input.taskId,
      workspacePath: input.workspacePath,
    })),
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
    getActiveRun: vi.fn(async () => undefined),
    listInputs: vi.fn(async () => []),
    createInput: vi.fn(),
    updateInput: vi.fn(),
    deleteInput: vi.fn(async () => undefined),
    pauseRun: vi.fn(),
    resumeRun: vi.fn(),
    cancelRun: vi.fn(),
    getRunChanges: vi.fn(),
    revertRun: vi.fn(),
    getTaskWorktree: vi.fn(async () => undefined),
    getTaskWorktreeChanges: vi.fn(async () => undefined),
    applyTaskWorktree: vi.fn(),
    createTaskWorktreeBranch: vi.fn(),
    discardTaskWorktree: vi.fn(),
    subscribeRun: vi.fn(() => () => undefined),
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

function activeRun(
  status: ConversationRunSnapshot["status"],
  runId = "run-1",
): ConversationRunSnapshot {
  return {
    runId,
    taskId: createdTask.taskId,
    status,
    triggerType: "MESSAGE" as const,
    lastEventSequence: 0,
    replayFromSequence: 0,
    errorMessage: "",
    createdAt: "2026-08-15T00:00:00Z",
    updatedAt: "2026-08-15T00:00:00Z",
  };
}
