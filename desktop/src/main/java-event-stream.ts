import type { JavaConnection } from "./java-connection";
import { validateJavaConnection } from "./java-connection";
import type {
  TaskEvent,
  TaskEventType,
  TaskStatus,
} from "../shared/task-contract";

type Fetch = typeof fetch;

export interface EventSubscription {
  unsubscribe(): void;
  completed: Promise<void>;
}

export class JavaEventStream {
  private readonly connection: JavaConnection;

  constructor(
    connection: JavaConnection,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    this.connection = validateJavaConnection(connection);
  }

  subscribe(
    taskId: string,
    listener: (event: TaskEvent) => void,
  ): EventSubscription {
    const abortController = new AbortController();
    const completed = this.read(
      taskId,
      listener,
      abortController.signal,
    );
    return {
      unsubscribe: () => abortController.abort(),
      completed,
    };
  }

  private async read(
    taskId: string,
    listener: (event: TaskEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const response = await this.fetchImpl(
      `${this.connection.baseUrl}/api/v1/tasks/${taskId}/events`,
      {
        headers: {
          Authorization: `Bearer ${this.connection.sessionToken}`,
          Accept: "text/event-stream",
        },
        signal,
      },
    );
    if (!response.ok || !response.body) {
      throw new Error(`任务事件连接失败: HTTP ${response.status}`);
    }

    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true }).replaceAll("\r\n", "\n");
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const event = parseTaskEvent(frame);
        if (event?.taskId === taskId) {
          listener(event);
        }
      }
    }
    buffer += decoder.decode();
    const event = parseTaskEvent(buffer);
    if (event?.taskId === taskId) {
      listener(event);
    }
  }
}

function parseTaskEvent(frame: string): TaskEvent | undefined {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) {
    return undefined;
  }
  try {
    const input: unknown = JSON.parse(data);
    return isTaskEvent(input) ? input : undefined;
  } catch {
    return undefined;
  }
}

const taskStatuses = new Set<TaskStatus>([
  "CREATED",
  "PLANNING",
  "RUNNING",
  "WAITING_APPROVAL",
  "COMPLETED",
  "REJECTED",
  "INTERRUPTED",
  "FAILED",
]);
const taskEventTypes = new Set<TaskEventType>([
  "TASK_CREATED",
  "STATUS_CHANGED",
  "PLAN_STEP_STARTED",
  "PLAN_STEP_COMPLETED",
  "APPROVAL_REQUESTED",
  "APPROVAL_DECIDED",
  "RESULT_AVAILABLE",
  "TASK_ERROR",
]);

function isTaskEvent(input: unknown): input is TaskEvent {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }
  const event = input as Record<string, unknown>;
  return (
    typeof event.taskId === "string" &&
    typeof event.sequence === "number" &&
    typeof event.type === "string" &&
    taskEventTypes.has(event.type as TaskEventType) &&
    typeof event.status === "string" &&
    taskStatuses.has(event.status as TaskStatus) &&
    typeof event.title === "string" &&
    typeof event.userMessage === "string"
  );
}
