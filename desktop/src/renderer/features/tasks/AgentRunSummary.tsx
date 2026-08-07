import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  FilePenLine,
  FileSearch,
  FolderSearch,
  Minimize2,
  PackageOpen,
  TerminalSquare,
  LoaderCircle,
} from "lucide-react";

import type { WorkLogItem } from "../../../shared/model-contract";
import type { TaskEvent } from "../../../shared/task-contract";

interface AgentRunSummaryProps {
  startedAt?: number;
  durationMs?: number;
  events?: TaskEvent[];
  workLog?: WorkLogItem[];
  running: boolean;
  stopped?: boolean;
  onReviewChange?(item: WorkLogItem): void;
  onOpenArtifact?(artifactId: string): void;
}

interface WorkPhase {
  phaseId: string;
  title: string;
  items: WorkLogItem[];
}

/** 展示公开的进度说明和真实工具事件，不渲染模型隐藏推理。 */
export const AgentRunSummary = memo(function AgentRunSummary({
  startedAt,
  durationMs,
  events = [],
  workLog = [],
  running,
  stopped = false,
  onReviewChange,
  onOpenArtifact,
}: AgentRunSummaryProps) {
  const [expanded, setExpanded] = useState(running);
  const [elapsedMs, setElapsedMs] = useState(() =>
    running && startedAt
      ? Math.max(0, Date.now() - startedAt)
      : durationMs ?? 0,
  );
  const wasRunning = useRef(running);
  const phases = useMemo(
    () => buildWorkPhases(workLog.length > 0 ? workLog : taskEventsAsWorkLog(events)),
    [events, workLog],
  );
  const hasDetails = phases.length > 0;
  const label = summaryLabel(running, stopped, elapsedMs, durationMs);

  useEffect(() => {
    if (!running) {
      setElapsedMs(durationMs ?? 0);
      return;
    }
    const started = startedAt ?? Date.now();
    const updateElapsed = () => setElapsedMs(Math.max(0, Date.now() - started));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 500);
    return () => window.clearInterval(timer);
  }, [durationMs, running, startedAt]);

  useEffect(() => {
    if (running) {
      setExpanded(true);
    } else if (wasRunning.current) {
      setExpanded(false);
    }
    wasRunning.current = running;
  }, [running]);

  return (
    <section className={`agent-run${expanded ? " expanded" : ""}`}>
      <div className="agent-run-heading">
        {running ? (
          <div
            aria-label={label}
            className="agent-run-toggle is-running is-static"
            role="status"
          >
            <LoaderCircle aria-hidden className="agent-run-loader" size={13} />
            <span>{label}</span>
          </div>
        ) : hasDetails ? (
          <button
            className="agent-run-toggle"
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            <span>{label}</span>
            <ChevronRight className="agent-run-chevron" size={15} />
          </button>
        ) : (
          <div className="agent-run-toggle is-static">
            <span>{label}</span>
          </div>
        )}
      </div>
      {hasDetails && <div className="agent-run-events" aria-hidden={!expanded}>
        <div className="agent-run-events-inner">
          {phases.map((phase, index) => (
            <WorkPhaseEntry
              active={running && index === phases.length - 1}
              key={phase.phaseId}
              onReviewChange={onReviewChange}
              onOpenArtifact={onOpenArtifact}
              phase={phase}
            />
          ))}
        </div>
      </div>}
    </section>
  );
});

