export type TaskStatus =
  | "CREATED"
  | "PLANNING"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "COMPLETED"
  | "REJECTED"
  | "INTERRUPTED"
  | "FAILED";

export type TaskEventType =
  | "TASK_CREATED"
  | "STATUS_CHANGED"
  | "PLAN_STEP_STARTED"
  | "PLAN_STEP_COMPLETED"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_DECIDED"
  | "RESULT_AVAILABLE"
  | "TASK_ERROR";

export type ApprovalDecision = "ALLOW_ONCE" | "REJECT";

export interface ApprovalRequest {
  approvalId: string;
  taskId: string;
  action: string;
  impactSummary: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  reversible: boolean;
}

export interface TaskPlanStep {
  stepId: string;
  title: string;
  description: string;
  requiresApproval: boolean;
}

export interface TaskSnapshot {
  taskId: string;
  goal: string;
  status: TaskStatus;
  lastEventSequence: number;
  activeStep: string;
  resultSummary: string;
  planSteps: TaskPlanStep[];
  createdAt?: string;
  updatedAt?: string;
  approval?: ApprovalRequest;
  errorMessage?: string;
  selectedModel?: string;
  selectedReasoningEffort?: string;
  workspacePath?: string;
}

export interface TaskSummary {
  taskId: string;
  goal: string;
  status: TaskStatus;
  updatedAt?: string;
  workspacePath?: string;
}

export interface TaskEvent {
  taskId: string;
  sequence: number;
  type: TaskEventType;
  status: TaskStatus;
  title: string;
  userMessage: string;
  approval?: ApprovalRequest;
  errorMessage?: string;
}

export interface ApprovalDecisionInput {
  taskId: string;
  approvalId: string;
  decision: ApprovalDecision;
}

export interface TaskPreferencesInput {
  taskId: string;
  model: string;
  reasoningEffort: string;
}

export interface TaskWorkspaceInput {
  taskId: string;
  workspacePath: string;
}

// 这是 Renderer 能看到的完整能力面，不能加入通用 invoke 或任意 channel。
export interface LumoraTaskApi {
  create(
    goal: string,
    workspacePath?: string,
    environmentSelection?: WorkspaceEnvironmentSelection,
  ): Promise<TaskSnapshot>;
  list(): Promise<TaskSummary[]>;
  get(taskId: string): Promise<TaskSnapshot>;
  updatePreferences(input: TaskPreferencesInput): Promise<TaskSnapshot>;
  updateWorkspace(input: TaskWorkspaceInput): Promise<TaskSnapshot>;
  subscribe(
    taskId: string,
    onEvent: (event: TaskEvent) => void,
  ): () => void;
  decideApproval(input: ApprovalDecisionInput): Promise<TaskSnapshot>;
}

export interface LumoraApi {
  tasks: LumoraTaskApi;
  cloud: LumoraCloudApi;
  model: LumoraModelApi;
  attachments: LumoraAttachmentApi;
  memory: LumoraMemoryApi;
  mcp: LumoraMcpApi;
  skill: LumoraSkillApi;
  window: LumoraWindowApi;
  workspace: LumoraWorkspaceApi;
  citations: LumoraCitationApi;
}

declare global {
  interface Window {
    lumora: LumoraApi;
  }
}
import type { LumoraModelApi } from "./model-contract";
import type { LumoraCloudApi } from "./cloud-contract";
import type { LumoraAttachmentApi } from "./attachment-contract";
import type { LumoraMemoryApi } from "./memory-contract";
import type { LumoraMcpApi } from "./mcp-contract";
import type { LumoraSkillApi } from "./skill-contract";
import type { LumoraWindowApi } from "./window-contract";
import type { LumoraCitationApi } from "./citation-contract";
import type {
  LumoraWorkspaceApi,
  WorkspaceEnvironmentSelection,
} from "./workspace-contract";
