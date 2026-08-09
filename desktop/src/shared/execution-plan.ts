import type {
  ExecutionPlanStep,
  ExecutionPlanStepStatus,
  WorkLogItem,
} from "./model-contract";

const PLAN_TOOL_NAME = "update_plan";
const PLAN_STATUSES = new Set<ExecutionPlanStepStatus>([
  "pending",
  "in_progress",
  "completed",
]);

export function executionPlanFromWorkLog(
  workLog: WorkLogItem[] | undefined,
): ExecutionPlanStep[] {
  if (!workLog) return [];
  for (let index = workLog.length - 1; index >= 0; index -= 1) {
    const item = workLog[index];
    if (item?.toolName !== PLAN_TOOL_NAME) continue;
    const parsed = parseSteps(item.arguments?.steps);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

export function isPlanWorkLogItem(item: WorkLogItem): boolean {
  return item.toolName === PLAN_TOOL_NAME;
}

export function isExecutionPlanComplete(steps: ExecutionPlanStep[]): boolean {
  return (
    steps.length > 0 && steps.every((step) => step.status === "completed")
  );
}

function parseSteps(value: unknown): ExecutionPlanStep[] {
  if (!Array.isArray(value)) return [];
  const steps: ExecutionPlanStep[] = [];
  for (const valueStep of value) {
    if (!isRecord(valueStep)) return [];
    const step = valueStep.step;
    const status = valueStep.status;
    if (
      typeof step !== "string" ||
      !step.trim() ||
      typeof status !== "string" ||
      !PLAN_STATUSES.has(status as ExecutionPlanStepStatus)
    ) {
      return [];
    }
    steps.push({
      step: step.trim(),
      status: status as ExecutionPlanStepStatus,
    });
  }
  return steps;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
