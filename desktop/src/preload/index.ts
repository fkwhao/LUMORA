import { contextBridge, ipcRenderer, webUtils } from "electron";

import type {
  ApprovalDecisionInput,
  LumoraApi,
  TaskEvent,
  TaskPreferencesInput,
  TaskWorkspaceInput,
} from "../shared/task-contract";
import type {
  CloudConsoleDestination,
  CloudLoginInput,
  CloudModelSource,
} from "../shared/cloud-contract";
import type {
  ChatMessage,
  ChatRequestOptions,
  ChatStreamEvent,
  ConversationRunEvent,
  CreateConversationInput,
  UpdateConversationInput,
  ListModelsInput,
  SaveModelProviderInput,
  SaveProviderModelInput,
  UpdateModelSettingsInput,
  ToolApprovalDecision,
} from "../shared/model-contract";
import {
  validateApprovalDecisionInput,
  validateArtifactId,
  validateGoal,
  validateMessageId,
  validateTaskId,
  validateTaskPreferencesInput,
  validateTaskWorkspaceInput,
  validateWorkspacePath,
  validateWorkspaceEnvironmentSelection,
} from "../shared/validation";
import type { ResolvedAppearanceTheme } from "../shared/window-contract";
import type { SaveMcpServerInput } from "../shared/mcp-contract";
import type { LumoraSkillApi } from "../shared/skill-contract";
import type { ProjectDirectory } from "../shared/window-contract";
import type {
  MaterializeClipboardImageInput,
  MessageAttachment,
} from "../shared/attachment-contract";
import type {
  CitationPreviewBounds,
  CitationWebNavigationAction,
  CitationWebPreviewInput,
  CitationWebPreviewState,
} from "../shared/citation-contract";
import type {
  CreateGitBranchInput,
  GetGitChangesInput,
  GitCheckoutInput,
  GitHistoryInput,
  InspectWorkspaceInput,
  ListWorktreesInput,
  RemoveWorktreeInput,
  SetWorktreeAutoApplyInput,
  WorkspaceHandoffInput,
} from "../shared/workspace-contract";
import {
  validateCreateGitBranchInput,
  validateGetGitChangesInput,
  validateGitCheckoutInput,
  validateGitHistoryInput,
  validateInspectWorkspaceInput,
  validateListWorktreesInput,
  validateRemoveWorktreeInput,
  validateSetWorktreeAutoApplyInput,
  validateWorkspaceHandoffInput,
} from "../shared/validation";

