import os from "node:os";

import type {
  CloudAuthState,
  CloudLoginInput,
  CloudUserProfile,
} from "../../../shared/cloud-contract";
import type { CloudCredentialStore } from "./cloud-credential-store";

interface CloudAuthResponse {
  tokenType: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  sessionExpiresAt: string;
  user: CloudUserProfile;
}

interface CloudErrorBody {
  code?: string;
  message?: string;
  traceId?: string;
}

export class CloudApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export class CloudSessionClient {
  private auth?: CloudAuthResponse;
  private refreshPromise?: Promise<CloudAuthResponse>;

  constructor(
    private readonly baseUrl: string,
    private readonly credentials: CloudCredentialStore,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  getState(): CloudAuthState {
    if (!this.auth) return { authenticated: false };
    return {
      authenticated: true,
      user: this.auth.user,
      accessTokenExpiresAt: this.auth.accessTokenExpiresAt,
      sessionExpiresAt: this.auth.sessionExpiresAt,
    };
  }

  async restore(): Promise<CloudAuthState> {
    if (this.auth) return this.getState();
    const refreshToken = this.credentials.loadRefreshToken();
    if (!refreshToken) return this.getState();
    await this.refresh(refreshToken);
    return this.getState();
  }

  async login(input: CloudLoginInput): Promise<CloudAuthState> {
    const response = await this.requestAuth("/api/app/auth/login", {
      email: input.email,
      password: input.password,
      clientType: "DESKTOP",
      deviceId: this.credentials.getDeviceId(),
      deviceName: `LUMORA Desktop · ${os.hostname()}`.slice(0, 120),
    });
    this.acceptAuth(response);
    return this.getState();
  }

  async logout(): Promise<CloudAuthState> {
    try {
      let refreshToken: string | undefined;
      try {
        refreshToken = this.credentials.loadRefreshToken();
      } catch {
        // 本地凭据损坏时仍允许完成本地退出和清理。
      }
      if (refreshToken || this.auth) {
        const headers = new Headers({ "Content-Type": "application/json" });
        if (this.auth) {
          headers.set("Authorization", `Bearer ${this.auth.accessToken}`);
        }
        await this.fetchImpl(`${this.baseUrl}/api/app/auth/logout`, {
          method: "POST",
          headers,
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {
      // 退出首先是本地安全动作；云端不可达时也必须立即清除本机凭据。
    } finally {
      this.auth = undefined;
      this.credentials.clearRefreshToken();
    }
    return this.getState();
  }

  async requestJson<T>(path: string): Promise<T> {
    const response = await this.authenticatedFetch(path, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw await cloudError(response);
    return response.json() as Promise<T>;
  }

  async authenticatedFetch(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    await this.ensureFreshAccessToken();
    const attemptedAccessToken = this.auth?.accessToken;
    let response = await this.fetchWithAccessToken(path, init);
    if (response.status === 401) {
      // 其他并发请求可能已经完成了令牌轮换；只有仍在使用同一旧令牌时才刷新。
      if (!this.auth || this.auth.accessToken === attemptedAccessToken) {
        await this.refresh();
      }
      response = await this.fetchWithAccessToken(path, init);
    }
    return response;
  }

  private async fetchWithAccessToken(
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    if (!this.auth) throw new Error("请先登录 LUMORA Cloud");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.auth.accessToken}`);
    return this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
  }

  private async ensureFreshAccessToken(): Promise<void> {
    if (!this.auth) {
      await this.refresh();
      return;
    }
    const expiresAt = Date.parse(this.auth.accessTokenExpiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt - Date.now() < 30_000) {
      await this.refresh();
    }
  }

  private async refresh(knownRefreshToken?: string): Promise<CloudAuthResponse> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.performRefresh(knownRefreshToken)
      .finally(() => {
        this.refreshPromise = undefined;
      });
    return this.refreshPromise;
  }

  private async performRefresh(
    knownRefreshToken?: string,
  ): Promise<CloudAuthResponse> {
    const refreshToken = knownRefreshToken ?? this.credentials.loadRefreshToken();
    if (!refreshToken) {
      this.auth = undefined;
      throw new Error("登录已失效，请重新登录 LUMORA Cloud");
    }
    try {
      const response = await this.requestAuth("/api/app/auth/refresh", {
        refreshToken,
      });
      this.acceptAuth(response);
      return response;
    } catch (error) {
      this.auth = undefined;
      if (
        error instanceof CloudApiError
        && (error.status === 400 || error.status === 401 || error.status === 403)
      ) {
        this.credentials.clearRefreshToken();
      }
      throw error;
    }
  }

  private async requestAuth(
    path: string,
    body: Record<string, unknown>,
  ): Promise<CloudAuthResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await cloudError(response);
    const value = await response.json() as Partial<CloudAuthResponse>;
    if (
      typeof value.accessToken !== "string"
      || typeof value.refreshToken !== "string"
      || typeof value.accessTokenExpiresAt !== "string"
      || typeof value.sessionExpiresAt !== "string"
      || !value.user
    ) {
      throw new Error("云端登录响应格式无效");
    }
    return value as CloudAuthResponse;
  }

  private acceptAuth(response: CloudAuthResponse): void {
    // 刷新令牌先安全落盘，再切换内存会话，避免旋转后的令牌因异常丢失。
    this.credentials.saveRefreshToken(response.refreshToken);
    this.auth = response;
  }
}

async function cloudError(response: Response): Promise<CloudApiError> {
  let body: CloudErrorBody = {};
  try {
    body = await response.json() as CloudErrorBody;
  } catch {
    // 非 JSON 网关错误只向 UI 暴露状态码，不回显代理页面或敏感正文。
  }
  const fallback = response.status === 401
    ? "登录已失效，请重新登录"
    : `云端请求失败（${response.status}）`;
  return new CloudApiError(body.message?.trim() || fallback, response.status, body.code);
}
