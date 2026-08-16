// @vitest-environment node

import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { RestModelGateway } from "../../src/main/rest-model-gateway";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("Java REST model gateway", () => {
  it("loads local token usage statistics", async () => {
    let receivedPath = "";
    const baseUrl = await listen(async (request) => {
      receivedPath = request.url ?? "";
      return {
        usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
        peakDailyTokens: 12,
        activeDays: 1,
        currentStreak: 1,
        longestStreak: 1,
        requestCount: 1,
        conversationCount: 1,
        daily: [],
      };
    });
    const gateway = new RestModelGateway({
      baseUrl,
      sessionToken: "test-token",
    });

    const statistics = await gateway.getUsageStatistics(365);

    expect(receivedPath).toBe("/api/v1/usage/statistics?days=365");
    expect(statistics.usage.totalTokens).toBe(12);
  });

  it("retrieves the available model IDs through Java Core", async () => {
    let receivedPath = "";
    let receivedBody = "";
    const baseUrl = await listen(async (request) => {
      receivedPath = request.url ?? "";
      receivedBody = await readBody(request);
      return { models: ["deepseek-v4-flash", "deepseek-v4-pro"] };
    });
    const gateway = new RestModelGateway({
      baseUrl,
      sessionToken: "test-token",
    });

    const models = await gateway.listModels({
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      apiFormat: "anthropic",
      apiKey: "provider-secret",
    });

    expect(receivedPath).toBe("/api/v1/model/settings/models");
    expect(JSON.parse(receivedBody)).toEqual({
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      apiFormat: "anthropic",
      apiKey: "provider-secret",
    });
    expect(models).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
  });

  it("sends chat history through the authenticated Java boundary", async () => {
    let receivedAuthorization = "";
    let receivedBody = "";
    const baseUrl = await listen(async (request) => {
      receivedAuthorization = request.headers.authorization ?? "";
      receivedBody = await readBody(request);
      return {
        message: "你好，我是 LUMORA。",
        model: "example-model",
        usage: {
          promptTokens: 4,
          completionTokens: 6,
          totalTokens: 10,
        },
      };
    });
    const gateway = new RestModelGateway({
      baseUrl,
      sessionToken: "test-token",
    });

    const completion = await gateway.complete([
      { role: "user", content: "你好" },
    ]);

    expect(completion.message).toBe("你好，我是 LUMORA。");
    expect(receivedAuthorization).toBe("Bearer test-token");
    expect(JSON.parse(receivedBody)).toEqual({
      messages: [{ role: "user", content: "你好" }],
    });
  });

  it("forwards one new message and parses incremental SSE events", async () => {
    let receivedBody = "";
    const server = createServer(async (request, response) => {
      receivedBody = await readBody(request);
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(
        'data: {"type":"text_delta","delta":"你","model":"demo","errorMessage":""}\n\n',
      );
      response.write(
        'data: {"type":"reasoning_delta","delta":"分析问题","model":"demo","errorMessage":""}\n\n',
      );
      response.write(
        'data: {"type":"text_delta","delta":"好","model":"demo","errorMessage":""}\n\n',
      );
      response.end(
        'data: {"type":"completed","delta":"","model":"demo","errorMessage":""}\n\n',
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    const gateway = new RestModelGateway({
      baseUrl: `http://127.0.0.1:${address.port}`,
      sessionToken: "test-token",
    });
    const events: string[] = [];
    const reasoningEvents: string[] = [];

    const subscription = gateway.streamMessage(
      "task-1",
      "你好",
      (event) => {
        if (event.type === "text_delta") {
          events.push(event.delta);
        }
        if (event.type === "reasoning_delta") {
          reasoningEvents.push(event.delta);
        }
      },
      {
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
        permissionMode: "request_approval",
      },
    );
    await subscription.completed;

    expect(JSON.parse(receivedBody)).toEqual({
      content: "你好",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      permissionMode: "request_approval",
    });
    expect(events.join("")).toBe("你好");
    expect(reasoningEvents.join("")).toBe("分析问题");
  });

  it("forwards a human tool approval decision to the task endpoint", async () => {
    let receivedPath = "";
    let receivedBody = "";
    const baseUrl = await listen(async (request) => {
      receivedPath = request.url ?? "";
      receivedBody = await readBody(request);
      return { accepted: true };
    });
    const gateway = new RestModelGateway({
      baseUrl,
      sessionToken: "test-token",
    });

    await gateway.decideToolApproval(
      "task-1",
      "approval-1",
      "allow_always",
    );

    expect(receivedPath).toBe(
      "/api/v1/tasks/task-1/tool-approvals/approval-1",
    );
    expect(JSON.parse(receivedBody)).toEqual({ decision: "allow_always" });
  });

  it("regenerates from the selected user message endpoint", async () => {
    let receivedPath = "";
    let receivedBody = "";
    const server = createServer(async (request, response) => {
      receivedPath = request.url ?? "";
      receivedBody = await readBody(request);
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(
        'data: {"type":"completed","delta":"","model":"demo","errorMessage":""}\n\n',
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    const gateway = new RestModelGateway({
      baseUrl: `http://127.0.0.1:${address.port}`,
      sessionToken: "test-token",
    });

    const subscription = gateway.regenerateMessage(
      "task-1",
      "message-2",
      "更新后的问题",
      () => undefined,
    );
    await subscription.completed;

    expect(receivedPath).toBe(
      "/api/v1/tasks/task-1/messages/message-2/regenerate",
    );
    expect(JSON.parse(receivedBody)).toEqual({ content: "更新后的问题" });
  });

  it("returns the active path while retaining sibling branches for Previous", async () => {
    const baseUrl = await listen(async () => [
      {
        messageId: "user-old",
        sequence: 1,
        messageDepth: 1,
        activePath: false,
        role: "user",
        content: "old question",
      },
      {
        messageId: "user-new",
        sequence: 3,
        messageDepth: 1,
        activePath: true,
        role: "user",
        content: "new question",
      },
      {
        messageId: "answer-new",
        sequence: 4,
        parentMessageId: "user-new",
        messageDepth: 2,
        activePath: true,
        role: "assistant",
        content: "new answer",
      },
      {
        messageId: "failed-usage",
        sequence: 5,
        parentMessageId: "user-new",
        messageDepth: 2,
        activePath: true,
        usageRecordOnly: true,
        role: "assistant",
        content: "",
        usage: {
          promptTokens: 20,
          completionTokens: 2,
          totalTokens: 22,
        },
      },
    ]);
    const gateway = new RestModelGateway({
      baseUrl,
      sessionToken: "test-token",
    });

    const messages = await gateway.listMessages("task-1");

    expect(messages.map((message) => message.messageId)).toEqual([
      "user-new",
      "answer-new",
    ]);
    expect(messages[0]?.threadMessages?.map((message) => message.messageId)).toEqual([
      "user-old",
      "user-new",
      "answer-new",
      "failed-usage",
    ]);
  });

  it("activates a persisted Previous branch through Java Core", async () => {
    let receivedPath = "";
    let receivedMethod = "";
    const baseUrl = await listen(async (request) => {
      receivedPath = request.url ?? "";
      receivedMethod = request.method ?? "";
      return { activated: true };
    });
    const gateway = new RestModelGateway({
      baseUrl,
      sessionToken: "test-token",
    });

    await gateway.activateMessageBranch("task/1", "message/2");

    expect(receivedMethod).toBe("POST");
    expect(receivedPath).toBe(
      "/api/v1/tasks/task%2F1/messages/message%2F2/activate",
    );
  });

  it("loads and pauses the active durable run", async () => {
    const requests: Array<{ method: string; path: string }> = [];
    const run = {
      runId: "run-1",
      taskId: "task-1",
      status: "RUNNING",
      triggerType: "MESSAGE",
      lastEventSequence: 4,
      replayFromSequence: 0,
      errorMessage: "",
      createdAt: "2026-08-15T00:00:00Z",
      updatedAt: "2026-08-15T00:00:01Z",
    };
    const baseUrl = await listen(async (request) => {
      requests.push({
        method: request.method ?? "",
        path: request.url ?? "",
      });
      return request.url?.endsWith("/pause")
        ? { ...run, status: "PAUSED" }
        : run;
    });
    const gateway = new RestModelGateway({
      baseUrl,
      sessionToken: "test-token",
    });

    const active = await gateway.getActiveRun("task-1");
    const paused = await gateway.pauseRun("task-1", "run-1");

    expect(active?.status).toBe("RUNNING");
    expect(paused.status).toBe("PAUSED");
    expect(requests).toEqual([
      { method: "GET", path: "/api/v1/tasks/task-1/runs/active" },
      { method: "POST", path: "/api/v1/tasks/task-1/runs/run-1/pause" },
    ]);
  });

  it("replays durable run events after the requested sequence", async () => {
    let receivedPath = "";
    const server = createServer((request, response) => {
      receivedPath = request.url ?? "";
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(
        'data: {"runId":"run-1","sequence":5,"event":{"type":"text_delta","delta":"续","model":"demo","errorMessage":""},"occurredAt":"2026-08-15T00:00:05Z"}\n\n' +
        'data: {"runId":"run-1","sequence":6,"event":{"type":"paused","delta":"","model":"demo","errorMessage":""},"occurredAt":"2026-08-15T00:00:06Z"}\n\n',
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const gateway = new RestModelGateway({
      baseUrl: `http://127.0.0.1:${address.port}`,
      sessionToken: "test-token",
    });
    const sequences: number[] = [];

    const subscription = gateway.subscribeRun(
      "task-1",
      "run-1",
      4,
      (event) => sequences.push(event.sequence),
    );
    await subscription.completed;

    expect(receivedPath).toBe(
      "/api/v1/tasks/task-1/runs/run-1/events?afterSequence=4",
    );
    expect(sequences).toEqual([5, 6]);
  });

  it("detaches a model stream without cancelling the durable Core run", async () => {
    let cancelRequestCount = 0;
    const server = createServer((request, response) => {
      if (request.method === "DELETE") {
        cancelRequestCount += 1;
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end('{"cancelled":true}');
        return;
      }
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(": connected\n\n");
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const gateway = new RestModelGateway({
      baseUrl: `http://127.0.0.1:${address.port}`,
      sessionToken: "test-token",
    });

    const subscription = gateway.streamMessage("task-1", "停止测试", () => undefined);
    subscription.cancel();

    await expect(subscription.completed).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelRequestCount).toBe(0);
  });
});

async function listen(
  handler: (request: IncomingMessage) => Promise<unknown>,
): Promise<string> {
  const server = createServer(async (request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(await handler(request)));
  });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
