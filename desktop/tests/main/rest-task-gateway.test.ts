// @vitest-environment node

import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { RestTaskGateway } from "../../src/main/rest-task-gateway";

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

describe("Java REST task gateway", () => {
  it("creates a task with the private bearer token", async () => {
    let receivedMethod = "";
    let receivedUrl = "";
    let receivedAuthorization = "";
    let receivedCorrelationId = "";
    let receivedBody = "";
    const baseUrl = await listen(async (request) => {
      receivedMethod = request.method ?? "";
      receivedUrl = request.url ?? "";
      receivedAuthorization = request.headers.authorization ?? "";
      receivedCorrelationId =
        request.headers["x-correlation-id"]?.toString() ?? "";
      receivedBody = await readBody(request);
      return {
        status: 201,
        body: {
          taskId: "task-1",
          goal: "整理下载目录",
          workspacePath: "F:\\project\\test",
          status: "PLANNING",
          lastEventSequence: 0,
          activeStep: "",
          resultSummary: "",
          planSteps: [
            {
              stepId: "step-1",
              title: "分析目录内容",
              description: "识别下载目录中的文件类型",
              requiresApproval: false,
            },
            {
              stepId: "step-2",
              title: "整理文件",
              description: "按类型移动文件到分类目录",
              requiresApproval: true,
            },
          ],
        },
      };
    });
    const gateway = new RestTaskGateway({
      baseUrl,
      sessionToken: "test-token",
    });

    const task = await gateway.create("整理下载目录", "F:\\project\\test");

    expect(task.taskId).toBe("task-1");
    expect(task.workspacePath).toBe("F:\\project\\test");
    expect(task.planSteps).toEqual([
      {
        stepId: "step-1",
        title: "分析目录内容",
        description: "识别下载目录中的文件类型",
        requiresApproval: false,
      },
      {
        stepId: "step-2",
        title: "整理文件",
        description: "按类型移动文件到分类目录",
        requiresApproval: true,
      },
    ]);
    expect(receivedMethod).toBe("POST");
    expect(receivedUrl).toBe("/api/v1/tasks");
    expect(receivedAuthorization).toBe("Bearer test-token");
    expect(receivedCorrelationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(JSON.parse(receivedBody)).toEqual({
      goal: "整理下载目录",
      workspacePath: "F:\\project\\test",
    });
  });

  it("returns the stable Java error message", async () => {
    const baseUrl = await listen(async () => ({
      status: 404,
      body: {
        code: "TASK_NOT_FOUND",
        message: "任务不存在",
      },
    }));
    const gateway = new RestTaskGateway({
      baseUrl,
      sessionToken: "test-token",
    });

    await expect(gateway.get("missing")).rejects.toThrow("任务不存在");
  });

  it("persists task model preferences through the Java API", async () => {
    let receivedMethod = "";
    let receivedUrl = "";
    let receivedBody = "";
    const baseUrl = await listen(async (request) => {
      receivedMethod = request.method ?? "";
      receivedUrl = request.url ?? "";
      receivedBody = await readBody(request);
      return {
        status: 200,
        body: {
          taskId: "task-1",
          goal: "test",
          status: "COMPLETED",
          selectedModel: "deepseek-reasoner",
          selectedReasoningEffort: "high",
          planSteps: [],
        },
      };
    });
    const gateway = new RestTaskGateway({
      baseUrl,
      sessionToken: "test-token",
    });

    const updated = await gateway.updatePreferences({
      taskId: "task-1",
      model: "deepseek-reasoner",
      reasoningEffort: "high",
    });

    expect(receivedMethod).toBe("PUT");
    expect(receivedUrl).toBe("/api/v1/tasks/task-1/preferences");
    expect(JSON.parse(receivedBody)).toEqual({
      model: "deepseek-reasoner",
      reasoningEffort: "high",
    });
    expect(updated.selectedReasoningEffort).toBe("high");
  });

  it("persists the task workspace through the Java API", async () => {
    let receivedMethod = "";
    let receivedUrl = "";
    let receivedBody = "";
    const baseUrl = await listen(async (request) => {
      receivedMethod = request.method ?? "";
      receivedUrl = request.url ?? "";
      receivedBody = await readBody(request);
      return {
        status: 200,
        body: {
          taskId: "task-1",
          goal: "test",
          status: "COMPLETED",
          workspacePath: "F:\\project\\LUMORA",
          planSteps: [],
        },
      };
    });
    const gateway = new RestTaskGateway({
      baseUrl,
      sessionToken: "test-token",
    });

    const updated = await gateway.updateWorkspace({
      taskId: "task-1",
      workspacePath: "F:\\project\\LUMORA",
    });

    expect(receivedMethod).toBe("PUT");
    expect(receivedUrl).toBe("/api/v1/tasks/task-1/workspace");
    expect(JSON.parse(receivedBody)).toEqual({
      workspacePath: "F:\\project\\LUMORA",
    });
    expect(updated.workspacePath).toBe("F:\\project\\LUMORA");
  });
});

async function listen(
  handler: (
    request: IncomingMessage,
  ) => Promise<{ status: number; body: unknown }>,
): Promise<string> {
  const server = createServer(async (request, response) => {
    const result = await handler(request);
    response.writeHead(result.status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result.body));
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