const api: LumoraApi = {
  cloud: {
    getState: () => ipcRenderer.invoke("cloud:get-state"),
    restoreSession: () => ipcRenderer.invoke("cloud:restore-session"),
    login: (input: CloudLoginInput) =>
      ipcRenderer.invoke("cloud:login", validateCloudLogin(input)),
    logout: () => ipcRenderer.invoke("cloud:logout"),
    getDashboard: () => ipcRenderer.invoke("cloud:get-dashboard"),
    getModelCatalog: () => ipcRenderer.invoke("cloud:get-model-catalog"),
    setModelSource: (source: CloudModelSource) =>
      ipcRenderer.invoke("cloud:set-model-source", validateCloudModelSource(source)),
    selectCloudModel: (modelCode: string) =>
      ipcRenderer.invoke(
        "cloud:select-cloud-model",
        validateCloudIdentifier(modelCode, "模型编码"),
      ),
    selectLocalProvider: (providerId: string) =>
      ipcRenderer.invoke(
        "cloud:select-local-provider",
        validateCloudIdentifier(providerId, "供应商 ID"),
      ),
    openConsole: (destination: CloudConsoleDestination) =>
      ipcRenderer.invoke(
        "cloud:open-console",
        validateCloudDestination(destination),
      ),
  },
  attachments: {
    prepare: async (file: File) => {
      if (
        !file ||
        typeof file.name !== "string" ||
        typeof file.type !== "string" ||
        typeof file.arrayBuffer !== "function"
      ) {
        throw new TypeError("附件文件无效");
      }
      const filePath = webUtils.getPathForFile(file);
      if (filePath) {
        return ipcRenderer.invoke(
          "attachments:reference-local",
          filePath,
          file.type,
        );
      }
      if (!file.type.startsWith("image/")) {
        throw new TypeError("只能粘贴图片；其他附件请选择本地文件");
      }
      const input: MaterializeClipboardImageInput = {
        name: file.name,
        mimeType: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      };
      return ipcRenderer.invoke("attachments:materialize-clipboard-image", input);
    },
    select: () => ipcRenderer.invoke("attachments:select"),
    readImagePreview: (attachment: MessageAttachment) =>
      ipcRenderer.invoke("attachments:read-image-preview", attachment),
  },
  citations: {
    readLocal: (taskId: string, path: string) =>
      ipcRenderer.invoke(
        "citations:read-local",
        validateTaskId(taskId),
        validateCitationPath(path),
      ),
    readAttachment: (taskId: string, attachmentId: string) =>
      ipcRenderer.invoke(
        "citations:read-attachment",
        validateTaskId(taskId),
        validatePreviewId(attachmentId),
      ),
    showWeb: (input: CitationWebPreviewInput) =>
      ipcRenderer.invoke("citations:web-show", validateWebPreviewInput(input)),
    setWebBounds: (previewId: string, bounds: CitationPreviewBounds) =>
      ipcRenderer.invoke(
        "citations:web-set-bounds",
        validatePreviewId(previewId),
        validatePreviewBounds(bounds),
      ),
    hideWeb: (previewId: string) =>
      ipcRenderer.invoke("citations:web-hide", validatePreviewId(previewId)),
    closeWeb: (previewId: string) =>
      ipcRenderer.invoke("citations:web-close", validatePreviewId(previewId)),
    navigateWeb: (
      previewId: string,
      action: CitationWebNavigationAction,
    ) => ipcRenderer.invoke(
      "citations:web-navigate",
      validatePreviewId(previewId),
      validateWebNavigationAction(action),
    ),
    subscribeWebState: (
      listener: (state: CitationWebPreviewState) => void,
    ) => {
      if (typeof listener !== "function") {
        throw new TypeError("网页预览状态处理器必须是函数");
      }
      const handler = (
        _event: Electron.IpcRendererEvent,
        state: CitationWebPreviewState,
      ) => listener(state);
      ipcRenderer.on("citations:web-state", handler);
      return () => ipcRenderer.removeListener("citations:web-state", handler);
    },
  },
  tasks: {
    create: (goal, workspacePath, environmentSelection) => ipcRenderer.invoke(
      "tasks:create",
      validateGoal(goal),
      validateWorkspacePath(workspacePath),
      validateWorkspaceEnvironmentSelection(environmentSelection),
    ),
    list: () => ipcRenderer.invoke("tasks:list"),
    get: (taskId) => ipcRenderer.invoke("tasks:get", validateTaskId(taskId)),
    updatePreferences: (input: TaskPreferencesInput) =>
      ipcRenderer.invoke(
        "tasks:update-preferences",
        validateTaskPreferencesInput(input),
      ),
    updateWorkspace: (input: TaskWorkspaceInput) =>
      ipcRenderer.invoke(
        "tasks:update-workspace",
        validateTaskWorkspaceInput(input),
      ),
    subscribe: (untrustedTaskId, onEvent) => {
      const taskId = validateTaskId(untrustedTaskId);
      if (typeof onEvent !== "function") {
        throw new TypeError("任务事件处理器必须是函数");
      }
      const listener = (_event: Electron.IpcRendererEvent, event: TaskEvent) => {
        if (event.taskId === taskId) {
          onEvent(event);
        }
      };
      ipcRenderer.on("tasks:event", listener);
      ipcRenderer.send("tasks:subscribe", taskId);

      return () => {
        ipcRenderer.removeListener("tasks:event", listener);
        ipcRenderer.send("tasks:unsubscribe", taskId);
      };
    },
    decideApproval: (input: ApprovalDecisionInput) =>
      ipcRenderer.invoke(
        "tasks:decide-approval",
        validateApprovalDecisionInput(input),
      ),
  },
  model: {
    getUsageStatistics: (days?: number) =>
      ipcRenderer.invoke("model:usage-statistics", days),
    listProviders: () => ipcRenderer.invoke("model:list-providers"),
    createProvider: (input: SaveModelProviderInput) =>
      ipcRenderer.invoke("model:create-provider", input),
    updateProvider: (providerId: string, input: SaveModelProviderInput) =>
      ipcRenderer.invoke("model:update-provider", providerId, input),
    activateProvider: (providerId: string) =>
      ipcRenderer.invoke("model:activate-provider", providerId),
    disableProvider: (providerId: string) =>
      ipcRenderer.invoke("model:disable-provider", providerId),
    deleteProvider: (providerId: string) =>
      ipcRenderer.invoke("model:delete-provider", providerId),
    listProviderModels: (providerId: string, apiKey?: string) =>
      ipcRenderer.invoke("model:list-provider-models", providerId, apiKey),
    createProviderModel: (providerId: string, input: SaveProviderModelInput) =>
      ipcRenderer.invoke("model:create-provider-model", providerId, input),
    updateProviderModel: (providerId: string, modelConfigurationId: string, input: SaveProviderModelInput) =>
      ipcRenderer.invoke("model:update-provider-model", providerId, modelConfigurationId, input),
    deleteProviderModel: (providerId: string, modelConfigurationId: string) =>
      ipcRenderer.invoke("model:delete-provider-model", providerId, modelConfigurationId),
    testProviderModel: (providerId: string, modelConfigurationId: string) =>
      ipcRenderer.invoke("model:test-provider-model", providerId, modelConfigurationId),
    getSettings: () => ipcRenderer.invoke("model:get-settings"),
    updateSettings: (input: UpdateModelSettingsInput) =>
      ipcRenderer.invoke("model:update-settings", input),
    listModels: (input: ListModelsInput) =>
      ipcRenderer.invoke("model:list-models", input),
    complete: (messages: ChatMessage[]) =>
      ipcRenderer.invoke("model:complete", messages),
    listMessages: (taskId) =>
      ipcRenderer.invoke("model:list-messages", validateTaskId(taskId)),
    activateMessageBranch: (taskId, messageId) =>
      ipcRenderer.invoke(
        "model:activate-message-branch",
        validateTaskId(taskId),
        validateMessageId(messageId),
      ),
    compactContext: (taskId, model) =>
      ipcRenderer.invoke(
        "model:compact-context",
        validateTaskId(taskId),
        model?.trim() || undefined,
      ),
    readArtifact: (taskId, artifactId, offset, limit) =>
      ipcRenderer.invoke(
        "model:read-artifact",
        validateTaskId(taskId),
        validateArtifactId(artifactId),
        offset,
        limit,
      ),
    decideToolApproval: (
      taskId,
      approvalId,
      decision: ToolApprovalDecision,
    ) =>
      ipcRenderer.invoke("model:decide-tool-approval", {
        taskId: validateTaskId(taskId),
        approvalId: validateMessageId(approvalId),
        decision,
      }),
    getActiveRun: (taskId) =>
      ipcRenderer.invoke("model:get-active-run", validateTaskId(taskId)),
    listInputs: (taskId) =>
      ipcRenderer.invoke("model:list-inputs", validateTaskId(taskId)),
    createInput: (taskId, input: CreateConversationInput) =>
      ipcRenderer.invoke(
        "model:create-input",
        validateTaskId(taskId),
        input,
      ),
    updateInput: (
      taskId,
      inputId,
      input: UpdateConversationInput,
    ) => ipcRenderer.invoke(
      "model:update-input",
      validateTaskId(taskId),
      validateMessageId(inputId),
      input,
    ),
    deleteInput: (taskId, inputId) =>
      ipcRenderer.invoke(
        "model:delete-input",
        validateTaskId(taskId),
        validateMessageId(inputId),
      ),
    pauseRun: (taskId, runId) =>
      ipcRenderer.invoke(
        "model:pause-run",
        validateTaskId(taskId),
        validateMessageId(runId),
      ),
    resumeRun: (taskId, runId) =>
      ipcRenderer.invoke(
        "model:resume-run",
        validateTaskId(taskId),
        validateMessageId(runId),
      ),
    cancelRun: (taskId, runId) =>
      ipcRenderer.invoke(
        "model:cancel-run",
        validateTaskId(taskId),
        validateMessageId(runId),
      ),
    getRunChanges: (taskId, runId) =>
      ipcRenderer.invoke(
        "model:get-run-changes",
        validateTaskId(taskId),
        validateMessageId(runId),
      ),
    revertRun: (taskId, runId) =>
      ipcRenderer.invoke(
        "model:revert-run",
        validateTaskId(taskId),
        validateMessageId(runId),
      ),
    getTaskWorktree: (taskId) =>
      ipcRenderer.invoke(
        "model:get-task-worktree",
        validateTaskId(taskId),
      ),
    getTaskWorktreeChanges: (taskId) =>
      ipcRenderer.invoke(
        "model:get-task-worktree-changes",
        validateTaskId(taskId),
      ),
    applyTaskWorktree: (taskId) =>
      ipcRenderer.invoke(
        "model:apply-task-worktree",
        validateTaskId(taskId),
      ),
    createTaskWorktreeBranch: (taskId, branchName) =>
      ipcRenderer.invoke(
        "model:create-task-worktree-branch",
        validateTaskId(taskId),
        validateBranchName(branchName),
      ),
    discardTaskWorktree: (taskId) =>
      ipcRenderer.invoke(
        "model:discard-task-worktree",
        validateTaskId(taskId),
      ),
    subscribeRun: (
      untrustedTaskId,
      untrustedRunId,
      afterSequence,
      onEvent,
    ) => {
      const taskId = validateTaskId(untrustedTaskId);
      const runId = validateMessageId(untrustedRunId);
      if (!Number.isInteger(afterSequence) || afterSequence < 0) {
        throw new TypeError("运行事件序号无效");
      }
      if (typeof onEvent !== "function") {
        throw new TypeError("运行事件处理器必须是函数");
      }
      const requestId = globalThis.crypto.randomUUID();
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { requestId: string; runEvent?: ConversationRunEvent },
      ) => {
        if (payload.requestId === requestId && payload.runEvent) {
          onEvent(payload.runEvent);
        }
      };
      ipcRenderer.on("model:stream-event", listener);
      ipcRenderer.send("model:stream-start", {
        requestId,
        taskId,
        runId,
        afterSequence,
      });
      return () => {
        ipcRenderer.removeListener("model:stream-event", listener);
        ipcRenderer.send("model:stream-cancel", requestId);
      };
    },
    streamMessage: (
      untrustedTaskId,
      untrustedContent,
      onEvent,
      options?: ChatRequestOptions,
    ) => {
      const taskId = validateTaskId(untrustedTaskId);
      const content = untrustedContent.trim();
      if (!content) {
        throw new TypeError("消息内容不能为空");
      }
      if (typeof onEvent !== "function") {
        throw new TypeError("模型流事件处理器必须是函数");
      }
      // 使用 Chromium Web Crypto，避免沙箱化 Preload 加载 Node crypto 失败。
      const requestId = globalThis.crypto.randomUUID();
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { requestId: string; event: ChatStreamEvent },
      ) => {
        if (payload.requestId === requestId) {
          onEvent(payload.event);
        }
      };
      ipcRenderer.on("model:stream-event", listener);
      ipcRenderer.send("model:stream-start", {
        requestId,
        taskId,
        content,
        options,
      });
      return () => {
        ipcRenderer.removeListener("model:stream-event", listener);
        ipcRenderer.send("model:stream-cancel", requestId);
      };
    },
    regenerateMessage: (
      untrustedTaskId,
      untrustedMessageId,
      untrustedContent,
      onEvent,
      options?: ChatRequestOptions,
    ) => {
      const taskId = validateTaskId(untrustedTaskId);
      const messageId = validateMessageId(untrustedMessageId);
      const content = untrustedContent.trim();
      if (!content) {
        throw new TypeError("消息内容不能为空");
      }
      if (typeof onEvent !== "function") {
        throw new TypeError("模型流事件处理器必须是函数");
      }
      const requestId = globalThis.crypto.randomUUID();
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { requestId: string; event: ChatStreamEvent },
      ) => {
        if (payload.requestId === requestId) {
          onEvent(payload.event);
        }
      };
      ipcRenderer.on("model:stream-event", listener);
      ipcRenderer.send("model:stream-start", {
        requestId,
        taskId,
        messageId,
        content,
        options,
      });
      return () => {
        ipcRenderer.removeListener("model:stream-event", listener);
        ipcRenderer.send("model:stream-cancel", requestId);
      };
    },
  },
  memory: {
    getSettings: () => ipcRenderer.invoke("memory:get-settings"),
    updateSettings: (enabled: boolean) => {
      if (typeof enabled !== "boolean") {
        throw new TypeError("记忆开关必须是布尔值");
      }
      return ipcRenderer.invoke("memory:update-settings", enabled);
    },
    reset: () => ipcRenderer.invoke("memory:reset"),
  },
  mcp: {
    listServers: () => ipcRenderer.invoke("mcp:list-servers"),
    saveServer: (serverId: string, input: SaveMcpServerInput) =>
      ipcRenderer.invoke("mcp:save-server", serverId, input),
    deleteServer: (serverId: string) =>
      ipcRenderer.invoke("mcp:delete-server", serverId),
    testServer: (serverId: string) =>
      ipcRenderer.invoke("mcp:test-server", serverId),
  },
  skill: {
    list: (workspacePath?: string) => ipcRenderer.invoke("skill:list", workspacePath),
    setEnabled: (name: string, enabled: boolean) =>
      ipcRenderer.invoke("skill:set-enabled", name, enabled),
    openDirectory: (scope, workspacePath?: string) =>
      ipcRenderer.invoke("skill:open-directory", scope, workspacePath),
    installFromDirectory: (scope, workspacePath?: string) =>
      ipcRenderer.invoke("skill:install-from-directory", scope, workspacePath),
  } satisfies LumoraSkillApi,
  window: {
    setAppearance: (theme: ResolvedAppearanceTheme) => {
      if (theme !== "light" && theme !== "dark") {
        throw new TypeError("窗口主题必须是 light 或 dark");
      }
      ipcRenderer.send("window:set-appearance", theme);
    },
    selectProjectDirectory: (): Promise<ProjectDirectory | undefined> =>
      ipcRenderer.invoke("workspace:select-project-directory"),
  },
  workspace: {
    inspect: (input: InspectWorkspaceInput) =>
      ipcRenderer.invoke(
        "workspace-git:inspect",
        validateInspectWorkspaceInput(input),
      ),
    handoff: (input: WorkspaceHandoffInput) =>
      ipcRenderer.invoke(
        "workspace-git:handoff",
        validateWorkspaceHandoffInput(input),
      ),
    listBranches: (taskId: string) =>
      ipcRenderer.invoke("workspace-git:list-branches", validateTaskId(taskId)),
    checkoutBranch: (input: GitCheckoutInput) =>
      ipcRenderer.invoke(
        "workspace-git:checkout-branch",
        validateGitCheckoutInput(input),
      ),
    createBranch: (input: CreateGitBranchInput) =>
      ipcRenderer.invoke(
        "workspace-git:create-branch",
        validateCreateGitBranchInput(input),
      ),
    listHistory: (input: GitHistoryInput) =>
      ipcRenderer.invoke(
        "workspace-git:list-history",
        validateGitHistoryInput(input),
      ),
    getChanges: (input: GetGitChangesInput) =>
      ipcRenderer.invoke(
        "workspace-git:get-changes",
        validateGetGitChangesInput(input),
      ),
    listWorktrees: (input: ListWorktreesInput) =>
      ipcRenderer.invoke(
        "workspace-git:list-worktrees",
        validateListWorktreesInput(input),
      ),
    removeWorktree: (input: RemoveWorktreeInput) =>
      ipcRenderer.invoke(
        "workspace-git:remove-worktree",
        validateRemoveWorktreeInput(input),
      ),
    pruneWorktrees: (input: ListWorktreesInput) =>
      ipcRenderer.invoke(
        "workspace-git:prune-worktrees",
        validateListWorktreesInput(input),
      ),
    setWorktreeAutoApply: (input: SetWorktreeAutoApplyInput) =>
      ipcRenderer.invoke(
        "workspace-git:set-worktree-auto-apply",
        validateSetWorktreeAutoApplyInput(input),
      ),
  },
};

