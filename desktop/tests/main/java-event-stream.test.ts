import { describe, expect, it } from "vitest";

import { JavaEventStream } from "../../src/main/java-event-stream";
import type { TaskEvent } from "../../src/shared/task-contract";

describe("Java SSE event stream", () => {
  it("forwards only valid events for the subscribed task", async () => {
    const body = [
      'event: task\ndata: {"taskId":"other","sequence":1,"type":"STATUS_CHANGED","status":"RUNNING","title":"other","userMessage":"other"}\n\n',
      'event: task\ndata: {"taskId":"task-1","sequence":2,"type":"STATUS_CHANGED","status":"RUNNING","title":"执行","userMessage":"正在执行"}\n\n',
    ];
    const stream = new JavaEventStream(
      {
        baseUrl: "http://127.0.0.1:18080",
        sessionToken: "test-token",
      },
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (const chunk of body) {
                controller.enqueue(new TextEncoder().encode(chunk));
              }
              controller.close();
            },
          }),
          { status: 200 },
        ),
    );
    const events: TaskEvent[] = [];

    const done = stream.subscribe("task-1", (event) => events.push(event));
    await done.completed;

    expect(events).toHaveLength(1);
    expect(events[0]?.taskId).toBe("task-1");
    done.unsubscribe();
  });
});
