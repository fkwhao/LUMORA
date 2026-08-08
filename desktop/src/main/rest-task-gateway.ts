import { randomUUID } from "node:crypto";

import { JavaEventStream, type EventSubscription } from "./java-event-stream";
import type { JavaConnection } from "./java-connection";
import { validateJavaConnection } from "./java-connection";
import type { TaskGateway } from "./task-gateway";
import type {
  ApprovalDecisionInput,
  TaskEvent,
  TaskSnapshot,
  TaskSummary,
  TaskPreferencesInput,
} from "../shared/task-contract";
import {
  validateApprovalDecisionInput,
  validateGoal,
  validateTaskId,
  validateTaskPreferencesInput,
} from "../shared/validation";

type JavaError = {
  code?: string;
  message?: string;
};

export class RestTaskGateway implements TaskGateway {
  private readonly connection: JavaConnection;
  private readonly eventStream: JavaEventStream;
  private readonly subscriptions = new Set<EventSubscription>();

  constructor(
    connection: JavaConnection,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.connection = validateJavaConnection(connection);
    this.eventStream = new JavaEventStream(connection, fetchImpl);
  }

  create(goal: string): Promise<TaskSnapshot> {
    return this.request("/api/v1/tasks", {
      method: "POST",
      headers: {
        "X-Correlation-Id": randomUUID(),
      },
      body: JSON.stringify({ goal: validateGoal(goal) }),
    });
  }

  list(): Promise<TaskSummary[]> {
    return this.request("/api/v1/tasks");
  }

  get(taskId: string): Promise<TaskSnapshot> {
    const validatedTaskId = validateTaskId(taskId);
    return this.request(`/api/v1/tasks/${validatedTaskId}`);
  }

  updatePreferences(input: TaskPreferencesInput): Promise<TaskSnapshot> {
    const preferences = validateTaskPreferencesInput(input);
    return this.request(`/api/v1/tasks/${preferences.taskId}/preferences`, {
      method: "PUT",
      body: JSON.stringify({
        model: preferences.model,
        reasoningEffort: preferences.reasoningEffort,
      }),
    });
  }

  subscribe(
    taskId: string,
    listener: (event: TaskEvent) => void,
  ): () => void {
    const validatedTaskId = validateTaskId(taskId);
    const subscription = this.eventStream.subscribe(
      validatedTaskId,
      listener,
    );
    this.subscriptions.add(subscription);
    void subscription.completed
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          console.error("Java 任务事件流已断开", error);
        }
      })
      .finally(() => this.subscriptions.delete(subscription));
    return () => {
      subscription.unsubscribe();
      this.subscriptions.delete(subscription);
    };
  }

  decideApproval(input: ApprovalDecisionInput): Promise<TaskSnapshot> {
    const decision = validateApprovalDecisionInput(input);
    return this.request(
      `/api/v1/tasks/${decision.taskId}/approvals/${decision.approvalId}`,
      {
        method: "POST",
        body: JSON.stringify({ decision: decision.decision }),
      },
    );
  }

  dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.subscriptions.clear();
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await this.fetchImpl(
      `${this.connection.baseUrl}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${this.connection.sessionToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...init.headers,
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      const error = await readJavaError(response);
      throw new Error(error.message ?? `Java Core 请求失败: HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }
}

async function readJavaError(response: Response): Promise<JavaError> {
  try {
    return (await response.json()) as JavaError;
  } catch {
    return {};
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
