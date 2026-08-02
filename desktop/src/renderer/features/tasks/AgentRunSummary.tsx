import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  CircleDashed,
  TerminalSquare,
} from "lucide-react";

import type { TaskEvent } from "../../../shared/task-contract";

interface AgentRunSummaryProps {
  durationMs?: number;
  events: TaskEvent[];
  running: boolean;
}

/**
 * 展示可验证的 Agent 运行事件。这里不会渲染模型隐藏推理，
 * 避免把不稳定的思维文本误认为真实执行记录。
 */
export function AgentRunSummary({
  durationMs,
  events,
  running,
}: AgentRunSummaryProps) {
  const [expanded, setExpanded] = useState(running);
  const wasRunning = useRef(running);

  useEffect(() => {
    if (running) {
      setExpanded(true);
    } else if (wasRunning.current) {
      setExpanded(false);
    }
    wasRunning.current = running;
  }, [running]);

  const visibleEvents = events.slice(-8);
  return (
    <section className={`agent-run${expanded ? " expanded" : ""}`}>
      <button
        className="agent-run-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span>
          {running
            ? "正在处理"
            : durationMs
              ? `已处理 ${formatDuration(durationMs)}`
              : "已处理"}
        </span>
        <ChevronRight size={15} />
      </button>
      <div className="agent-run-events" aria-hidden={!expanded}>
        <div className="agent-run-events-inner">
          {visibleEvents.length > 0 ? (
            visibleEvents.map((event) => (
              <div className="agent-run-event" key={event.sequence}>
                <span>
                  {event.type === "PLAN_STEP_COMPLETED" ? (
                    <Check size={13} />
                  ) : (
                    <TerminalSquare size={13} />
                  )}
                </span>
                <div>
                  <strong>{event.title || eventTypeLabel(event.type)}</strong>
                  {event.userMessage && <p>{event.userMessage}</p>}
                </div>
              </div>
            ))
          ) : (
            <div className="agent-run-event">
              <span>
                <CircleDashed size={13} />
              </span>
              <div>
                <strong>
                  {running ? "正在生成回答" : "回答生成完成"}
                </strong>
                <p>当前链路还没有返回更细的工具执行事件。</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function formatDuration(durationMs: number): string {
  if (durationMs < 60_000) {
    return `${Math.max(1, Math.round(durationMs / 1000))}s`;
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function eventTypeLabel(type: TaskEvent["type"]): string {
  const labels: Record<TaskEvent["type"], string> = {
    TASK_CREATED: "任务已创建",
    STATUS_CHANGED: "任务状态已更新",
    PLAN_STEP_STARTED: "开始执行计划步骤",
    PLAN_STEP_COMPLETED: "计划步骤已完成",
    APPROVAL_REQUESTED: "等待操作确认",
    APPROVAL_DECIDED: "操作确认已处理",
    RESULT_AVAILABLE: "结果已生成",
    TASK_ERROR: "执行出现错误",
  };
  return labels[type];
}
