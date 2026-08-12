// @vitest-environment node

import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { RestMcpGateway } from "../../src/main/rest-mcp-gateway";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    })));
});

describe("Java REST MCP gateway", () => {
  it("saves and tests a remote Streamable HTTP server", async () => {
    const requests: Array<{ method?: string; path?: string; body: string }> = [];
    const baseUrl = await listen(async (request) => {
      requests.push({ method: request.method, path: request.url, body: await readBody(request) });
      if (request.url?.endsWith("/test")) {
        return { connected: true, serverName: "Echo", serverVersion: "0.1.0", tools: ["echo"], echoOutput: "ok" };
      }
      return { serverId: "remote-echo", name: "Echo", enabled: true, url: "http://127.0.0.1:8765/mcp" };
    });
    const gateway = new RestMcpGateway({ baseUrl, sessionToken: "test-token" });

    await gateway.saveServer("remote-echo", {
      name: "Echo",
      enabled: true,
      url: "http://127.0.0.1:8765/mcp",
      authType: "none",
    });
    await expect(gateway.testServer("remote-echo")).resolves.toMatchObject({
      connected: true,
      tools: ["echo"],
    });

    expect(requests).toEqual([
      {
        method: "PUT",
        path: "/api/v1/mcp/servers/remote-echo",
        body: '{"name":"Echo","enabled":true,"url":"http://127.0.0.1:8765/mcp","authType":"none"}',
      },
      { method: "POST", path: "/api/v1/mcp/servers/remote-echo/test", body: "" },
    ]);
  });
});

async function listen(handler: (request: IncomingMessage) => Promise<unknown>): Promise<string> {
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
