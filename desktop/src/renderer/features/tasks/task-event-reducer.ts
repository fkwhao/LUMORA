import type { TaskEvent } from "../../../shared/task-contract";
import type { TaskState } from "./task-store";

export function reduceTaskEvent(
  event: TaskEvent,
  state: TaskState,
): Partial<TaskState> | undefined {
  const current = state.activeTask;
  // 事件可在断线后重放，序号检查防止旧事件覆盖当前任务快照。
  if (
    !current ||
    current.taskId !== event.taskId ||
    event.sequence <= current.lastEventSequence
  ) {
    return undefined;
  }
  return {
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
    recentTasks: state.recentTasks.map((task) =>
      task.taskId === event.taskId
        ? {
            ...task,
            status: event.status,
            updatedAt: new Date().toISOString(),
          }
        : task,
    ),
    taskEvents: [
      ...state.taskEvents.filter(
        (currentEvent) => currentEvent.sequence !== event.sequence,
      ),
      event,
    ].sort((first, second) => first.sequence - second.sequence),
  };
}
