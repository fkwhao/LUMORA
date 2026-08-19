import { Braces, Download, Gauge, MessageSquareText } from "lucide-react";

import type { ChatMessage } from "../../../../shared/model-contract";
import {
  aggregateMessageUsage,
  cacheHitRate,
  countModelRequests,
  normalizeTokenUsage,
} from "../state/token-usage";
import { resolveContextBreakdown } from "../state/context-usage";

interface ConversationUsagePaneProps {
  messages: ChatMessage[];
  conversationTitle: string;
  provider: string;
  model: string;
  contextTokens: number;
  contextLimit: number;
  contextPercent: number;
  estimated: boolean;
  createdAt?: string;
  updatedAt?: string;
  onExport(): void;
}

export function ConversationUsagePane({
  messages,
  conversationTitle,
  provider,
  model,
  contextTokens,
  contextLimit,
  contextPercent,
  estimated,
  createdAt,
  updatedAt,
  onExport,
}: ConversationUsagePaneProps) {
  const usage = aggregateMessageUsage(messages);
  const hitRate = cacheHitRate(usage);
  const userMessages = messages.filter((message) => message.role === "user").length;
  const assistantMessages = messages.filter((message) => message.role === "assistant").length;
  const modelRequests = countModelRequests(messages);
  const dates = messages
    .map((message) => message.createdAt)
    .filter((value): value is string => Boolean(value));
  const breakdown = resolveContextBreakdown(messages);

  return (
      <div className="conversation-usage-scroll right-sidebar-scroll-content">
        <section className="context-stat-grid" aria-label="会话统计">
          <UsageFact label="会话" value={conversationTitle} />
          <UsageFact label="消息数" value={messages.length.toLocaleString("zh-CN")} />
          <UsageFact label="提供商" value={provider || "未配置"} />
          <UsageFact label="模型" value={model || "未选择模型"} />
          <UsageFact label="上下文限制" value={formatTokens(contextLimit)} />
          <UsageFact label="词元总数" value={usage.totalTokens.toLocaleString("zh-CN")} />
          <UsageFact
            label="使用率"
            value={`${estimated ? "约 " : ""}${contextPercent}%`}
          />
          <UsageFact label="输入词元" value={usage.inputTokens.toLocaleString("zh-CN")} />
          <UsageFact label="输出词元" value={usage.outputTokens.toLocaleString("zh-CN")} />
          <UsageFact label="推理词元" value={usage.reasoningTokens.toLocaleString("zh-CN")} />
          <UsageFact
            label="缓存词元（读/写）"
            value={usage.cacheMetricsAvailable
              ? `${usage.cacheReadTokens.toLocaleString("zh-CN")} / ${usage.cacheWriteTokens.toLocaleString("zh-CN")}`
              : "协议未返回"}
          />
          <UsageFact
            label="缓存命中率"
            value={hitRate === undefined ? "暂无数据" : `${(hitRate * 100).toFixed(1)}%`}
          />
          <UsageFact label="用户消息" value={userMessages.toLocaleString("zh-CN")} />
          <UsageFact label="助手消息" value={assistantMessages.toLocaleString("zh-CN")} />
          <UsageFact label="模型请求" value={modelRequests.toLocaleString("zh-CN")} />
          <UsageFact label="创建时间" value={formatDate(createdAt ?? dates[0])} />
          <UsageFact label="最后活动" value={formatDate(updatedAt ?? dates.at(-1))} />
        </section>

        <section className="context-breakdown" aria-label="上下文细分">
          <header>
            <Gauge />
            <strong>上下文细分</strong>
            <span>{formatTokens(contextTokens)} Token</span>
          </header>
          <div className="context-breakdown-bar" aria-hidden="true">
            {breakdown.map((part) => (
              <i
                className={`context-segment ${part.kind}`}
                key={part.kind}
                style={{ width: `${part.percent}%` }}
              />
            ))}
          </div>
          <div className="context-breakdown-legend">
            {breakdown.map((part) => (
              <span key={part.kind}>
                <i className={`context-legend-dot ${part.kind}`} />
                {part.label} {formatPercent(part.percent)}
              </span>
            ))}
          </div>
        </section>

        <section className="context-raw-messages">
          <header>
            <div><Braces /><strong>原始消息</strong></div>
            <button type="button" onClick={onExport}>
              <Download />
              导出会话
            </button>
          </header>
          <div className="context-message-list">
            {messages.map((message, index) => (
              <details key={message.runtimeId ?? message.messageId ?? index}>
                <summary>
                  <MessageSquareText />
                  <strong>{message.role}</strong>
                  <span>· {message.messageId ?? `message-${index + 1}`}</span>
                  <time>{formatDate(message.createdAt)}</time>
                </summary>
                <div>
                  <p>{message.content || "（空消息）"}</p>
                  {message.usage && (
                    <small>
                      {normalizeTokenUsage(message.usage).totalTokens.toLocaleString("zh-CN")} Token
                    </small>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
  );
}

function UsageFact({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong title={value}>{value}</strong></div>;
}

function formatPercent(value: number): string {
  if (value === 0) return "0%";
  if (value < 0.1) return "<0.1%";
  return `${value.toFixed(1)}%`;
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

function formatDate(value?: string): string {
  if (!value) return "暂无记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
