import {
  Activity,
  ArrowUpRight,
  Check,
  Cloud,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  CloudDashboard,
  CloudDesktopState,
  CloudModelSource,
  LumoraCloudApi,
} from "../../../../shared/cloud-contract";

interface CloudAccountPageProps {
  api?: LumoraCloudApi;
  notify(message: string, tone?: "info" | "success"): void;
}

export function CloudAccountPage({ api, notify }: CloudAccountPageProps) {
  const [state, setState] = useState<CloudDesktopState>();
  const [dashboard, setDashboard] = useState<CloudDashboard>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!api) return;
    let active = true;
    setBusy("restore");
    void api.restoreSession()
      .then(async (restored) => {
        if (!active) return;
        setState(restored);
        if (restored.auth.authenticated) {
          const loaded = await api.getDashboard();
          if (active) setDashboard(loaded);
        }
      })
      .catch(async (restoreError: unknown) => {
        if (!active) return;
        setError(toMessage(restoreError));
        try {
          setState(await api.getState());
        } catch {
          // 保留首个可操作错误。
        }
      })
      .finally(() => {
        if (active) setBusy(undefined);
      });
    return () => {
      active = false;
    };
  }, [api]);

  const quotaProgress = useMemo(() => {
    const quota = dashboard?.overview.quota;
    if (!quota || quota.granted <= 0) return 0;
    return Math.min(100, Math.max(0, ((quota.consumed + quota.reserved) / quota.granted) * 100));
  }, [dashboard]);

  async function refreshDashboard(showNotice = false) {
    if (!api) return;
    setBusy("refresh");
    setError(undefined);
    try {
      const loaded = await api.getDashboard();
      setDashboard(loaded);
      setState(loaded.state);
      if (showNotice) notify("云端套餐与用量已刷新", "success");
    } catch (refreshError) {
      setError(toMessage(refreshError));
    } finally {
      setBusy(undefined);
    }
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (!api) return;
    setBusy("login");
    setError(undefined);
    try {
      const next = await api.login({ email, password });
      setState(next);
      setPassword("");
      const loaded = await api.getDashboard();
      setDashboard(loaded);
      setState(loaded.state);
      notify("已登录 LUMORA Cloud", "success");
    } catch (loginError) {
      setError(toMessage(loginError));
      // Authentication may have succeeded before model synchronization failed.
      try {
        const current = await api.getState();
        setState(current);
        if (current.auth.authenticated) setPassword("");
      } catch {
        // Keep the original error when the state cannot be read.
      }
    } finally {
      setBusy(undefined);
    }
  }

  async function logout() {
    if (!api) return;
    setBusy("logout");
    setError(undefined);
    try {
      const next = await api.logout();
      setState(next);
      setDashboard(undefined);
      notify("已退出云端账号", "success");
    } catch (logoutError) {
      setError(toMessage(logoutError));
    } finally {
      setBusy(undefined);
    }
  }

  async function selectSource(source: CloudModelSource) {
    if (!api || state?.modelSource === source) return;
    setBusy("source");
    setError(undefined);
    try {
      const next = await api.setModelSource(source);
      setState(next);
      if (next.auth.authenticated) await refreshDashboard();
      notify(
        source === "CLOUD_MANAGED"
          ? "已切换到官方套餐模型"
          : "已切换到自定义供应商",
        "success",
      );
    } catch (sourceError) {
      setError(toMessage(sourceError));
    } finally {
      setBusy(undefined);
    }
  }

  async function selectModel(modelCode: string) {
    if (!api || !modelCode) return;
    setBusy("model");
    setError(undefined);
    try {
      const next = await api.selectCloudModel(modelCode);
      setState(next);
      setDashboard((current) => current ? { ...current, state: next } : current);
      notify("官方套餐模型已更新", "success");
    } catch (modelError) {
      setError(toMessage(modelError));
    } finally {
      setBusy(undefined);
    }
  }

  if (!api) {
    return (
      <main className="settings-layout cloud-account-page">
        <div className="settings-unavailable">
          <Cloud size={22} />
          <strong>云端账号暂不可用</strong>
          <p>请从 Electron 桌面进程启动应用后再登录。</p>
        </div>
      </main>
    );
  }

  const authenticated = state?.auth.authenticated === true;
  const loadingInitial = !state && busy === "restore";

  return (
    <main className="settings-layout cloud-account-page">
      <header className="cloud-account-header">
        <div>
          <span className="cloud-account-eyebrow"><Cloud size={13} /> LUMORA Cloud</span>
          <h1>账号与套餐</h1>
          <p>登录后可使用官方套餐；不登录也可以继续使用自己的模型供应商。</p>
        </div>
        {authenticated && (
          <button
            className="cloud-icon-button"
            type="button"
            title="刷新套餐与用量"
            disabled={Boolean(busy)}
            onClick={() => void refreshDashboard(true)}
          >
            <RefreshCw size={16} className={busy === "refresh" ? "is-spinning" : undefined} />
          </button>
        )}
      </header>

      {error && <p className="settings-error cloud-account-error">{error}</p>}

      {loadingInitial ? (
        <section className="cloud-loading-card">
          <RefreshCw size={17} className="is-spinning" />
          正在恢复云端登录…
        </section>
      ) : !authenticated ? (
        <section className="cloud-auth-layout">
          <div className="cloud-auth-intro">
            <span className="cloud-auth-mark"><Cloud size={24} /></span>
            <h2>连接你的 LUMORA 账号</h2>
            <p>登录只用于套餐查询与官方模型调用。购买、续费和充值会在系统默认浏览器中完成。</p>
            <ul>
              <li><ShieldCheck size={15} /> 刷新凭据由系统安全存储加密</li>
              <li><KeyRound size={15} /> 页面与 Java Core 均接触不到云端 Token</li>
            </ul>
          </div>
          <form className="cloud-login-form" onSubmit={login}>
            <header>
              <h2>登录</h2>
              <p>也可以先跳过，继续配置自定义供应商。</p>
            </header>
            <label>
              <span>邮箱</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                autoComplete="username"
                required
              />
            </label>
            <label>
              <span>密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="输入账号密码"
                autoComplete="current-password"
                required
              />
            </label>
            <button className="cloud-primary-button" type="submit" disabled={busy === "login"}>
              {busy === "login" ? "正在登录…" : "登录 LUMORA Cloud"}
            </button>
            <button
              className="cloud-text-button"
              type="button"
              onClick={() => notify("你可以在“模型与 API”中继续使用自定义供应商")}
            >
              暂不登录
            </button>
          </form>
        </section>
      ) : (
        <div className="cloud-account-content">
          <section className="cloud-identity-card">
            <span className="cloud-user-avatar">
              {(state.auth.user?.displayName || state.auth.user?.email || "L").slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{state.auth.user?.displayName || "LUMORA 用户"}</strong>
              <small>{state.auth.user?.email}</small>
            </div>
            <span className="cloud-session-status"><i /> 已登录</span>
            <button type="button" disabled={busy === "logout"} onClick={() => void logout()}>
              <LogOut size={14} /> {busy === "logout" ? "退出中…" : "退出登录"}
            </button>
          </section>

          <section className="cloud-section-card">
            <header>
              <div>
                <h2>模型来源</h2>
                <p>切换后，新任务会使用对应来源；系统不会自动替你切换。</p>
              </div>
            </header>
            <div className="cloud-source-grid">
              <SourceCard
                active={state.modelSource === "CLOUD_MANAGED"}
                icon={Cloud}
                title="官方套餐"
                description="由 LUMORA Cloud 统一路由、计费和扣减套餐额度。"
                disabled={busy === "source"}
                onClick={() => void selectSource("CLOUD_MANAGED")}
              />
              <SourceCard
                active={state.modelSource === "LOCAL_BYOK"}
                icon={KeyRound}
                title="自定义供应商"
                description="使用你保存在本机的供应商 API Key，不消耗套餐额度。"
                disabled={busy === "source"}
                onClick={() => void selectSource("LOCAL_BYOK")}
              />
            </div>
          </section>

          <div className="cloud-dashboard-grid">
            <section className="cloud-section-card cloud-plan-card">
              <header>
                <div>
                  <h2>当前套餐</h2>
                  <p>{dashboard?.overview.hasActiveSubscription ? "订阅有效" : "尚未购买有效套餐"}</p>
                </div>
                <WalletCards size={18} />
              </header>
              {dashboard?.overview.hasActiveSubscription && dashboard.overview.plan && dashboard.overview.quota ? (
                <>
                  <div className="cloud-plan-name">
                    <strong>{dashboard.overview.plan.name}</strong>
                    <span>{formatMoney(dashboard.overview.plan.monthlyPriceMinor, dashboard.overview.plan.currency)} / 月</span>
                  </div>
                  <div className="cloud-quota-numbers">
                    <div><span>剩余额度</span><strong>{formatCredits(dashboard.overview.quota.remaining)}</strong></div>
                    <div><span>本周总额</span><strong>{formatCredits(dashboard.overview.quota.granted)}</strong></div>
                    <div><span>已用额度</span><strong>{formatCredits(dashboard.overview.quota.consumed)}</strong></div>
                  </div>
                  <div className="cloud-quota-track" aria-label={`已使用 ${quotaProgress.toFixed(1)}%`}>
                    <i style={{ width: `${quotaProgress}%` }} />
                  </div>
                  <small className="cloud-plan-period">
                    本周周期 {formatDate(dashboard.overview.quota.startsAt)} — {formatDate(dashboard.overview.quota.endsAt)}
                  </small>
                </>
              ) : (
                <div className="cloud-empty-plan">
                  <strong>还没有可用套餐</strong>
                  <p>你仍可使用自定义供应商，或前往网页控制台购买套餐。</p>
                </div>
              )}
              <button className="cloud-secondary-button" type="button" onClick={() => void api.openConsole("plans")}>
                {dashboard?.overview.hasActiveSubscription ? "管理套餐" : "查看套餐"} <ArrowUpRight size={14} />
              </button>
            </section>

            <section className="cloud-section-card cloud-model-card">
              <header>
                <div>
                  <h2>官方模型</h2>
                  <p>选择套餐调用时使用的模型。</p>
                </div>
              </header>
              {dashboard?.models.length ? (
                <div className="cloud-model-list">
                  {dashboard.models.map((model) => {
                    const selected = state.selectedCloudModelCode === model.code;
                    return (
                      <button
                        type="button"
                        className={selected ? "selected" : undefined}
                        disabled={busy === "model" || state.modelSource !== "CLOUD_MANAGED"}
                        title={state.modelSource === "CLOUD_MANAGED" ? undefined : "请先切换到官方套餐"}
                        key={model.code}
                        onClick={() => void selectModel(model.code)}
                      >
                        <span><strong>{model.displayName}</strong><small>{model.code}</small></span>
                        {selected && <Check size={15} />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="cloud-muted-message">当前没有已发布的官方模型。</p>
              )}
            </section>
          </div>

          <section className="cloud-section-card cloud-usage-card">
            <header>
              <div>
                <h2>最近用量</h2>
                <p>这里展示 Cloud Gateway 已完成结算的模型调用。</p>
              </div>
              <Activity size={18} />
            </header>
            {dashboard?.history.usage.length ? (
              <div className="cloud-usage-list">
                {dashboard.history.usage.slice(0, 6).map((usage) => (
                  <div key={usage.usageId}>
                    <span><strong>{usage.modelCode}</strong><small>{formatDateTime(usage.occurredAt)}</small></span>
                    <span><strong>{formatCredits(usage.billedQuota)}</strong><small>{formatTokens(usage.inputTokens + usage.outputTokens + usage.reasoningTokens)} tokens</small></span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="cloud-muted-message">还没有云端模型调用记录。</p>
            )}
            <footer>
              <button className="cloud-text-button" type="button" onClick={() => void api.openConsole("home")}>
                在网页控制台查看完整信息 <ArrowUpRight size={14} />
              </button>
              <button className="cloud-text-button" type="button" onClick={() => void api.openConsole("wallet")}>
                钱包与充值 <ArrowUpRight size={14} />
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}

function SourceCard({
  active,
  icon: Icon,
  title,
  description,
  disabled,
  onClick,
}: {
  active: boolean;
  icon: typeof Cloud;
  title: string;
  description: string;
  disabled: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className={`cloud-source-card${active ? " active" : ""}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="cloud-source-icon"><Icon size={18} /></span>
      <span><strong>{title}</strong><small>{description}</small></span>
      <i>{active ? <Check size={12} /> : null}</i>
    </button>
  );
}

function formatCredits(value: number): string {
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(value)} credits`;
}

function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "云端操作失败，请稍后重试";
}
