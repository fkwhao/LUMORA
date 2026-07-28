import { randomUUID } from "node:crypto";

import type {
  ApprovalDecisionInput,
  TaskEvent,
  TaskSnapshot,
} from "../shared/task-contract";
import { validateApprovalDecisionInput } from "../shared/validation";

export interface TaskGateway {
  create(goal: string): Promise<TaskSnapshot>;
  get(taskId: string): Promise<TaskSnapshot>;
  subscribe(taskId: string, listener: (event: TaskEvent) => void): () => void;
  decideApproval(input: ApprovalDecisionInput): Promise<TaskSnapshot>;
  dispose(): void;
}

/**
 * Java Core 接入前的本地演示实现。
 * Renderer 只依赖 TaskGateway，因此换成 REST Client 时不需要修改页面代码。
 */
export class DemoTaskGateway implements TaskGateway {
  private readonly tasks = new Map<string, TaskSnapshot>();
  private readonly listeners = new Map<string, Set<(event: TaskEvent) => void>>();
  private readonly timers = new Map<string, NodeJS.Timeout[]>();

  async create(goal: string): Promise<TaskSnapshot> {
    const taskId = randomUUID();
    const task: TaskSnapshot = {
      taskId,
      goal,
      status: "CREATED",
      lastEventSequence: 0,
      activeStep: "",
      resultSummary: "",
      planSteps: [
        {
          stepId: "understand-goal",
          title: "理解目标",
          description: "分析任务目标和约束",
          requiresApproval: false,
        },
        {
          stepId: "confirm-sensitive-action",
          title: "确认敏感操作",
          description: "执行本地文件操作前请求确认",
          requiresApproval: true,
        },
      ],
    };
    this.tasks.set(taskId, task);

    this.queueEvent(taskId, 450, {
      type: "STATUS_CHANGED",
      status: "PLANNING",
      title: "理解目标",
      userMessage: "已理解你的目标",
    });
    this.queueEvent(taskId, 1_050, {
      type: "PLAN_STEP_STARTED",
      status: "RUNNING",
      title: "整理任务材料",
      userMessage: "正在整理完成目标所需的材料",
    });
    this.queueEvent(taskId, 1_850, {
      type: "APPROVAL_REQUESTED",
      status: "WAITING_APPROVAL",
      title: "确认敏感操作",
      userMessage: "需要确认后才能整理本地文件",
      approval: {
        approvalId: randomUUID(),
        taskId,
        action: "File Agent 请求整理文件",
        impactSummary: "移动 12 个文件到分类目录",
        riskLevel: "MEDIUM",
        reversible: true,
      },
    });
    return task;
  }

  async get(taskId: string): Promise<TaskSnapshot> {
    return this.requireTask(taskId);
  }

  subscribe(taskId: string, listener: (event: TaskEvent) => void): () => void {
    const taskListeners = this.listeners.get(taskId) ?? new Set();
    taskListeners.add(listener);
    this.listeners.set(taskId, taskListeners);
    return () => {
      taskListeners.delete(listener);
      if (taskListeners.size === 0) {
        this.listeners.delete(taskId);
      }
    };
  }

  async decideApproval(
    input: ApprovalDecisionInput,
  ): Promise<TaskSnapshot> {
    const decision = validateApprovalDecisionInput(input);
    const task = this.requireTask(decision.taskId);
    if (task.status !== "WAITING_APPROVAL" || !task.approval) {
      throw new Error("当前任务没有待处理的审批");
    }
    if (task.approval.approvalId !== decision.approvalId) {
      throw new Error("审批请求不匹配");
    }

    const status = decision.decision === "ALLOW_ONCE" ? "COMPLETED" : "REJECTED";
    const updated: TaskSnapshot = {
      ...task,
      status,
      approval: undefined,
      resultSummary:
        status === "COMPLETED"
          ? "任务材料已整理完成"
          : "任务已按你的决定停止",
    };
    this.tasks.set(decision.taskId, updated);
    this.clearTimers(decision.taskId);
    this.emit(decision.taskId, {
      taskId: decision.taskId,
      sequence: task.lastEventSequence + 1,
      type: status === "COMPLETED" ? "RESULT_AVAILABLE" : "APPROVAL_DECIDED",
      status,
      title: status === "COMPLETED" ? "任务已完成" : "操作已拒绝",
      userMessage: updated.resultSummary,
    });
    return updated;
  }

  dispose(): void {
    for (const taskId of this.timers.keys()) {
      this.clearTimers(taskId);
    }
    this.listeners.clear();
  }

  private queueEvent(
    taskId: string,
    delayMs: number,
    event: Omit<TaskEvent, "taskId" | "sequence">,
  ): void {
    const timer = setTimeout(() => {
      const task = this.requireTask(taskId);
      const nextEvent: TaskEvent = {
        ...event,
        taskId,
        sequence: task.lastEventSequence + 1,
      };
      this.tasks.set(taskId, {
        ...task,
        status: nextEvent.status,
        activeStep: nextEvent.title,
        lastEventSequence: nextEvent.sequence,
        approval: nextEvent.approval,
      });
      this.emit(taskId, nextEvent);
    }, delayMs);
    this.timers.set(taskId, [...(this.timers.get(taskId) ?? []), timer]);
  }

  private emit(taskId: string, event: TaskEvent): void {
    for (const listener of this.listeners.get(taskId) ?? []) {
      listener(event);
    }
  }

  private clearTimers(taskId: string): void {
    for (const timer of this.timers.get(taskId) ?? []) {
      clearTimeout(timer);
    }
    this.timers.delete(taskId);
  }

  private requireTask(taskId: string): TaskSnapshot {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }
}
