import { createStore } from "zustand/vanilla";

import type {
  ApprovalDecision,
  LumoraTaskApi,
  TaskEvent,
  TaskSnapshot,
} from "../../../shared/task-contract";

interface TaskState {
  activeTask?: TaskSnapshot;
  isCreating: boolean;
  error?: string;
  createTask(goal: string): Promise<TaskSnapshot>;
  decideApproval(decision: ApprovalDecision): Promise<TaskSnapshot>;
  clearError(): void;
}

export type TaskStore = ReturnType<typeof createTaskStore>;

export function createTaskStore(api: LumoraTaskApi) {
  let unsubscribe: (() => void) | undefined;

  return createStore<TaskState>((set, get) => ({
    activeTask: undefined,
    isCreating: false,
    error: undefined,

    async createTask(goal) {
      const normalizedGoal = goal.trim();
      if (!normalizedGoal) {
        throw new Error("任务目标不能为空");
      }

      set({ isCreating: true, error: undefined });
      try {
        const task = await api.create(normalizedGoal);
        unsubscribe?.();
        unsubscribe = api.subscribe(task.taskId, (event) => {
          applyEvent(event, get, set);
        });
        set({ activeTask: task, isCreating: false });
        return task;
      } catch (error) {
        const message = toErrorMessage(error);
        set({ isCreating: false, error: message });
        throw error;
      }
    },

    async decideApproval(decision) {
      const task = get().activeTask;
      if (!task?.approval) {
        throw new Error("当前任务没有待处理的审批");
      }

      const updated = await api.decideApproval({
        taskId: task.taskId,
        approvalId: task.approval.approvalId,
        decision,
      });
      set({ activeTask: updated });
      return updated;
    },

    clearError() {
      set({ error: undefined });
    },
  }));
}

function applyEvent(
  event: TaskEvent,
  get: () => TaskState,
  set: (partial: Partial<TaskState>) => void,
): void {
  const current = get().activeTask;
  // 事件可在断线后重放，序号检查防止旧事件覆盖当前任务快照。
  if (
    !current ||
    current.taskId !== event.taskId ||
    event.sequence <= current.lastEventSequence
  ) {
    return;
  }

  set({
    activeTask: {
      ...current,
      status: event.status,
      lastEventSequence: event.sequence,
      activeStep: event.title,
      approval:
        event.status === "WAITING_APPROVAL"
          ? event.approval ?? current.approval
          : undefined,
      errorMessage: event.errorMessage,
      resultSummary:
        event.type === "RESULT_AVAILABLE"
          ? event.userMessage
          : current.resultSummary,
    },
  });
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "任务创建失败";
}
