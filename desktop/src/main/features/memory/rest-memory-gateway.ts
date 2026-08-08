import { randomUUID } from "node:crypto";

import type {
  MemoryResetResult,
  MemorySettings,
} from "../../../shared/memory-contract";
import type { JavaConnection } from "../../core/java-connection";
import { validateJavaConnection } from "../../core/java-connection";
import type { MemoryGateway } from "./memory-gateway";

type JavaError = { message?: string };

export class RestMemoryGateway implements MemoryGateway {
  private readonly connection: JavaConnection;

  constructor(
    connection: JavaConnection,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.connection = validateJavaConnection(connection);
  }

  getSettings(): Promise<MemorySettings> {
    return this.request("/api/v1/memory/settings");
  }

  updateSettings(enabled: boolean): Promise<MemorySettings> {
    return this.request("/api/v1/memory/settings", {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });
  }

  reset(): Promise<MemoryResetResult> {
    return this.request("/api/v1/memory", { method: "DELETE" });
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await this.fetchImpl(
      `${this.connection.baseUrl}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${this.connection.sessionToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Correlation-Id": randomUUID(),
          ...init.headers,
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      const error = await readJavaError(response);
      throw new Error(
        error.message ?? `Java Core 请求失败: HTTP ${response.status}`,
      );
    }
    return (await response.json()) as T;
  }
}

async function readJavaError(response: Response): Promise<JavaError> {
  try {
    return (await response.json()) as JavaError;
  } catch {
    return {};
  }
}
