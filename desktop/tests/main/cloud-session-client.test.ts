// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { CloudSessionClient } from "../../src/main/features/cloud/cloud-session-client";
import type { CloudCredentialStore } from "../../src/main/features/cloud/cloud-credential-store";

describe("Cloud session client", () => {
  it("keeps tokens out of renderer-visible authentication state", async () => {
    const credentials = memoryCredentials();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(authResponse("access-secret", "refresh-secret")),
    );
    const client = new CloudSessionClient(
      "https://api.lumora.example",
      credentials.store,
      fetchImpl,
    );

    const state = await client.login({ email: "DESKTOP@EXAMPLE.TEST ", password: "test-password" });

    expect(state).toMatchObject({
      authenticated: true,
      user: { email: "desktop@example.test" },
    });
    expect(JSON.stringify(state)).not.toContain("access-secret");
    expect(JSON.stringify(state)).not.toContain("refresh-secret");
    expect(credentials.getRefreshToken()).toBe("refresh-secret");
  });

  it("serializes concurrent refreshes for one-time refresh token rotation", async () => {
    const credentials = memoryCredentials("refresh-old");
    let refreshCount = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/app/auth/refresh")) {
        refreshCount += 1;
        await Promise.resolve();
        return jsonResponse(authResponse("access-new", "refresh-new"));
      }
      return jsonResponse({ value: 1 });
    });
    const client = new CloudSessionClient(
      "https://api.lumora.example",
      credentials.store,
      fetchImpl,
    );

    await Promise.all([
      client.requestJson("/api/app/billing/overview"),
      client.requestJson("/api/app/catalog/models"),
    ]);

    expect(refreshCount).toBe(1);
    expect(credentials.getRefreshToken()).toBe("refresh-new");
    const apiCalls = fetchImpl.mock.calls.filter(
      ([input]) => !String(input).endsWith("/api/app/auth/refresh"),
    );
    expect(apiCalls).toHaveLength(2);
    for (const [, init] of apiCalls) {
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer access-new");
    }
  });

  it("clears the local session even when Cloud is offline during logout", async () => {
    const credentials = memoryCredentials();
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(authResponse("access", "refresh")))
      .mockRejectedValueOnce(new Error("offline"));
    const client = new CloudSessionClient(
      "https://api.lumora.example",
      credentials.store,
      fetchImpl,
    );
    await client.login({ email: "desktop@example.test", password: "test-password" });

    await expect(client.logout()).resolves.toEqual({ authenticated: false });
    expect(credentials.getRefreshToken()).toBeUndefined();
  });
});

function authResponse(accessToken: string, refreshToken: string) {
  return {
    tokenType: "Bearer",
    accessToken,
    accessTokenExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    refreshToken,
    sessionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
    user: {
      id: "1",
      email: "desktop@example.test",
      displayName: "User",
      status: "ACTIVE",
      roles: ["USER"],
    },
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function memoryCredentials(initialRefreshToken?: string) {
  let refreshToken = initialRefreshToken;
  return {
    getRefreshToken: () => refreshToken,
    store: {
      getDeviceId: () => "desktop-device-id",
      loadRefreshToken: () => refreshToken,
      saveRefreshToken: (value: string) => {
        refreshToken = value;
      },
      clearRefreshToken: () => {
        refreshToken = undefined;
      },
    } as CloudCredentialStore,
  };
}
