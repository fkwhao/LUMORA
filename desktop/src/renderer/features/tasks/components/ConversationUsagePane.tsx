import {
  Braces,
  Download,
  Gauge,
  MessageSquareText,
  X,
} from "lucide-react";
import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import type { ChatMessage } from "../../../../shared/model-contract";
import {
  MAX_CONTEXT_PANE_WIDTH,
  MIN_CONTEXT_PANE_WIDTH,
} from "../../../constants/layout";
import {
  clampContextPaneWidth,
  shouldCollapseContextPaneOnDrag,
  shouldExpandContextPaneOnDrag,
} from "../../layout/context-pane-preferences";
import {
  aggregateMessageUsage,
  cacheHitRate,
  normalizeTokenUsage,
} from "../state/token-usage";

interface ConversationUsagePaneProps {
  open: boolean;
  width: number;
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
  onClose(): void;
  onExport(): void;
  onOpenChange(open: boolean): void;
  onWidthChange(width: number): void;
  onWidthCommit(width: number): void;
}

interface DragState {
  x: number;
  width: number;
  currentWidth: number;
  rememberedWidth: number;
  startedOpen: boolean;
  open: boolean;
}

export function ConversationUsagePane({
  open,
  width,
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
  onClose,
  onExport,
  onOpenChange,
  onWidthChange,
  onWidthCommit,
}: ConversationUsagePaneProps) {
  const paneRef = useRef<HTMLElement>(null);
  const dragStart = useRef<DragState | undefined>(undefined);
  const usage = aggregateMessageUsage(messages);
  const hitRate = cacheHitRate(usage);
  const userMessages = messages.filter((message) => message.role === "user").length;
  const assistantMessages = messages.filter((message) => message.role === "assistant").length;
  const modelRequests = messages.filter(
    (message) =>
      message.role === "assistant" &&
      normalizeTokenUsage(message.usage).totalTokens > 0,
  ).length;
  const dates = messages
    .map((message) => message.createdAt)
    .filter((value): value is string => Boolean(value));
  const breakdown = resolveContextBreakdown(messages, contextTokens);
  const style = { "--context-pane-width": `${width}px` } as CSSProperties;

  function startResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startWidth = open ? width : 0;
    dragStart.current = {
      x: event.clientX,
      width: startWidth,
      currentWidth: startWidth,
      rememberedWidth: width,
      startedOpen: open,
      open,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.classList.add("resizing-context-pane");
    if (!open) {
      document.body.classList.add("opening-context-pane-by-drag");
    }
  }

  function resize(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    const nextWidth = Math.min(
      MAX_CONTEXT_PANE_WIDTH,
      Math.max(
        0,
        Math.round(
          dragStart.current.width + dragStart.current.x - event.clientX,
        ),
      ),
    );
    dragStart.current.currentWidth = nextWidth;
    paneRef.current?.style.setProperty(
      "--context-pane-width",
      `${nextWidth}px`,
    );
    event.currentTarget.setAttribute("aria-valuenow", String(nextWidth));
    const nextOpen = dragStart.current.startedOpen
      ? !shouldCollapseContextPaneOnDrag(nextWidth)
      : shouldExpandContextPaneOnDrag(nextWidth);
    if (nextOpen !== dragStart.current.open) {
      dragStart.current.open = nextOpen;
      paneRef.current?.classList.toggle("is-open", nextOpen);
      paneRef.current?.setAttribute("aria-hidden", String(!nextOpen));
    }
  }

  function stopResize(event: PointerEvent<HTMLDivElement>) {
    const drag = dragStart.current;
    dragStart.current = undefined;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    document.body.classList.remove("resizing-context-pane");
    document.body.classList.remove("opening-context-pane-by-drag");
    if (!drag) return;
    const settledWidth = drag.open
      ? clampContextPaneWidth(drag.currentWidth)
      : drag.startedOpen
        ? MIN_CONTEXT_PANE_WIDTH
        : drag.rememberedWidth;
    onOpenChange(drag.open);
    onWidthChange(settledWidth);
    onWidthCommit(settledWidth);
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    if (!open) {
      if (event.key === "ArrowLeft") onOpenChange(true);
      return;
    }
    if (event.key === "ArrowRight" && width <= MIN_CONTEXT_PANE_WIDTH) {
      onOpenChange(false);
      return;
    }
    const nextWidth = clampContextPaneWidth(
      width + (event.key === "ArrowLeft" ? 24 : -24),
    );
    onWidthChange(nextWidth);
    onWidthCommit(nextWidth);
  }

  return (
    <aside
      ref={paneRef}
      className={`conversation-usage-pane${open ? " is-open" : ""}`}
      style={style}
      aria-label="当前会话 Token 信息"
      aria-hidden={!open}
    >
      <div
        className="context-pane-resize-handle"
        role="separator"
        aria-label="调整上下文侧边栏宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_CONTEXT_PANE_WIDTH}
        aria-valuemax={MAX_CONTEXT_PANE_WIDTH}
        aria-valuenow={width}
        tabIndex={open ? 0 : -1}
        onKeyDown={resizeWithKeyboard}
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
      />

      <header className="context-pane-header">
        <div className="context-pane-tab">
          <span
            className="context-pane-mini-ring"
            style={{ "--usage": contextPercent } as CSSProperties}
            aria-hidden="true"
          />
          <strong>上下文</strong>
          <button type="button" aria-label="关闭上下文统计" onClick={onClose}>
            <X />
          </button>
        </div>
      </header>

      <div className="conversation-usage-scroll">
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
            <span>
              {estimated ? "本地估算总量" : "最近请求总量"} · {formatTokens(contextTokens)} Token
              · 细分为本地估算
            </span>
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
    </aside>
  );
}

function UsageFact({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong title={value}>{value}</strong></div>;
}

function resolveContextBreakdown(messages: ChatMessage[], contextTokens: number) {
  const user = messages
    .filter((message) => message.role === "user")
    .reduce((total, message) => total + estimateTextTokens(message.content), 0);
  const assistant = messages
    .filter((message) => message.role === "assistant")
    .reduce((total, message) => total + estimateTextTokens(message.content), 0);
  const tools = messages.reduce(
    (total, message) => total + (
      message.workLog?.length
        ? estimateTextTokens(JSON.stringify(message.workLog))
        : 0
    ),
    0,
  );
  const known = user + assistant + tools;
  const denominator = Math.max(contextTokens, known, 1);
  const other = Math.max(0, denominator - known);
  return [
    { kind: "user", label: "用户", percent: (user / denominator) * 100 },
    { kind: "assistant", label: "助手", percent: (assistant / denominator) * 100 },
    { kind: "tools", label: "工具调用", percent: (tools / denominator) * 100 },
    { kind: "other", label: "其他", percent: (other / denominator) * 100 },
  ];
}

function estimateTextTokens(content: string): number {
  let ascii = 0;
  let nonAscii = 0;
  for (const character of content) {
    if (character.codePointAt(0)! <= 0x7f) ascii += 1;
    else nonAscii += 1;
  }
  return nonAscii + Math.ceil(ascii / 4);
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