// 只暴露具体业务动作，不把 ipcRenderer 或任意 channel 交给页面。
contextBridge.exposeInMainWorld("lumora", api);

function validateBranchName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("分支名称不能为空");
  }
  const branchName = value.trim();
  if (branchName.length > 255) {
    throw new TypeError("分支名称不能超过 255 个字符");
  }
  return branchName;
}

function validateCloudLogin(value: CloudLoginInput): CloudLoginInput {
  if (!value || typeof value !== "object") {
    throw new TypeError("登录参数无效");
  }
  const email = value.email?.trim().toLowerCase();
  if (!email || email.length > 254 || !email.includes("@")) {
    throw new TypeError("请输入有效邮箱");
  }
  if (typeof value.password !== "string" || !value.password || value.password.length > 72) {
    throw new TypeError("请输入有效密码");
  }
  return { email, password: value.password };
}

function validateCloudModelSource(value: unknown): CloudModelSource {
  if (value !== "LOCAL_BYOK" && value !== "CLOUD_MANAGED") {
    throw new TypeError("模型来源无效");
  }
  return value;
}

function validateCloudIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw new TypeError(`${label}无效`);
  }
  return value.trim();
}

function validateCloudDestination(value: unknown): CloudConsoleDestination {
  if (value !== "home" && value !== "plans" && value !== "wallet") {
    throw new TypeError("控制台目标无效");
  }
  return value;
}

