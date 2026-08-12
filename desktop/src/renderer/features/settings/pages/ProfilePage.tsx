import { Activity, CircleUserRound, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  LumoraModelApi,
  TokenUsageStatistics,
} from "../../../../shared/model-contract";
import {
  cacheHitRate,
  normalizeTokenUsage,
} from "../../tasks/state/token-usage";

export function ProfilePage({ api }: { api?: LumoraModelApi }) {
  const [statistics, setStatistics] = useState<TokenUsageStatistics>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function load() {
    if (!api) return;
    setLoading(true);
    setError(undefined);
    try {
      setStatistics(await api.getUsageStatistics(365));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "无法读取用量统计");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [api]);

  const usage = normalizeTokenUsage(statistics?.usage);
  const hitRate = cacheHitRate(usage);
  const activity = useMemo(
    () => buildActivityDays(statistics),
    [statistics],
  );

  return (
    <main className="settings-layout profile-page">
      <div className="profile-content">
        <header className="profile-identity">
          <span className="profile-avatar"><CircleUserRound /></span>
          <div>
            <span className="eyebrow">个人资料</span>
            <h1>LUMORA 本地用户</h1>
            <p>统计仅根据本机已保存的会话生成，不会上传到云端。</p>
          </div>
          <button type="button" disabled={loading || !api} onClick={() => void load()}>
            <RefreshCw className={loading ? "spin" : undefined} />
            刷新
          </button>
        </header>

        {error ? <p className="profile-error">{error}</p> : (
          <>
            <section className="profile-metrics" aria-label="Token 使用摘要">
              <ProfileMetric label="累计 Token 数" value={formatCompact(usage.totalTokens)} />
              <ProfileMetric label="单日峰值" value={formatCompact(statistics?.peakDailyTokens ?? 0)} />
              <ProfileMetric label="活跃天数" value={`${statistics?.activeDays ?? 0} 天`} />
              <ProfileMetric label="当前连续天数" value={`${statistics?.currentStreak ?? 0} 天`} />
              <ProfileMetric label="最长连续天数" value={`${statistics?.longestStreak ?? 0} 天`} />
            </section>

            <section className="profile-activity-card">
              <header>
                <div>
                  <Activity />
                  <strong>Token 活动</strong>
                </div>
                <span>最近 365 天 · 每日</span>
              </header>
              <div className="token-heatmap" aria-label="每日 Token 使用热力图">
                {activity.map((day) => (
                  <span
                    className={`token-heatmap-day level-${day.level}`}
                    key={day.date}
                    title={`${day.date} · ${day.tokens.toLocaleString("zh-CN")} Token`}
                  />
                ))}
              </div>
              <footer>
                <span>少</span>
                {[0, 1, 2, 3, 4].map((level) => (
                  <i className={`token-heatmap-day level-${level}`} key={level} />
                ))}
                <span>多</span>
              </footer>
            </section>

            <section className="profile-usage-grid">
              <div>
                <span>输入 Token</span>
                <strong>{usage.inputTokens.toLocaleString("zh-CN")}</strong>
              </div>
              <div>
                <span>输出 Token</span>
                <strong>{usage.outputTokens.toLocaleString("zh-CN")}</strong>
              </div>
              <div>
                <span>推理 Token</span>
                <strong>{usage.reasoningTokens.toLocaleString("zh-CN")}</strong>
              </div>
              <div>
                <span>缓存 Token（读 / 写）</span>
                <strong>{usage.cacheMetricsAvailable
                  ? `${usage.cacheReadTokens.toLocaleString("zh-CN")} / ${usage.cacheWriteTokens.toLocaleString("zh-CN")}`
                  : "当前协议未返回"}</strong>
              </div>
              <div>
                <span>缓存命中率</span>
                <strong>{hitRate === undefined ? "暂无数据" : `${(hitRate * 100).toFixed(1)}%`}</strong>
              </div>
              <div>
                <span>模型请求 / 会话</span>
                <strong>{statistics?.requestCount ?? 0} / {statistics?.conversationCount ?? 0}</strong>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function buildActivityDays(statistics?: TokenUsageStatistics) {
  const totals = new Map(
    (statistics?.daily ?? []).map((day) => [
      day.date,
      normalizeTokenUsage(day.usage).totalTokens,
    ]),
  );
  const maximum = Math.max(0, ...totals.values());
  const days: Array<{ date: string; tokens: number; level: number }> = [];
  const today = new Date();
  for (let offset = 364; offset >= 0; offset -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const key = localDateKey(date);
    const tokens = totals.get(key) ?? 0;
    const level = tokens === 0 || maximum === 0
      ? 0
      : Math.min(4, Math.max(1, Math.ceil((Math.log1p(tokens) / Math.log1p(maximum)) * 4)));
    days.push({ date: key, tokens, level });
  }
  return days;
}

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}
