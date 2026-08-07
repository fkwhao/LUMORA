import { randomUUID } from "node:crypto";

import type {
  ChatCompletion,
  ChatMessage,
  ChatRequestOptions,
  ChatStreamEvent,
  ContextCompactionResult,
  ArtifactChunk,
  ListModelsInput,
  ModelSettings,
  ModelProvider,
  SaveModelProviderInput,
  SaveProviderModelInput,
  ProviderModel,
  ToolApprovalDecision,
  UpdateModelSettingsInput,
} from "../shared/model-contract";
import { workLogFromEvents } from "../shared/work-log";
import type { JavaConnection } from "./java-connection";
import { validateJavaConnection } from "./java-connection";
import type { ModelGateway } from "./model-gateway";
import type { ModelStreamSubscription } from "./model-gateway";

type JavaError = {
  message?: string;
};

export class RestModelGateway implements ModelGateway {
  private readonly connection: JavaConnection;

  constructor(
    connection: JavaConnection,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.connection = validateJavaConnection(connection);
  }

  getSettings(): Promise<ModelSettings> {
    return this.request("/api/v1/model/settings");
  }

  listProviders(): Promise<ModelProvider[]> {
    return this.request("/api/v1/model/settings/providers");
  }

  createProvider(input: SaveModelProviderInput): Promise<ModelProvider> {
    return this.request("/api/v1/model/settings/providers", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateProvider(providerId: string, input: SaveModelProviderInput): Promise<ModelProvider> {
    return this.request(`/api/v1/model/settings/providers/${encodeURIComponent(providerId)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  activateProvider(providerId: string): Promise<ModelProvider> {
    return this.request(`/api/v1/model/settings/providers/${encodeURIComponent(providerId)}/activate`, {
      method: "POST",
    });
  }

  disableProvider(providerId: string): Promise<ModelProvider> {
    return this.request(`/api/v1/model/settings/providers/${encodeURIComponent(providerId)}/disable`, {
      method: "POST",
    });
  }

  async deleteProvider(providerId: string): Promise<void> {
    await this.request(`/api/v1/model/settings/providers/${encodeURIComponent(providerId)}`, {
      method: "DELETE",
    });
  }

  async listProviderModels(providerId: string, apiKey?: string): Promise<string[]> {
    const response = await this.request<{ models: string[] }>(
      `/api/v1/model/settings/providers/${encodeURIComponent(providerId)}/models`,
      { method: "POST", body: JSON.stringify({ apiKey }) },
      30_000,
    );
    return response.models;
  }

  createProviderModel(providerId: string, input: SaveProviderModelInput): Promise<ProviderModel> {
    return this.request(`/api/v1/model/settings/providers/${encodeURIComponent(providerId)}/model-configurations`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateProviderModel(providerId: string, modelConfigurationId: string, input: SaveProviderModelInput): Promise<ProviderModel> {
    return this.request(`/api/v1/model/settings/providers/${encodeURIComponent(providerId)}/model-configurations/${encodeURIComponent(modelConfigurationId)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  async deleteProviderModel(providerId: string, modelConfigurationId: string): Promise<void> {
    await this.request(`/api/v1/model/settings/providers/${encodeURIComponent(providerId)}/model-configurations/${encodeURIComponent(modelConfigurationId)}`, {
      method: "DELETE",
    });
  }

  async testProviderModel(providerId: string, modelConfigurationId: string): Promise<boolean> {
    const response = await this.request<{ connected: boolean }>(
      `/api/v1/model/settings/providers/${encodeURIComponent(providerId)}/model-configurations/${encodeURIComponent(modelConfigurationId)}/test`,
      { method: "POST" },
      90_000,
    );
    return response.connected;
  }

  updateSettings(input: UpdateModelSettingsInput): Promise<ModelSettings> {
    return this.request("/api/v1/model/settings", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  async listModels(input: ListModelsInput): Promise<string[]> {
    const response = await this.request<{ models: string[] }>(
      "/api/v1/model/settings/models",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      30_000,
    );
    return response.models;
  }

  complete(messages: ChatMessage[]): Promise<ChatCompletion> {
    return this.request(
      "/api/v1/chat/completions",
      {
        method: "POST",
        body: JSON.stringify({ messages }),
      },
      90_000,
    );
  }

  async listMessages(taskId: string): Promise<ChatMessage[]> {
    const messages = await this.request<ChatMessage[]>(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/messages`,
    );
    const threadMessages = messages.map(hydrateWorkLog);
    return threadMessages
      .filter((message) => message.activePath !== false)
      .sort(
        (left, right) =>
          (left.messageDepth ?? left.sequence ?? 0) -
          (right.messageDepth ?? right.sequence ?? 0),
      )
      .map((message) => ({ ...message, threadMessages }));
  }

  async activateMessageBranch(taskId: string, messageId: string): Promise<void> {
    await this.request(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/messages/${encodeURIComponent(messageId)}/activate`,
      { method: "POST" },
    );
  }

  compactContext(taskId: string, model?: string): Promise<ContextCompactionResult> {
    return this.request(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/context/compact`,
      { method: "POST", body: JSON.stringify({ model }) },
      150_000,
    );
  }

  readArtifact(
    taskId: string,
    artifactId: string,
    offset = 0,
    limit = 20_000,
  ): Promise<ArtifactChunk> {
    const query = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
    });
    return this.request(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/artifacts/${encodeURIComponent(artifactId)}?${query}`,
      {},
      30_000,
    );
  }

  async decideToolApproval(
    taskId: string,
    approvalId: string,
    decision: ToolApprovalDecision,
  ): Promise<void> {
    await this.request<{ accepted: boolean }>(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/tool-approvals/${encodeURIComponent(approvalId)}`,
      { method: "POST", body: JSON.stringify({ decision }) },
    );
  }

  streamMessage(
    taskId: string,
    content: string,
    onEvent: (event: ChatStreamEvent) => void,
    options?: ChatRequestOptions,
  ): ModelStreamSubscription {
    const controller = new AbortController();
    const completed = this.consumeMessageStream(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/messages/stream`,
      { content, ...options },
      onEvent,
      controller.signal,
    );
    return {
      cancel: () => {
        controller.abort();
        void this.cancelMessageStream(taskId);
      },
      completed,
    };
  }

  regenerateMessage(
    taskId: string,
    messageId: string,
    content: string,
    onEvent: (event: ChatStreamEvent) => void,
    options?: ChatRequestOptions,
  ): ModelStreamSubscription {
    const controller = new AbortController();
    const completed = this.consumeMessageStream(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/messages/${encodeURIComponent(messageId)}/regenerate`,
      { content, ...options },
      onEvent,
      controller.signal,
    );
    return {
      cancel: () => {
        controller.abort();
        void this.cancelMessageStream(taskId);
      },
      completed,
    };
  }

  private async cancelMessageStream(taskId: string): Promise<void> {
    try {
      await this.request<{ cancelled: boolean }>(
        `/api/v1/tasks/${encodeURIComponent(taskId)}/messages/cancel`,
        { method: "DELETE" },
      );
    } catch {
      // 本地流已经中断；取消通知失败不能把界面重新置为失败态。
    }
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    timeout = 10_000,
  ): Promise<T> {
    const response = await this.fetchImpl(
      `${this.connection.baseUrl}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${this.connection.sessionToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Correlation-Id": randomUUID(),
          ...init.headers,
        },
        signal: AbortSignal.timeout(timeout),
      },
    );
    if (!response.ok) {
      const error = await readJavaError(response);
      throw new Error(
        error.message ?? `Java Core 请求失败: HTTP ${response.status}`,
      );
    }
    return (await response.json()) as T;
  }

  private async consumeMessageStream(
    path: string,
    body: { content: string } & ChatRequestOptions,
    onEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const response = await this.fetchImpl(
      `${this.connection.baseUrl}${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.connection.sessionToken}`,
          Accept: "text/event-stream",
          "Content-Type": "application/json",
          "X-Correlation-Id": randomUUID(),
        },
        body: JSON.stringify(body),
        signal,
      },
    );
    if (!response.ok) {
      const error = await readJavaError(response);
      throw new Error(
        error.message ?? `Java Core 请求失败: HTTP ${response.status}`,
      );
    }
    if (!response.body) {
      throw new Error("Java Core 返回了空流");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        consumeSseLine(line, onEvent);
      }
      if (done) {
        if (buffer) {
          consumeSseLine(buffer, onEvent);
        }
        return;
      }
    }
  }
}

function hydrateWorkLog(message: ChatMessage): ChatMessage {
  if (!message.workLogJson) {
    return message;
  }
  try {
    const events = JSON.parse(message.workLogJson) as ChatStreamEvent[];
    return { ...message, workLog: workLogFromEvents(events) };
  } catch {
    return { ...message, workLog: [] };
  }
}

async function readJavaError(response: Response): Promise<JavaError> {
  try {
    return (await response.json()) as JavaError;
  } catch {
    return {};
  }
}

function consumeSseLine(
  line: string,
  onEvent: (event: ChatStreamEvent) => void,
): void {
  if (!line.startsWith("data:")) {
    return;
  }
  const json = line.slice("data:".length).trim();
  if (json) {
    onEvent(JSON.parse(json) as ChatStreamEvent);
  }
}
