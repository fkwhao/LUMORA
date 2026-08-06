// @vitest-environment node

import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { RestMemoryGateway } from "../../src/main/rest-memory-gateway";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    ),
  );
});

describe("Java REST memory gateway", () => {
  it("reads and updates the persisted memory switch", async () => {
    const requests: Array<{ method?: string; path?: string; body: string }> = [];
    const baseUrl = await listen(async (request) => {
      requests.push({
        method: request.method,
        path: request.url,
        body: await readBody(request),
      });
      return { enabled: request.method === "GET" };
    });
    const gateway = new RestMemoryGateway({
      baseUrl,
      sessionToken: "test-token",
    });

    await expect(gateway.getSettings()).resolves.toEqual({ enabled: true });
    await expect(gateway.updateSettings(false)).resolves.toEqual({
      enabled: false,
    });

    expect(requests).toEqual([
      { method: "GET", path: "/api/v1/memory/settings", body: "" },
      {
        method: "PUT",
        path: "/api/v1/memory/settings",
        body: '{"enabled":false}',
      },
    ]);
  });

  it("resets dynamic memories through Java Core", async () => {
    let receivedMethod = "";
    let receivedPath = "";
    const baseUrl = await listen(async (request) => {
      receivedMethod = request.method ?? "";
      receivedPath = request.url ?? "";
      return { deletedCount: 4 };
    });
    const gateway = new RestMemoryGateway({
      baseUrl,
      sessionToken: "test-token",
    });

    await expect(gateway.reset()).resolves.toEqual({ deletedCount: 4 });
    expect(receivedMethod).toBe("DELETE");
    expect(receivedPath).toBe("/api/v1/memory");
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
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
