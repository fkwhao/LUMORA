import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Inbox,
  MessagesSquare,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type {
  WorkLogItem,
  WorkLogItemStatus,
} from "../../../../shared/model-contract";
import { MarkdownMessage } from "../../../components/MarkdownMessage";
import { AgentIdentityAvatar } from "./AgentIdentityAvatar";
import { AgentRunSummary } from "./AgentRunSummary";

export interface SubagentActivationInput {
  messageId: string;
  sequence: number;
  senderAgentId: string;
  senderLabel: string;
  kind: "task" | "peer";
  content: string;
}

export interface SubagentActivation {
  activationId: string;
  status: WorkLogItemStatus;
  activationStatus: string;
  createdAt?: string;
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  activeContextTokens?: number;
  inputs: SubagentActivationInput[];
  events: WorkLogItem[];
  answer: string;
}

export interface SubagentSession {
  agentId: string;
  sessionId: string;
  parentAgentId: string;
  teamId?: string;
  delegationDepth: number;
  label: string;
  status: WorkLogItemStatus;
  model: string;
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  activeContextTokens?: number;
  mode?: "one_shot" | "continuable";
  pendingInboxCount?: number;
  lastInboxSequence?: number;
  consumedInboxSequence?: number;
  checkpointSequence?: number;
  unreadReportCount?: number;
  recovered?: boolean;
  createdAt?: string;
  activations: SubagentActivation[];
  pendingPeerMessages: WorkLogItem[];
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

          <SessionSummary session={session} />

          {session.pendingPeerMessages.length > 0 && (
            <section className="subagent-pending-messages" aria-label="等待消费的 Team 消息">
              <header>
                <span><Inbox size={13} /> 等待下轮 Activation</span>
                <small>{session.pendingPeerMessages.length} 条 quiet 消息</small>
              </header>
              {session.pendingPeerMessages.map((item) => (
                <article key={item.itemId}>
                  <MessagesSquare size={13} />
                  <span>
                    <strong>{peerRoute(item)}</strong>
                    <p>{item.content}</p>
                  </span>
                </article>
              ))}
            </section>
          )}