function WorkPhaseEntry({
  phase,
  active,
  onReviewChange,
  onOpenArtifact,
}: {
  phase: WorkPhase;
  active: boolean;
  onReviewChange?: (item: WorkLogItem) => void;
  onOpenArtifact?: (artifactId: string) => void;
}) {
  const running = active || phase.items.some((item) => item.status === "running");
  const [expanded, setExpanded] = useState(running);

  useEffect(() => {
    if (running) {
      setExpanded(true);
    }
  }, [running]);

  return (
    <section className={`work-phase${expanded ? " expanded" : ""}`}>
      <button
        className={`work-phase-toggle${running ? " shimmer-text" : ""}`}
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span>{phase.title}</span>
      </button>
      {phase.items.length > 0 && (
        <div className="work-phase-steps" aria-hidden={!expanded}>
          <div className="work-phase-steps-inner">
          {phase.items.map((item) => (
            <ToolCallItem
              item={item}
              key={item.itemId}
              onReviewChange={onReviewChange}
              onOpenArtifact={onOpenArtifact}
            />
          ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ToolCallItem({
  item,
  onReviewChange,
  onOpenArtifact,
}: {
  item: WorkLogItem;
  onReviewChange?: (item: WorkLogItem) => void;
  onOpenArtifact?: (artifactId: string) => void;
}) {
  // 单次调用默认保持一行摘要；即使正在执行，也只对摘要做扫光。
  // 详细参数和输出由用户按需展开，避免执行轨迹退化成大块调试面板。
  const [expanded, setExpanded] = useState(false);
  const command = stringArgument(item, "command");
  const path = stringArgument(item, "path");
  const primaryDetail = command || path || item.title || item.toolName || "工具调用";
  const isEdit = item.toolName === "write_file" || item.toolName === "apply_patch";
  const artifactId = stringMetadata(item, "artifactId");
  const Icon = item.kind === "context" ? Minimize2 : toolIcon(item.toolName ?? "");

  function activate() {
    if (isEdit && path && onReviewChange) {
      onReviewChange(item);
      return;
    }
    setExpanded((current) => !current);
  }

  return (
    <article
      className={`tool-call-item${expanded ? " expanded" : ""}`}
      data-status={item.status}
    >
      <button
        className={item.status === "running" ? "shimmer-text" : ""}
        type="button"
        aria-expanded={isEdit ? undefined : expanded}
        onClick={activate}
      >
        <Icon size={15} />
        <span>{toolCallLabel(item, primaryDetail)}</span>
        {isEdit && path && <ChevronRight className="tool-call-review-chevron" size={13} />}
      </button>
      {!isEdit && <div className="tool-call-detail-region" aria-hidden={!expanded}>
        <div
          className={`tool-call-detail${command ? " tool-call-detail-shell" : ""}`}
        >
          {command && (
            <div>
              <span>Shell 脚本</span>
              <pre><code>{command}</code></pre>
            </div>
          )}
          {!command && Object.keys(item.arguments ?? {}).length > 0 && (
            <div>
              <span>调用参数</span>
              <pre><code>{JSON.stringify(item.arguments, null, 2)}</code></pre>
            </div>
          )}
          {(item.output || item.errorMessage) && (
            <div>
              <span>{item.status === "failed" ? "错误输出" : "执行结果"}</span>
              <pre><code>{item.output || item.errorMessage}</code></pre>
            </div>
          )}
          {artifactId && onOpenArtifact && (
            <button
              className="artifact-open-button"
              type="button"
              onClick={() => onOpenArtifact(artifactId)}
            >
              <PackageOpen size={14} />
              查看完整 Artifact
            </button>
          )}
          <footer>
            {item.exitCode !== undefined && <span>退出码 {item.exitCode}</span>}
            {item.durationMs !== undefined && <span>耗时 {formatDuration(item.durationMs)}</span>}
          </footer>
        </div>
      </div>}
    </article>
  );
}

function buildWorkPhases(items: WorkLogItem[]): WorkPhase[] {
  const phases: WorkPhase[] = [];
  let current: WorkPhase | undefined;
  for (const item of items) {
    if (item.kind === "progress") {
      current = {
        phaseId: item.itemId,
        title: phaseTitle(item.content),
        items: [],
      };
      phases.push(current);
      continue;
    }
    if (!current) {
      current = {
        phaseId: `phase-${item.itemId}`,
        title: fallbackPhaseTitle(item),
        items: [],
      };
      phases.push(current);
    }
    current.items.push(item);
  }
  return phases;
}

function phaseTitle(content?: string): string {
  const normalized = (content ?? "")
    .replace(/[`*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "正在处理任务";
  const firstSentence = normalized.split(/(?<=[。！？!?])\s*/)[0] ?? normalized;
  const activeTitle = firstSentence
    .replace(/^(我会先|我先|接下来我会|接下来)[，,：:]?\s*/, "正在")
    .replace(/[。！？!?]$/, "");
  return activeTitle.length > 96
    ? `${activeTitle.slice(0, 96)}…`
    : activeTitle;
}

function fallbackPhaseTitle(item: WorkLogItem): string {
  if (item.kind === "context") return "整理上下文";
  if (item.toolName === "read_file" || item.toolName === "search_in_file") {
    return "正在定位相关内容";
  }
  if (item.toolName === "write_file" || item.toolName === "apply_patch") {
    return "正在修改文件";
  }
  if (item.toolName === "list_files") return "正在检查项目结构";
  return "正在执行命令";
}

function taskEventsAsWorkLog(events: TaskEvent[]): WorkLogItem[] {
  return events.slice(-8).map((event) => ({
    itemId: `task-event-${event.sequence}`,
    kind: "progress",
    status: "completed",
    content: event.userMessage || event.title,
  }));
}

function summaryLabel(
  running: boolean,
  stopped: boolean,
  elapsedMs: number,
  durationMs?: number,
) {
  if (running) {
    return `正在处理 ${formatDuration(elapsedMs, false)}`;
  }
  if (stopped && durationMs) {
    return `你在 ${formatDuration(durationMs)} 后停止了`;
  }
  return durationMs ? `已处理 ${formatDuration(durationMs)}` : "已处理";
}

function toolCallLabel(item: WorkLogItem, detail: string) {
  if (item.kind === "context") {
    if (item.status === "running") return "正在压缩较早的对话内容";
    if (item.status === "failed") return item.title || "上下文压缩失败";
    return item.content || item.title || "已压缩上下文";
  }
  const fileDetail = fileName(detail);
  if (item.status === "running") {
    if (item.toolName === "read_file") return `正在读取 ${fileDetail}`;
    if (item.toolName === "write_file" || item.toolName === "apply_patch") {
      return `正在编辑 ${fileDetail}`;
    }
    if (item.toolName === "list_files" || item.toolName === "search_in_file") {
      return `正在搜索 ${detail}`;
    }
    return `正在运行 ${detail}`;
  }
  if (item.status === "failed") return `运行失败 ${fileDetail}`;
  if (item.toolName === "read_file") return `已读取 ${fileDetail}`;
  if (item.toolName === "write_file" || item.toolName === "apply_patch") {
    return `已编辑 ${fileDetail}`;
  }
  if (item.toolName === "list_files" || item.toolName === "search_in_file") {
    return `已搜索 ${detail}`;
  }
  return item.durationMs
    ? `已在 ${formatDuration(item.durationMs)} 内运行 ${detail}`
    : `已运行 ${detail}`;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function toolIcon(toolName: string) {
  if (toolName === "read_file") return FileSearch;
  if (toolName === "write_file" || toolName === "apply_patch") return FilePenLine;
  if (toolName === "list_files") return FolderSearch;
  if (toolName === "search_in_file") return FileSearch;
  return TerminalSquare;
}

function stringArgument(item: WorkLogItem, key: string) {
  const value = item.arguments?.[key];
  return typeof value === "string" ? value : "";
}

function stringMetadata(item: WorkLogItem, key: string) {
  const value = item.metadata?.[key];
  return typeof value === "string" ? value : "";
}

function formatDuration(durationMs: number, minimumOne = true): string {
  if (durationMs < 60_000) {
    const seconds = minimumOne
      ? Math.round(durationMs / 1000)
      : Math.floor(durationMs / 1000);
    return `${minimumOne ? Math.max(1, seconds) : Math.max(0, seconds)}s`;
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = minimumOne
    ? Math.round((durationMs % 60_000) / 1000)
    : Math.floor((durationMs % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
