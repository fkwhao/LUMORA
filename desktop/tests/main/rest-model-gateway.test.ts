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
      apiKey: "provider-secret",
    });

    expect(receivedPath).toBe("/api/v1/model/settings/models");
    expect(JSON.parse(receivedBody)).toEqual({
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
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
      { model: "gpt-5.6-sol", reasoningEffort: "high" },
    );
    await subscription.completed;

    expect(JSON.parse(receivedBody)).toEqual({
      content: "你好",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
    });
    expect(events.join("")).toBe("你好");
    expect(reasoningEvents.join("")).toBe("分析问题");
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