function validateCitationPath(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 4_000) {
    throw new TypeError("引用文件路径无效");
  }
  return value.trim();
}

function validatePreviewId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 500) {
    throw new TypeError("网页预览 ID 无效");
  }
  return value.trim();
}

function validatePreviewBounds(value: unknown): CitationPreviewBounds {
  if (!value || typeof value !== "object") {
    throw new TypeError("网页预览区域无效");
  }
  const bounds = value as CitationPreviewBounds;
  for (const coordinate of [bounds.x, bounds.y, bounds.width, bounds.height]) {
    if (typeof coordinate !== "number" || !Number.isFinite(coordinate)) {
      throw new TypeError("网页预览坐标无效");
    }
  }
  if (bounds.width < 1 || bounds.height < 1) {
    throw new TypeError("网页预览区域不能为空");
  }
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  };
}

function validateWebPreviewInput(
  value: CitationWebPreviewInput,
): CitationWebPreviewInput {
  if (!value || typeof value !== "object") {
    throw new TypeError("网页预览参数无效");
  }
  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    throw new TypeError("网页预览地址无效");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("仅支持 HTTP 或 HTTPS 网页预览");
  }
  return {
    previewId: validatePreviewId(value.previewId),
    url: url.toString(),
    bounds: validatePreviewBounds(value.bounds),
  };
}

function validateWebNavigationAction(
  value: unknown,
): CitationWebNavigationAction {
  if (!new Set(["back", "forward", "reload", "stop"]).has(String(value))) {
    throw new TypeError("网页预览操作无效");
  }
  return value as CitationWebNavigationAction;
}
