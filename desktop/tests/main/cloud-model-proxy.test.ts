// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { CloudModelProxy } from "../../src/main/features/cloud/cloud-model-proxy";
import type { CloudSessionClient } from "../../src/main/features/cloud/cloud-session-client";

const proxies: CloudModelProxy[] = [];

afterEach(async () => {
  await Promise.all(proxies.splice(0).map((proxy) => proxy.stop()));
});

describe("Cloud model loopback proxy", () => {
  it("requires its local token and forwards only supported model routes", async () => {
    const authenticatedFetch = vi.fn(async (_path: string, _init: RequestInit) =>
      new Response(JSON.stringify({ id: "completion-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    const proxy = new CloudModelProxy({ authenticatedFetch } as unknown as CloudSessionClient);
    proxies.push(proxy);
    const access = await proxy.start();

    const unauthorized = await fetch(`${access.origin}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(unauthorized.status).toBe(401);

    const authorized = await fetch(`${access.origin}/invoke`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "lumora-test", messages: [] }),
    });

    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toEqual({ id: "completion-1" });
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
    const [path, init] = authenticatedFetch.mock.calls[0]!;
    expect(path).toBe("/api/app/model/v1/invoke");
    expect(new Headers(init.headers).get("X-Lumora-Client-Request-Id"))
      .toMatch(/^desktop-/);
  });
});
