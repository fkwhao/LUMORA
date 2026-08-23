import type {
  ApprovalDecisionInput,
  TaskPreferencesInput,
  TaskWorkspaceInput,
} from "./task-contract";
import type {
  CreateGitBranchInput,
  GetGitChangesInput,
  GitCheckoutInput,
  GitHistoryInput,
  GitReviewScope,
  InspectWorkspaceInput,
  ListWorktreesInput,
  RemoveWorktreeInput,
  SetWorktreeAutoApplyInput,
  WorkspaceEnvironmentSelection,
  WorkspaceHandoffInput,
} from "./workspace-contract";

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

export function validateMessageId(input: unknown): string {
  if (typeof input !== "string" || !identifierPattern.test(input)) {
    throw new Error("消息 ID 格式无效");
  }
  return input;
}

export function validateArtifactId(input: unknown): string {
  if (typeof input !== "string" || !/^art_[0-9a-f]{32}$/.test(input)) {
    throw new Error("Artifact ID 格式无效");
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

export function validateTaskPreferencesInput(
  input: unknown,
): TaskPreferencesInput {
  if (!isPlainRecord(input)) {
    throw new Error("会话模型偏好格式无效");
  }
  const model = typeof input.model === "string" ? input.model.trim() : "";
  const reasoningEffort =
    typeof input.reasoningEffort === "string"
      ? input.reasoningEffort.trim()
      : "";
  if (!model || model.length > 255) {
    throw new Error("模型名称无效");
  }
  if (
    reasoningEffort.length > 64 ||
    (reasoningEffort && !/^[A-Za-z0-9._-]+$/.test(reasoningEffort))
  ) {
    throw new Error("推理强度无效");
  }
  return {
    taskId: validateTaskId(input.taskId),
    model,
    reasoningEffort,
  };
}

export function validateWorkspacePath(input: unknown): string {
  if (input === undefined || input === null) return "";
  if (typeof input !== "string") {
    throw new TypeError("工作区路径必须是字符串");
  }
  const workspacePath = input.trim();
  if (workspacePath.length > 4_096) {
    throw new Error("工作区路径不能超过 4096 个字符");
  }
  return workspacePath;
}

export function validateTaskWorkspaceInput(
  input: unknown,
): TaskWorkspaceInput {
  if (!isPlainRecord(input)) {
    throw new Error("任务工作区参数格式无效");
  }
  return {
    taskId: validateTaskId(input.taskId),
    workspacePath: validateWorkspacePath(input.workspacePath),
  };
}

export function validateWorkspaceEnvironmentSelection(
  input: unknown,
): WorkspaceEnvironmentSelection {
  if (input === undefined || input === null) {
    return { target: "LOCAL" };
  }
  if (!isPlainRecord(input)) {
    throw new Error("工作环境参数格式无效");
  }
  const target = input.target;
  if (
    target !== "LOCAL"
    && target !== "NEW_WORKTREE"
    && target !== "EXISTING_WORKTREE"
  ) {
    throw new Error("工作环境类型无效");
  }
  const worktreePath = validateWorkspacePath(input.worktreePath);
  if (target === "EXISTING_WORKTREE" && !worktreePath) {
    throw new Error("请选择已有 Worktree");
  }
  const autoApplyWhenClean = target === "NEW_WORKTREE"
    && typeof input.autoApplyWhenClean === "boolean"
    ? input.autoApplyWhenClean
    : undefined;
  return {
    target,
    ...(worktreePath ? { worktreePath } : {}),
    ...(autoApplyWhenClean === undefined ? {} : { autoApplyWhenClean }),
  };
}

export function validateInspectWorkspaceInput(
  input: unknown,
): InspectWorkspaceInput {
  if (!isPlainRecord(input)) {
    throw new Error("工作区检查参数格式无效");
  }
  const workspacePath = validateWorkspacePath(input.workspacePath);
  if (!workspacePath) throw new Error("工作区路径不能为空");
  return {
    workspacePath,
    taskId: input.taskId === undefined
      ? undefined
      : validateTaskId(input.taskId),
  };
}

export function validateWorkspaceHandoffInput(
  input: unknown,
): WorkspaceHandoffInput {
  if (!isPlainRecord(input)) {
    throw new Error("Handoff 参数格式无效");
  }
  const selection = validateWorkspaceEnvironmentSelection(input);
  return {
    taskId: validateTaskId(input.taskId),
    ...selection,
    expectedRevision: validateOptionalRevision(input.expectedRevision),
  };
}

export function validateGitBranchName(input: unknown): string {
  if (typeof input !== "string") throw new TypeError("分支名称必须是字符串");
  const value = input.trim();
  if (
    !value
    || value.length > 255
    || /[\u0000-\u0020~^:?*\\[]/.test(value)
    || value.includes("..")
    || value.includes("@{")
    || value.startsWith("/")
    || value.endsWith("/")
    || value.endsWith(".")
    || value.includes("//")
  ) {
    throw new Error("分支名称无效");
  }
  return value;
}

function validateGitRef(input: unknown, label: string): string {
  if (typeof input !== "string") throw new TypeError(`${label}必须是字符串`);
  const value = input.trim();
  if (!value || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label}无效`);
  }
  return value;
}

export function validateGitCheckoutInput(input: unknown): GitCheckoutInput {
  if (!isPlainRecord(input)) throw new Error("切换分支参数格式无效");
  return {
    taskId: validateTaskId(input.taskId),
    branchName: validateGitBranchName(input.branchName),
    expectedHead: input.expectedHead === undefined
      ? undefined
      : validateGitRef(input.expectedHead, "预期 HEAD"),
    expectedRevision: validateOptionalRevision(input.expectedRevision),
  };
}

export function validateCreateGitBranchInput(
  input: unknown,
): CreateGitBranchInput {
  if (!isPlainRecord(input)) throw new Error("创建分支参数格式无效");
  return {
    taskId: validateTaskId(input.taskId),
    branchName: validateGitBranchName(input.branchName),
    startPoint: input.startPoint === undefined
      ? undefined
      : validateGitRef(input.startPoint, "起始引用"),
    checkout: input.checkout === undefined ? true : input.checkout === true,
    expectedRevision: validateOptionalRevision(input.expectedRevision),
  };
}

export function validateGitHistoryInput(input: unknown): GitHistoryInput {
  if (!isPlainRecord(input)) throw new Error("提交历史参数格式无效");
  const limit = input.limit === undefined ? 30 : Number(input.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("提交历史数量无效");
  }
  return {
    taskId: validateTaskId(input.taskId),
    limit,
    cursor: input.cursor === undefined
      ? undefined
      : validateGitRef(input.cursor, "历史游标"),
  };
}

export function validateGitReviewScope(input: unknown): GitReviewScope {
  if (!isPlainRecord(input)) throw new Error("审阅范围格式无效");
  const scopeName = input.scope;
  if (
    scopeName !== "LAST_RUN"
    && scopeName !== "UNCOMMITTED"
    && scopeName !== "UNSTAGED"
    && scopeName !== "STAGED"
    && scopeName !== "COMMIT"
    && scopeName !== "BRANCH_COMPARE"
  ) {
    throw new Error("审阅范围无效");
  }
  const scope: GitReviewScope = { scope: scopeName };
  if (input.runId !== undefined) scope.runId = validateTaskId(input.runId);
  if (input.commitSha !== undefined) {
    scope.commitSha = validateGitRef(input.commitSha, "提交引用");
  }
  if (input.baseRef !== undefined) {
    scope.baseRef = validateGitRef(input.baseRef, "比较基准");
  }
  if (input.headRef !== undefined) {
    scope.headRef = validateGitRef(input.headRef, "比较目标");
  }
  if (scopeName === "LAST_RUN" && !scope.runId) {
    throw new Error("本轮审阅缺少 Run ID");
  }
  if (scopeName === "COMMIT" && !scope.commitSha) {
    throw new Error("提交审阅缺少 Commit");
  }
  if (scopeName === "BRANCH_COMPARE" && !scope.baseRef) {
    throw new Error("分支比较缺少基准分支");
  }
  return scope;
}

export function validateGetGitChangesInput(
  input: unknown,
): GetGitChangesInput {
  if (!isPlainRecord(input)) throw new Error("Git 变更参数格式无效");
  return {
    taskId: validateTaskId(input.taskId),
    scope: validateGitReviewScope(input.scope),
  };
}

export function validateListWorktreesInput(
  input: unknown,
): ListWorktreesInput {
  if (!isPlainRecord(input)) throw new Error("Worktree 参数格式无效");
  return { taskId: validateTaskId(input.taskId) };
}

export function validateRemoveWorktreeInput(
  input: unknown,
): RemoveWorktreeInput {
  if (!isPlainRecord(input)) throw new Error("删除 Worktree 参数格式无效");
  const worktreePath = validateWorkspacePath(input.worktreePath);
  if (!worktreePath) throw new Error("Worktree 路径不能为空");
  return {
    taskId: validateTaskId(input.taskId),
    worktreePath,
  };
}

export function validateSetWorktreeAutoApplyInput(
  input: unknown,
): SetWorktreeAutoApplyInput {
  if (!isPlainRecord(input) || typeof input.enabled !== "boolean") {
    throw new Error("Worktree 自动应用设置无效");
  }
  return {
    taskId: validateTaskId(input.taskId),
    enabled: input.enabled,
    expectedSettingsRevision: validateOptionalRevision(
      input.expectedSettingsRevision,
    ),
  };
}

function validateOptionalRevision(input: unknown): number | undefined {
  if (input === undefined) return undefined;
  const revision = Number(input);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("工作区版本无效");
  }
  return revision;
}

function isPlainRecord(input: unknown): input is Record<string, unknown> {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    Object.getPrototypeOf(input) === Object.prototype
  );
}
