import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";

import { CloudApiError, type CloudSessionClient } from "./cloud-session-client";

const ALLOWED_PATHS = new Set(["/invoke"]);
const MAX_REQUEST_BYTES = 64 * 1024 * 1024;

export class CloudModelProxy {
  private readonly localToken = randomBytes(32).toString("base64url");
  private server?: http.Server;
  private origin?: string;

  constructor(private readonly session: CloudSessionClient) {}

  async start(): Promise<{ origin: string; token: string }> {
    if (this.server && this.origin) {
      return { origin: this.origin, token: this.localToken };
    }
    this.server = http.createServer((request, response) => {
      void this.handle(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(0, "127.0.0.1", () => resolve());
    });
    const address = this.server.address();
    if (!address || typeof address === "string") {
      await this.stop();
      throw new Error("无法启动 LUMORA Cloud 本地代理");
    }
    this.origin = `http://127.0.0.1:${address.port}`;
    return { origin: this.origin, token: this.localToken };
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.origin = undefined;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      if (!this.authorized(request)) {
        this.jsonError(response, 401, "LOCAL_PROXY_UNAUTHORIZED", "本地模型代理认证失败");
        return;
      }
      const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (request.method !== "POST" || !ALLOWED_PATHS.has(path)) {
        this.jsonError(response, 404, "LOCAL_PROXY_ROUTE_NOT_FOUND", "本地模型代理路由不存在");
        return;
      }
      const body = await readBody(request);
      const headers = new Headers({
        Accept: request.headers.accept ?? "application/json",
        "Content-Type": "application/json",
        "X-Lumora-Client-Request-Id": `desktop-${randomUUID()}`,
      });
      const cloudResponse = await this.session.authenticatedFetch(
        `/api/app/model/v1${path}`,
        { method: "POST", headers, body },
      );
      response.statusCode = cloudResponse.status;
      copyHeader(cloudResponse, response, "content-type");
      copyHeader(cloudResponse, response, "cache-control");
      copyHeader(cloudResponse, response, "x-lumora-request-id");
      copyHeader(cloudResponse, response, "x-lumora-pricing-version");
      copyHeader(cloudResponse, response, "retry-after");
      if (!cloudResponse.body) {
        response.end();
        return;
      }
      const reader = cloudResponse.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!response.write(Buffer.from(value))) {
          await new Promise<void>((resolve) => response.once("drain", resolve));
        }
      }
      response.end();
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      const status = error instanceof CloudApiError ? error.status : 502;
      this.jsonError(
        response,
        status,
        error instanceof CloudApiError ? error.code ?? "CLOUD_REQUEST_FAILED" : "CLOUD_UNAVAILABLE",
        error instanceof Error ? error.message : "云端模型服务暂不可用",
      );
    }
  }

  private authorized(request: IncomingMessage): boolean {
    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    const apiKey = Array.isArray(request.headers["x-api-key"])
      ? request.headers["x-api-key"][0]
      : request.headers["x-api-key"];
    return secureEqual(bearer, this.localToken) || secureEqual(apiKey, this.localToken);
  }

  private jsonError(
    response: ServerResponse,
    status: number,
    code: string,
    message: string,
  ): void {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify({ code, message }));
  }
}

function secureEqual(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_REQUEST_BYTES) {
      throw new CloudApiError("模型请求体过大", 413, "REQUEST_TOO_LARGE");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function copyHeader(
  source: Response,
  target: ServerResponse,
  name: string,
): void {
  const value = source.headers.get(name);
  if (value) target.setHeader(name, value);
}
