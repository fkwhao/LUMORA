import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  FilePenLine,
  FileSearch,
  FolderSearch,
  Minimize2,
  PackageOpen,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";

import type { WorkLogItem } from "../../../../shared/model-contract";
import type { TaskEvent } from "../../../../shared/task-contract";
import { isPlanWorkLogItem } from "../../../../shared/execution-plan";
import { ProcessingLattice } from "./ProcessingLattice";
import { WebSearch } from "./WebSearch";

interface AgentRunSummaryProps {
  startedAt?: number;
  durationMs?: number;
  events?: TaskEvent[];
  workLog?: WorkLogItem[];
  answerStarted?: boolean;
  running: boolean;
  stopped?: boolean;
  onReviewChange?(item: WorkLogItem): void;
  onOpenArtifact?(artifactId: string): void;
  onOpenAgent?(agentId: string): void;
}

interface WorkPhase {
  phaseId: string;
  title: string;
  items: WorkLogItem[];
}

interface LiveClock {
  now: number;
  fallbackStartedAt: number;
}

/** 展示公开的进度说明和真实工具事件，不渲染模型隐藏推理。 */
export const AgentRunSummary = memo(function AgentRunSummary({
  startedAt,
  durationMs,
  events = [],
  workLog = [],
  answerStarted = false,
  running,
  stopped = false,
  onReviewChange,
  onOpenArtifact,
  onOpenAgent,
}: AgentRunSummaryProps) {
  const [expanded, setExpanded] = useState(running && !answerStarted);
  const [liveClock, setLiveClock] = useState<LiveClock>(() => {
    const now = Date.now();
    return { now, fallbackStartedAt: now };
  });
  const elapsedMs = running
    ? Math.max(
        0,
        liveClock.now - (startedAt ?? liveClock.fallbackStartedAt),
      )
    : durationMs ?? 0;
  const phases = useMemo(
    () => buildWorkPhases(workLog.length > 0 ? workLog : taskEventsAsWorkLog(events)),
    [events, workLog],
  );
  const hasDetails = phases.length > 0;
  const label = summaryLabel(running, stopped, elapsedMs, durationMs);

  useLayoutEffect(() => {
    if (!running) return;
    const fallbackStartedAt = Date.now();
    const updateClock = () => {
      setLiveClock({ now: Date.now(), fallbackStartedAt });
    };
    updateClock();
    const timer = window.setInterval(updateClock, 500);
    return () => window.clearInterval(timer);
  }, [running, startedAt]);

  useLayoutEffect(() => {
    // Keep the live work log mounted for the entire run. Hosted-search
    // protocols can emit a provisional text item and then continue searching;
    // treating that text as a committed answer used to collapse the work log
    // for a moment and made the whole processing area appear to refresh.
    if (running) {
      setExpanded(true);
    } else if (answerStarted) {
      setExpanded(false);
    }
  }, [answerStarted, running]);

  const interactive = !running && hasDetails;
  const activate = () => {
    if (interactive) {
      setExpanded((current) => !current);
    }
  };

  return (
    <section className={`agent-run${expanded ? " expanded" : ""}`}>
      <div className="agent-run-heading">
        <div
          aria-expanded={interactive ? expanded : undefined}
          aria-label={running ? label : undefined}
          className={`agent-run-toggle${running ? " is-running" : ""}${interactive ? "" : " is-static"}`}
          onClick={activate}
          onKeyDown={(event) => {
            if (
              interactive &&
              (event.key === "Enter" || event.key === " ")
            ) {
              event.preventDefault();
              activate();
            }
          }}
          role={running ? "status" : interactive ? "button" : undefined}
          tabIndex={interactive ? 0 : undefined}
        >
          {running && <ProcessingLattice />}
          <span>{label}</span>
          {interactive && (
            <ChevronRight className="agent-run-chevron" size={15} />
          )}
        </div>
      </div>
      {hasDetails && <div className="agent-run-events" aria-hidden={!expanded}>
        <div className="agent-run-events-inner">
          {phases.map((phase, index) => (
            <WorkPhaseEntry
              active={running && index === phases.length - 1}
              key={phase.phaseId}
              onReviewChange={onReviewChange}
              onOpenArtifact={onOpenArtifact}
              onOpenAgent={onOpenAgent}
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
  onOpenAgent,
}: {
  phase: WorkPhase;
  active: boolean;
  onReviewChange?: (item: WorkLogItem) => void;
  onOpenArtifact?: (artifactId: string) => void;
  onOpenAgent?: (agentId: string) => void;
}) {
  const running = active || phase.items.some((item) => item.status === "running");

  return (
    <section className="work-phase expanded">
      <div
        className={`work-phase-toggle is-static${running ? " shimmer-text" : ""}`}
      >
        <span>{phase.title}</span>
      </div>
      {phase.items.length > 0 && (
        <div className="work-phase-steps">
          <div className="work-phase-steps-inner">
            <ToolGroupEntry
              items={phase.items}
              onReviewChange={onReviewChange}
              onOpenArtifact={onOpenArtifact}
              onOpenAgent={onOpenAgent}
              running={running}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function ToolGroupEntry({
  items,
  running,
  onReviewChange,
  onOpenArtifact,
  onOpenAgent,
}: {
  items: WorkLogItem[];
  running: boolean;
  onReviewChange?: (item: WorkLogItem) => void;
  onOpenArtifact?: (artifactId: string) => void;
  onOpenAgent?: (agentId: string) => void;
}) {
  const searchOnly = items.length > 0 && items.every(
    (item) => item.kind === "search",
  );
  const hasAgent = items.some((item) => item.kind === "agent");
  const [expanded, setExpanded] = useState(
    running && (searchOnly || hasAgent),
  );

  useEffect(() => {
    if (running && (searchOnly || hasAgent)) setExpanded(true);
  }, [hasAgent, running, searchOnly]);

  return (
    <section className={`tool-group${expanded ? " expanded" : ""}`}>
      <button
        aria-expanded={expanded}
        className={`tool-group-toggle${running ? " shimmer-text" : ""}`}
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        {expanded ? (
          <ChevronDown className="tool-group-chevron" size={13} />
        ) : (
          <ChevronRight className="tool-group-chevron" size={13} />
        )}
        <span>{toolGroupLabel(items)}</span>
      </button>
      <div className="tool-call-list" aria-hidden={!expanded}>
        <div className="tool-call-list-inner">
          {items.map((item) => item.kind === "search" ? (
            <WebSearch item={item} key={item.itemId} />
          ) : item.kind === "agent" ? (
            <AgentCallItem
              item={item}
              key={item.itemId}
              onOpenAgent={onOpenAgent}
            />
          ) : (
            <ToolCallItem
              item={item}
              key={item.itemId}
              onReviewChange={onReviewChange}
              onOpenArtifact={onOpenArtifact}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function AgentCallItem({
  item,
  onOpenAgent,
}: {
  item: WorkLogItem;
  onOpenAgent?: (agentId: string) => void;
}) {
  const agentId = stringMetadata(item, "agentId");
  const label = stringMetadata(item, "agentLabel") || item.title || "子 Agent";
  const statusLabel = item.status === "running"
    ? "执行中"
    : item.status === "failed"
      ? "执行失败"
      : item.durationMs
        ? formatDuration(item.durationMs)
        : "已完成";

  return (
    <article className="agent-call-item" data-status={item.status}>
      <button
        type="button"
        disabled={!agentId || !onOpenAgent}
        onClick={() => agentId && onOpenAgent?.(agentId)}
        aria-label={`查看 ${label} 的执行过程`}
      >
        <span className="agent-call-avatar" aria-hidden="true">
          <Bot size={14} />
        </span>
        <span className={item.status === "running" ? "shimmer-text" : ""}>
          <strong>{label}</strong>
          <small>{statusLabel}</small>
        </span>
        <ChevronRight size={13} />
      </button>
    </article>
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
  const reviewRisk = stringMetadata(item, "approvalReviewRiskLevel");
  const Icon =
    item.kind === "context"
      ? Minimize2
      : item.kind === "approval"
        ? ShieldCheck
        : toolIcon(item.toolName ?? "");

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
      data-kind={item.kind}
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
              <span>
                {item.kind === "approval"
                  ? "审批结果"
                  : item.status === "failed"
                    ? "错误输出"
                    : "执行结果"}
              </span>
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
            {reviewRisk && <span>风险 {reviewRisk}</span>}
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
    if (isPlanWorkLogItem(item)) continue;
    if (item.toolName === "delegate_task") continue;
    if (item.kind === "agent" && stringMetadata(item, "childEventType")) {
      continue;
    }
    if (
      item.kind === "agent" &&
      stringMetadata(item, "parentAgentId") &&
      stringMetadata(item, "parentAgentId") !== "supervisor"
    ) {
      continue;
    }
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
  const activeTitle = normalized
    .replace(/^(我会先|我先|接下来我会|接下来)[，,：:]?\s*/, "正在")
    .replace(/[。！？!?]$/, "");
  return activeTitle;
}

function fallbackPhaseTitle(item: WorkLogItem): string {
  if (item.kind === "agent") return "正在协同子 Agent";
  if (item.kind === "search") return "正在搜索网络资料";
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
  if (item.kind === "approval") {
    const decision = stringMetadata(item, "approvalReviewDecision");
    if (item.status === "running") return `审批智能体正在审批 ${detail}`;
    if (decision === "deny") return `智能审批未通过，本次未执行 ${detail}`;
    if (decision === "require_human") {
      return booleanMetadata(item, "approvalReviewFallback")
        ? `智能审批暂不可用，本次未执行 ${detail}`
        : `智能审批未通过，本次未执行 ${detail}`;
    }
    return `智能审批已通过 ${detail}`;
  }
  const fileDetail = fileName(detail);
  const failureKind = stringMetadata(item, "failureKind");
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
  if (failureKind === "human_approval_denied") {
    return `人工审批未通过 ${fileDetail}`;
  }
  if (failureKind === "permission_denied") {
    return `权限规则已拒绝 ${fileDetail}`;
  }
  if (failureKind === "automatic_approval_blocked") {
    return `替我审批未通过 ${fileDetail}`;
  }
  if (failureKind === "approval_retry_blocked") {
    return `已跳过重复调用 ${fileDetail}`;
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

function toolGroupLabel(items: WorkLogItem[]): string {
  const actionable = items.filter(
    (item) =>
      item.kind === "tool" ||
      item.kind === "approval" ||
      item.kind === "search" ||
      item.kind === "agent",
  );
  const commands = actionable
    .map((item) => stringArgument(item, "command"))
    .filter(Boolean);
  const pathItems = actionable.filter((item) => stringArgument(item, "path"));
  const toolNames = new Set(actionable.map((item) => item.toolName));

  if (actionable.some((item) => item.kind === "agent")) {
    return actionable.length > 1 ? "协同多个 Agent" : "协同 Agent";
  }

  if (actionable.length > 0 && actionable.every((item) => item.kind === "search")) {
    return "搜索网络资料";
  }

  if (toolNames.has("write_file") || toolNames.has("apply_patch")) {
    const onlyTestFiles =
      pathItems.length > 0 && pathItems.every((item) => isTestFilePath(item));
    return onlyTestFiles ? "更新相关测试" : "更新相关文件";
  }
  if (commands.some((command) => /\bgit\s+push\b/i.test(command))) {
    return "提交当前分支";
  }
  if (
    commands.some((command) =>
      /(?:\bpytest\b|\bvitest\b|\bjest\b|\bmvn\s+test\b|\bgradle\s+test\b|\bcargo\s+test\b|\bgo\s+test\b|\bdotnet\s+test\b)/i.test(
        command,
      ),
    )
  ) {
    return "运行相关测试";
  }
  if (
    commands.some((command) =>
      /(?:\btypecheck\b|\blint\b|\bbuild\b|\bcompile\b)/i.test(command),
    )
  ) {
    return "验证更新结果";
  }
  if (
    commands.some((command) =>
      /(?:\bnpm\s+(?:i|install)\b|\bpnpm\s+(?:i|install|add)\b|\byarn\s+add\b|\bpip\s+install\b)/i.test(
        command,
      ),
    )
  ) {
    return "安装项目依赖";
  }
  if (
    toolNames.has("read_file") ||
    toolNames.has("list_files") ||
    toolNames.has("search_in_file")
  ) {
    return "检查相关文件";
  }
  if (items.every((item) => item.kind === "context")) {
    return "整理上下文";
  }
  return commands.length > 0 ? "执行相关命令" : "执行相关工具";
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

function booleanMetadata(item: WorkLogItem, key: string) {
  return item.metadata?.[key] === true;
}

function isTestFilePath(item: WorkLogItem): boolean {
  const rawPath = stringArgument(item, "path").replace(/\\/g, "/");
  const workspace = stringMetadata(item, "workspacePath")
    .replace(/\\/g, "/")
    .replace(/\/$/, "");
  const path =
    workspace && rawPath.toLocaleLowerCase().startsWith(`${workspace.toLocaleLowerCase()}/`)
      ? rawPath.slice(workspace.length + 1)
      : rawPath;
  return (
    /(^|\/)src\/test(s)?(\/|$)/i.test(path) ||
    /(^|\/)(__tests__|tests)(\/|$)/i.test(path) ||
    (!/^[a-z]:\//i.test(path) && /^test\//i.test(path)) ||
    /(^|\/)(test_[^/]+|[^/]+\.(test|spec)\.[^/]+|[^/]+_test\.[^/]+)$/i.test(path)
  );
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
