import type { ApprovalDecisionInput } from "./task-contract";

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/;
const approvalKeys = ["approvalId", "decision", "taskId"] as const;

export function validateGoal(input: unknown): string {
  if (typeof input !== "string") {
    throw new TypeError("任务目标必须是字符串");
  }
  const goal = input.trim();
  if (!goal) {
    throw new Error("任务目标不能为空");
  }
  if (goal.length > 2_000) {
    throw new Error("任务目标不能超过 2000 个字符");
  }
  return goal;
}

export function validateTaskId(input: unknown): string {
  if (typeof input !== "string" || !identifierPattern.test(input)) {
    throw new Error("任务 ID 格式无效");
  }
  return input;
}

export function validateApprovalId(input: unknown): string {
  if (typeof input !== "string" || !identifierPattern.test(input)) {
    throw new Error("审批 ID 格式无效");
  }
  return input;
}

export function validateApprovalDecisionInput(
  input: unknown,
): ApprovalDecisionInput {
  if (!isPlainRecord(input)) {
    throw new Error("审批参数格式无效");
  }
  const keys = Object.keys(input).sort();
  if (
    keys.length !== approvalKeys.length ||
    approvalKeys.some((key, index) => key !== keys[index])
  ) {
    throw new Error("审批参数格式无效");
  }
  if (input.decision !== "ALLOW_ONCE" && input.decision !== "REJECT") {
    throw new Error("审批决定无效");
  }
  return {
    taskId: validateTaskId(input.taskId),
    approvalId: validateApprovalId(input.approvalId),
    decision: input.decision,
  };
}

function isPlainRecord(input: unknown): input is Record<string, unknown> {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    Object.getPrototypeOf(input) === Object.prototype
  );
}
