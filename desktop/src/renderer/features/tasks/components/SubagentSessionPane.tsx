import {
  Activity,
  ArrowLeft,
  Bot,
  Check,
  ChevronRight,
  Copy,
  FileSearch,
  Search,
  TerminalSquare,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import type { WorkLogItem, WorkLogItemStatus } from "../../../../shared/model-contract";
import { MarkdownMessage } from "../../../components/MarkdownMessage";

export interface SubagentSession {
  agentId: string;
  sessionId: string;
  parentAgentId: string;
  delegationDepth: number;
  label: string;
  status: WorkLogItemStatus;
  model: string;
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  activeContextTokens?: number;
  createdAt?: string;
  answer: string;
  events: WorkLogItem[];
  parent?: Pick<SubagentSession, "agentId" | "label">;
  children: SubagentSession[];
}

interface SubagentSessionPaneProps {
  session?: SubagentSession;
  onOpenAgent(agentId: string): void;
}

export function SubagentSessionPane({
  session,
  onOpenAgent,
}: SubagentSessionPaneProps) {
  const copyResetTimer = useRef<number | undefined>(undefined);
  const [stepsOpen, setStepsOpen] = useState(session?.status === "running");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setStepsOpen(session?.status === "running");
    setCopied(false);
  }, [session?.agentId, session?.status]);

  useEffect(
    () => () => {
      if (copyResetTimer.current !== undefined) {
        window.clearTimeout(copyResetTimer.current);
      }
    },
    [],
  );

  async function copyAnswer() {
    if (!session?.answer || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(session.answer);
    } catch {
      return;
    }
    setCopied(true);
    window.clearTimeout(copyResetTimer.current);
    copyResetTimer.current = window.setTimeout(() => setCopied(false), 1600);
  }

  return (
      <div className="conversation-usage-scroll subagent-session-scroll right-sidebar-scroll-content">
        {session && (
          <>
            {session.parent && (
              <button
                className="subagent-parent-link"
                type="button"
                onClick={() => onOpenAgent(session.parent!.agentId)}
              >
                <ArrowLeft size={13} />
                返回 {session.parent.label}
              </button>
            )}
            <section
              className="subagent-session-summary"
              aria-label="子 Agent Session 信息"
              title={`Session ${shortId(session.sessionId)} · 父 Agent ${session.parentAgentId || "supervisor"}`}
            >
              <span className="subagent-session-status" data-status={session.status}>
                <i aria-hidden="true" />
                {statusLabel(session.status)}
              </span>
              {session.durationMs !== undefined && (
                <span>{formatDuration(session.durationMs)}</span>
              )}
              <span>{session.model || "沿用 Supervisor 模型"}</span>
              <span>Depth {session.delegationDepth}</span>
              {session.totalTokens !== undefined && (
                <span>{formatTokens(session.totalTokens)} tokens</span>
              )}
            </section>

            <section className="subagent-trace" aria-label="子 Agent 执行步骤">
              <button
                className="subagent-section-toggle"
                type="button"
                aria-expanded={stepsOpen}
                onClick={() => setStepsOpen((current) => !current)}
              >
                <span>
                  <ChevronRight className="subagent-section-chevron" size={14} />
                  执行步骤
                </span>
                <small>{session.events.length}</small>
              </button>
              <div className="subagent-trace-collapse" aria-hidden={!stepsOpen}>
                <div className="subagent-trace-list">
                  {session.events.length === 0 && (
                    <p className="subagent-trace-empty">等待子 Agent 报告执行步骤…</p>
                  )}
                  {session.events.map((item) => (
                    <SubagentTraceItem item={item} key={item.itemId} />
                  ))}
                </div>
              </div>
            </section>

            {session.children.length > 0 && (
              <section className="subagent-children" aria-label="该 Agent 委派的子 Agent">
                <header>
                  <span>委派的 Agent</span>
                  <small>{session.children.length} 个独立 Session</small>
                </header>
                <div className="subagent-children-list">
                  {session.children.map((child) => (
                    <button
                      key={child.agentId}
                      type="button"
                      onClick={() => onOpenAgent(child.agentId)}
                      aria-label={`查看 ${child.label} 的执行过程`}
                    >
                      <span className="subagent-pane-avatar" data-status={child.status}>
                        <Bot size={13} />
                      </span>
                      <span>
                        <strong>{child.label}</strong>
                        <small>{statusText(child.status, child.durationMs)}</small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="subagent-answer">
              {session.answer ? (
                <MarkdownMessage content={session.answer} />
              ) : (
                <p>子 Agent 完成后，结论会显示在这里。</p>
              )}
              <footer className="subagent-answer-meta">
                <button
                  type="button"
                  className={copied ? "is-copied" : undefined}
                  aria-label={copied ? "已复制子 Agent 回复" : "复制子 Agent 回复"}
                  title={copied ? "已复制" : "复制"}
                  disabled={!session.answer}
                  onClick={() => void copyAnswer()}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <time dateTime={session.createdAt}>
                  {formatSessionTime(session.createdAt) || (
                    session.durationMs !== undefined
                      ? `耗时 ${formatDuration(session.durationMs)}`
                      : ""
                  )}
                </time>
              </footer>
            </section>
          </>
        )}
      </div>
  );
}

function SubagentTraceItem({ item }: { item: WorkLogItem }) {
  const childType = stringMetadata(item, "childEventType");
  const Icon = childType.startsWith("web_search")
    ? Search
    : item.toolName === "read_file" || item.toolName === "search_in_file"
      ? FileSearch
      : childType.startsWith("tool_")
        ? TerminalSquare
        : Activity;
  const title = item.title || traceTitle(childType, item.toolName);
  const detail = item.content || item.output || item.errorMessage;

  const row = (
    <>
      <span className="subagent-trace-icon"><Icon size={13} /></span>
      <span className="subagent-trace-title">{title}</span>
      <small>{item.durationMs ? formatDuration(item.durationMs) : ""}</small>
      {detail && <ChevronRight className="subagent-trace-chevron" size={13} />}
    </>
  );

  if (detail) {
    return (
      <details className="subagent-trace-item" data-status={item.status}>
        <summary>{row}</summary>
        <div className="subagent-trace-detail"><p>{detail}</p></div>
      </details>
    );
  }

  return (
    <article className="subagent-trace-item" data-status={item.status}>
      <div className="subagent-trace-row">{row}</div>
    </article>
  );
}

function stringMetadata(item: WorkLogItem, key: string): string {
  const value = item.metadata?.[key];
  return typeof value === "string" ? value : "";
}

function traceTitle(type: string, toolName?: string): string {
  if (type === "progress_message") return "阶段更新";
  if (type === "tool_started") return `正在调用 ${toolName || "工具"}`;
  if (type === "tool_completed") return `${toolName || "工具"} 已完成`;
  if (type === "tool_failed") return `${toolName || "工具"} 失败`;
  if (type.startsWith("web_search")) return "网络检索";
  if (type.startsWith("context_compaction")) return "整理子 Session 上下文";
  return "执行步骤";
}

function statusLabel(status: WorkLogItemStatus): string {
  if (status === "running") return "执行中";
  if (status === "failed") return "未完成";
  return "已完成";
}

function statusText(status: WorkLogItemStatus, durationMs?: number): string {
  const duration = durationMs === undefined ? "" : ` · ${formatDuration(durationMs)}`;
  return `${statusLabel(status)}${duration}`;
}

function shortId(value: string): string {
  if (!value) return "未记录";
  const id = value.split(":").at(-1) || value;
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function formatTokens(value?: number): string {
  return value === undefined ? "—" : value.toLocaleString("zh-CN");
}

function formatDuration(value: number): string {
  if (value < 60_000) return `${Math.max(1, Math.round(value / 1000))}s`;
  return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1000)}s`;
}

function formatSessionTime(createdAt?: string): string {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