          <section className="subagent-activation-list" aria-label="Agent 会话记录">
            {session.activations.length === 0 && (
              <div className="subagent-activation-empty">
                <span>等待 Activation</span>
                <p>任务进入 Session 后，这里会实时显示阶段更新和工具调用。</p>
              </div>
            )}
            {session.activations.map((activation, index) => (
              <ActivationCard
                activation={activation}
                index={index}
                isLatest={index === session.activations.length - 1}
                key={activation.activationId}
                onOpenAgent={onOpenAgent}
              />
            ))}
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
                    <AgentIdentityAvatar
                      agentId={child.agentId}
                      className="subagent-pane-avatar"
                    />
                    <span>
                      <strong>{child.label}</strong>
                      <small>{sessionStatusText(child)}</small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SessionSummary({ session }: { session: SubagentSession }) {
  const latest = session.activations.at(-1);
  return (
    <section
      className="subagent-session-summary"
      aria-label="子 Agent Session 信息"
      title={`Session ${shortId(session.sessionId)} · 父 Agent ${session.parentAgentId || "supervisor"}`}
    >
      <span className="subagent-session-status" data-status={session.status}>
        <i aria-hidden="true" />
        {latest ? activationLabel(latest.activationStatus) : statusLabel(session.status)}
      </span>
      <span>{session.activations.length} 次 Activation</span>
      {session.durationMs !== undefined && <span>{formatDuration(session.durationMs)}</span>}
      <span>{session.model || "沿用 Supervisor 模型"}</span>
      <span>Depth {session.delegationDepth}</span>
      {session.mode === "continuable" && <span>Session 可续接</span>}
      {(session.pendingInboxCount ?? 0) > 0 && (
        <span>Inbox {session.pendingInboxCount} 待处理</span>
      )}
      {session.checkpointSequence !== undefined && (
        <span>Checkpoint #{session.checkpointSequence}</span>
      )}
      {(session.unreadReportCount ?? 0) > 0 && (
        <span>报告 {session.unreadReportCount}</span>
      )}
      {session.recovered && <span>已从 Checkpoint 恢复</span>}
      {session.totalTokens !== undefined && (
        <span>{formatTokens(session.totalTokens)} tokens</span>
      )}
    </section>
  );
}

function ActivationCard({
  activation,
  index,
  isLatest,
  onOpenAgent,
}: {
  activation: SubagentActivation;
  index: number;
  isLatest: boolean;
  onOpenAgent(agentId: string): void;
}) {
  const copyResetTimer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(isLatest || activation.status === "running");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOpen(isLatest || activation.status === "running");
    setCopied(false);
  }, [activation.activationId, activation.status, isLatest]);

  useEffect(
    () => () => {
      if (copyResetTimer.current !== undefined) {
        window.clearTimeout(copyResetTimer.current);
      }
    },
    [],
  );

  async function copyAnswer() {
    if (!activation.answer || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(activation.answer);
    } catch {
      return;
    }
    setCopied(true);
    window.clearTimeout(copyResetTimer.current);
    copyResetTimer.current = window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article
      className={`subagent-activation${open ? " is-open" : ""}`}
      data-status={activation.status}
    >
      <button
        className="subagent-activation-toggle"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="subagent-activation-index">{index + 1}</span>
        <span>
          <strong>Activation {index + 1}</strong>
          <small>{activationSummary(activation)}</small>
        </span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      <div className="subagent-activation-region" aria-hidden={!open}>
        <div className="subagent-activation-content">
          {activation.inputs.map((input) => (
            <article
              className="subagent-activation-input"
              data-kind={input.kind}
              key={input.messageId}
            >
              <header>
                {input.kind === "peer" ? <MessagesSquare size={12} /> : <Inbox size={12} />}
                <span>{inputLabel(input)}</span>
              </header>
              <p>{input.content}</p>
            </article>
          ))}

          <AgentRunSummary
            answerStarted={Boolean(activation.answer)}
            durationMs={activation.durationMs}
            running={activation.status === "running"}
            stopped={activation.activationStatus === "interrupted"}
            workLog={activation.events}
            onOpenAgent={onOpenAgent}
          />

          <section className="subagent-answer">
            {activation.answer ? (
              <MarkdownMessage content={activation.answer} />
            ) : (
              <p>{activation.status === "running" ? "Agent 正在处理本轮任务…" : "本轮没有文本回答。"}</p>
            )}
            <footer className="subagent-answer-meta">
              <button
                type="button"
                className={copied ? "is-copied" : undefined}
                aria-label={copied ? "已复制子 Agent 回复" : "复制子 Agent 回复"}
                title={copied ? "已复制" : "复制"}
                disabled={!activation.answer}
                onClick={() => void copyAnswer()}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
              {activation.totalTokens !== undefined && (
                <span>{formatTokens(activation.totalTokens)} tokens</span>
              )}
              {activation.activeContextTokens !== undefined && (
                <span>上下文 {formatTokens(activation.activeContextTokens)}</span>
              )}
              <time dateTime={activation.createdAt}>
                {formatSessionTime(activation.createdAt)}
              </time>
            </footer>
          </section>
        </div>
      </div>
    </article>
  );
}

function inputLabel(input: SubagentActivationInput): string {
  if (input.kind === "task") {
    return input.senderAgentId === "supervisor" ? "Supervisor 派发任务" : "父 Agent 追加任务";
  }
  return `来自 ${input.senderLabel || shortId(input.senderAgentId)} 的 Team 消息`;
}

function peerRoute(item: WorkLogItem): string {
  const sender = stringMetadata(item, "senderAgentLabel")
    || shortId(stringMetadata(item, "senderAgentId"));
  const target = stringMetadata(item, "targetAgentLabel")
    || shortId(stringMetadata(item, "targetAgentId"));
  return `${sender || "Agent"} → ${target || "Agent"}`;
}

function activationSummary(activation: SubagentActivation): string {
  const state = activationLabel(activation.activationStatus);
  const stepCount = activation.events.length;
  const duration = activation.durationMs === undefined
    ? ""
    : ` · ${formatDuration(activation.durationMs)}`;
  return `${state} · ${stepCount} 个步骤${duration}`;
}

function stringMetadata(item: WorkLogItem, key: string): string {
  const value = item.metadata?.[key];
  return typeof value === "string" ? value : "";
}

function statusLabel(status: WorkLogItemStatus): string {
  if (status === "running") return "执行中";
  if (status === "failed") return "未完成";
  return "已完成";
}

function activationLabel(status?: string): string {
  if (status === "running") return "执行中";
  if (status === "interrupted") return "已中止，可续接";
  if (status === "failed") return "失败，可续接";
  if (status === "closed") return "已关闭";
  if (status === "completed") return "已完成";
  return "空闲";
}

function sessionStatusText(session: SubagentSession): string {
  const latest = session.activations.at(-1);
  const duration = session.durationMs === undefined
    ? ""
    : ` · ${formatDuration(session.durationMs)}`;
  const label = latest
    ? activationLabel(latest.activationStatus)
    : statusLabel(session.status);
  return `${label}${duration}`;
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
