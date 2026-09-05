// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudModelProxy } from "../../src/main/features/cloud/cloud-model-proxy";
import type { CloudSessionClient } from "../../src/main/features/cloud/cloud-session-client";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("Issue list dynamic reproductions", () => {
  it("LM-002 propagates downstream cancellation upstream", async () => {
    let upstreamCanceled = false;
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    let requestInit: RequestInit | undefined;
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) { streamController = controller; controller.enqueue(new TextEncoder().encode("data: partial\n\n")); },
      cancel() { upstreamCanceled = true; },
    });
    const authenticatedFetch = vi.fn(async (_path: string, init: RequestInit) => {
      requestInit = init;
      return new Response(upstream, { headers: { "content-type": "text/event-stream" } });
    });
    const proxy = new CloudModelProxy({ authenticatedFetch } as unknown as CloudSessionClient);
    const access = await proxy.start();
    const cancel = new AbortController();
    let cancellationObserved = false;
    try {
      const response = await fetch(access.origin + "/invoke", {
        method: "POST", headers: { Authorization: "Bearer " + access.token },
        body: "{}", signal: cancel.signal,
      });
      const reader = response.body!.getReader();
      expect((await reader.read()).value!.length).toBeGreaterThan(0);
      cancel.abort();
      await reader.read().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 150));
      cancellationObserved = !!requestInit?.signal?.aborted || upstreamCanceled;
      console.log("REPRO LM-002", JSON.stringify({signalProvided: !!requestInit?.signal, upstreamCanceled, cancellationObserved}));
    } finally {
      try { streamController.close(); } catch {}
      await proxy.stop();
    }
    expect(cancellationObserved, "downstream abort must cancel the upstream lifecycle").toBe(true);
  });
});
