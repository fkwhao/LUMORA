import { CircleUserRound, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import type {
  LumoraModelApi,
  TokenUsageStatistics,
} from "../../../../shared/model-contract";
import {
  cacheHitRate,
  normalizeTokenUsage,
} from "../../tasks/state/token-usage";

const ACTIVITY_DAY_COUNT = 52 * 7;

export function ProfilePage({ api }: { api?: LumoraModelApi }) {
  const [statistics, setStatistics] = useState<TokenUsageStatistics>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [activityTooltip, setActivityTooltip] = useState<{
    arrowOffset: number;
    label: string;
    left: number;
    top: number;
  }>();

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
    () => buildActivityCalendar(statistics),
    [statistics],
  );

  return (
    <main className="settings-layout profile-page">
      <div className="profile-content">
        <header className="profile-toolbar">
          <h1>个人资料</h1>
          <button
            type="button"
            aria-label="刷新个人资料统计"
            title="刷新"
            disabled={loading || !api}
            onClick={() => void load()}
          >
            <RefreshCw className={loading ? "spin" : undefined} />
          </button>
        </header>

        <section className="profile-identity" aria-label="本地个人资料">
          <span className="profile-avatar"><CircleUserRound /></span>
          <strong>LUMORA</strong>
          <p>本地资料 · 统计仅保存在此设备</p>
        </section>

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
                <strong>Token 活动</strong>
                <div className="profile-activity-range">
                  <span>每日</span>
                  <small>最近一年</small>
                </div>
              </header>
              <div className="token-heatmap-scroll">
                <div className="token-heatmap-calendar">
                  <div
                    className="token-heatmap-months"
                    style={{
                      gridTemplateColumns: `repeat(${activity.weeks.length}, minmax(0, 1fr))`,
                    }}
                    aria-hidden="true"
                  >
                    {activity.months.map((month) => (
                      <span
                        key={`${month.label}-${month.weekIndex}`}
                        style={{ gridColumnStart: month.weekIndex + 1 }}
                      >
                        {month.label}
                      </span>
                    ))}
                  </div>
                  <div
                    className="token-heatmap"
                    aria-label="每日 Token 使用热力图"
                    role="grid"
                    style={{
                      gridTemplateColumns: `repeat(${activity.weeks.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {activity.weeks.map((week, weekIndex) => (
                      <div className="token-heatmap-week" role="row" key={weekIndex}>
                        {week.map((day) => (
                          <span
                            className={`token-heatmap-day level-${day.level}`}
                            key={day.date}
                            role="gridcell"
                            aria-label={`${day.date}，${day.tokens.toLocaleString("zh-CN")} Token`}
                            onPointerEnter={(event) => {
                              const bounds = event.currentTarget.getBoundingClientRect();
                              const cellCenter = bounds.left + bounds.width / 2;
                              const tooltipLeft = Math.min(
                                window.innerWidth - 150,
                                Math.max(150, cellCenter),
                              );
                              setActivityTooltip({
                                arrowOffset: Math.max(
                                  -130,
                                  Math.min(130, cellCenter - tooltipLeft),
                                ),
                                label: activityTooltipLabel(day),
                                left: tooltipLeft,
                                top: bounds.top - 8,
                              });
                            }}
                            onPointerLeave={() => setActivityTooltip(undefined)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <footer>
                <span>少</span>
                {[0, 1, 2, 3, 4].map((level) => (
                  <i className={`token-heatmap-day level-${level}`} key={level} />
                ))}
                <span>多</span>
              </footer>
            </section>

            <section className="profile-usage-section">
              <header>
                <strong>Token 明细</strong>
                <span>本机会话累计</span>
              </header>
              <div className="profile-usage-grid">
                <ProfileUsageItem label="输入 Token" value={usage.inputTokens.toLocaleString("zh-CN")} />
                <ProfileUsageItem label="输出 Token" value={usage.outputTokens.toLocaleString("zh-CN")} />
                <ProfileUsageItem label="推理 Token" value={usage.reasoningTokens.toLocaleString("zh-CN")} />
                <ProfileUsageItem
                  label="缓存 Token（读 / 写）"
                  value={usage.cacheMetricsAvailable
                    ? `${usage.cacheReadTokens.toLocaleString("zh-CN")} / ${usage.cacheWriteTokens.toLocaleString("zh-CN")}`
                    : "当前协议未返回"}
                />
                <ProfileUsageItem
                  label="缓存命中率"
                  value={hitRate === undefined ? "暂无数据" : `${(hitRate * 100).toFixed(1)}%`}
                />
                <ProfileUsageItem
                  label="模型请求 / 会话"
                  value={`${statistics?.requestCount ?? 0} / ${statistics?.conversationCount ?? 0}`}
                />
              </div>
            </section>
          </>
        )}
      </div>
      {activityTooltip && createPortal(
        <div
          className="profile-heatmap-tooltip"
          role="tooltip"
          style={{
            "--profile-tooltip-arrow-offset": `${activityTooltip.arrowOffset}px`,
            left: activityTooltip.left,
            top: activityTooltip.top,
          } as CSSProperties}
        >
          {activityTooltip.label}
        </div>,
        document.body,
      )}
    </main>
  );
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function ProfileUsageItem({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

interface ActivityDay {
  date: string;
  tokens: number;
  level: number;
}

function buildActivityCalendar(statistics?: TokenUsageStatistics) {
  const days = buildActivityDays(statistics);
  const weeks: ActivityDay[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  const months = weeks.flatMap((daysInWeek, weekIndex) => {
    const firstOfMonth = daysInWeek.find((day) => day?.date.endsWith("-01"));
    return firstOfMonth
      ? [{
          label: `${Number(firstOfMonth.date.slice(5, 7))}月`,
          weekIndex,
        }]
      : [];
  });

  return { weeks, months };
}

function activityTooltipLabel(day: ActivityDay): string {
  const [, month, date] = day.date.split("-");
  return `${Number(month)}月${Number(date)}日 使用了 ${formatCompact(day.tokens)} 个 Token`;
}

function buildActivityDays(statistics?: TokenUsageStatistics): ActivityDay[] {
  const totals = new Map(
    (statistics?.daily ?? []).map((day) => [
      day.date,
      normalizeTokenUsage(day.usage).totalTokens,
    ]),
  );
  const maximum = Math.max(0, ...totals.values());
  const days: ActivityDay[] = [];
  const today = new Date();
  for (let offset = ACTIVITY_DAY_COUNT - 1; offset >= 0; offset -= 1) {
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
