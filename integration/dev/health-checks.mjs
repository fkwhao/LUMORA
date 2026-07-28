import net from "node:net";

export async function waitForTcp(options) {
  const {
    serviceName,
    host,
    port,
    timeoutMs,
    retryIntervalMs = 100,
    isProcessAlive,
    createConnection = net.createConnection,
  } = options;
  const startedAt = Date.now();

  while (true) {
    assertProcessAlive(serviceName, isProcessAlive);
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      throw timeoutError(serviceName, host, port, startedAt);
    }

    if (await tryTcpConnection({
      serviceName,
      host,
      port,
      timeoutMs: remainingMs,
      processCheckIntervalMs: retryIntervalMs,
      isProcessAlive,
      createConnection,
    })) return;

    const delayMs = Math.min(retryIntervalMs, timeoutMs - (Date.now() - startedAt));
    if (delayMs <= 0) {
      throw timeoutError(serviceName, host, port, startedAt);
    }
    await delay(delayMs);
  }
}

export async function waitForCoreHealth(options) {
  const {
    serviceName = "core",
    host,
    port,
    token,
    protocolVersion,
    timeoutMs,
    retryIntervalMs = 100,
    isProcessAlive,
    fetch: fetchImplementation = globalThis.fetch,
  } = options;
  const startedAt = Date.now();
  const endpoint = `http://${formatHost(host)}:${port}/api/v1/health`;

  while (true) {
    assertProcessAlive(serviceName, isProcessAlive);
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      throw timeoutError(serviceName, host, port, startedAt);
    }

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), remainingMs);
    let processExitError;
    const processTimer = isProcessAlive
      ? setInterval(() => {
        try {
          assertProcessAlive(serviceName, isProcessAlive);
        } catch (error) {
          processExitError = error;
          controller.abort();
        }
      }, Math.max(1, Math.min(retryIntervalMs, remainingMs)))
      : undefined;
    try {
      // 认证边界：令牌只进入请求头，任何错误都不回显请求或底层异常。
      const response = await fetchImplementation(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (response.ok) {
        const health = await response.json();
        if (health?.protocolVersion !== protocolVersion) {
          const message = `Protocol version mismatch for ${serviceName}: expected ${protocolVersion}, received ${String(health?.protocolVersion)}`;
          throw new ProtocolVersionError(
            redactSecret(message, token),
          );
        }
        if (processExitError) throw processExitError;
        return health;
      }
    } catch (error) {
      if (processExitError) throw processExitError;
      if (error instanceof ProtocolVersionError) throw error;
    } finally {
      clearTimeout(abortTimer);
      clearInterval(processTimer);
    }

    const delayMs = Math.min(retryIntervalMs, timeoutMs - (Date.now() - startedAt));
    if (delayMs <= 0) {
      throw timeoutError(serviceName, host, port, startedAt);
    }
    await delay(delayMs);
  }
}

function tryTcpConnection(options) {
  const {
    serviceName,
    host,
    port,
    timeoutMs,
    processCheckIntervalMs,
    isProcessAlive,
    createConnection,
  } = options;
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const timer = setTimeout(() => finish(false), timeoutMs);
    const processTimer = isProcessAlive
      ? setInterval(checkProcess, Math.max(1, Math.min(processCheckIntervalMs, timeoutMs)))
      : undefined;

    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));

    function checkProcess() {
      try {
        assertProcessAlive(serviceName, isProcessAlive);
      } catch (error) {
        finish(false, error);
      }
    }

    function finish(connected, error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(processTimer);
      socket.destroy();
      if (error) {
        reject(error);
      } else {
        resolve(connected);
      }
    }
  });
}

function assertProcessAlive(serviceName, isProcessAlive) {
  if (isProcessAlive && !isProcessAlive()) {
    throw new Error(`${serviceName} process exited before becoming healthy`);
  }
}

function timeoutError(serviceName, host, port, startedAt) {
  const elapsedMs = Date.now() - startedAt;
  return new Error(
    `Timed out waiting for ${serviceName} at ${host}:${port} (elapsed ${elapsedMs} ms)`,
  );
}

function formatHost(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function redactSecret(text, secret) {
  return secret ? text.split(secret).join("[REDACTED]") : text;
}

class ProtocolVersionError extends Error {}
