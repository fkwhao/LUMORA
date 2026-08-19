import type {
  ChatMessage,
  WorkLogItem,
} from "../../../../shared/model-contract";
import type { SubagentSession } from "../components/SubagentSessionPane";

export function subagentSessionsFromMessages(
  messages: ChatMessage[],
): Map<string, SubagentSession> {
  const sessions = new Map<string, SubagentSession>();
  for (const message of messages) {
    for (const item of message.workLog ?? []) {
      if (item.kind !== "agent") continue;
      const agentId = stringMetadata(item, "agentId");
      if (!agentId) continue;
      const current = sessions.get(agentId) ?? {
        agentId,
        sessionId: stringMetadata(item, "sessionId"),
        parentAgentId: stringMetadata(item, "parentAgentId"),
        delegationDepth: numberMetadata(item, "delegationDepth") ?? 1,
        label: stringMetadata(item, "agentLabel") || item.title || "子 Agent",
        status: "running",
        model: item.model || "",
        createdAt: message.createdAt,
        answer: "",
        events: [],
        children: [],
        pendingInboxCount: 0,
      };
      const childEventType = stringMetadata(item, "childEventType");
      current.createdAt = message.createdAt || current.createdAt;
      if (childEventType) {
        current.events.push(item);
      } else {
        const sessionEventType = stringMetadata(item, "sessionEventType");
        const agentStatus = stringMetadata(item, "agentStatus");
        current.sessionId = stringMetadata(item, "sessionId") || current.sessionId;
        current.parentAgentId =
          stringMetadata(item, "parentAgentId") || current.parentAgentId;
        current.label =
          stringMetadata(item, "agentLabel") || item.title || current.label;
        current.status = workLogStatus(agentStatus, item.status);
        current.mode = sessionMode(item) || current.mode;
        current.activationStatus = agentStatus || current.activationStatus;
        current.durationMs = item.durationMs ?? current.durationMs;
        if (
          sessionEventType === "agent_reported" ||
          sessionEventType === "agent_completed" ||
          sessionEventType === "agent_failed" ||
          !sessionEventType
        ) {
          current.answer = item.output || current.answer;
        }
        current.model = item.model || current.model;
        current.delegationDepth =
          numberMetadata(item, "delegationDepth") ?? current.delegationDepth;
        current.promptTokens =
          numberMetadata(item, "promptTokens") ?? current.promptTokens;
        current.completionTokens =
          numberMetadata(item, "completionTokens") ?? current.completionTokens;
        current.totalTokens =
          numberMetadata(item, "totalTokens") ?? current.totalTokens;
        current.activeContextTokens =
          numberMetadata(item, "activeContextTokens") ??
          current.activeContextTokens;
        const inboxSequence = numberMetadata(item, "inboxSequence");
        const consumedInboxSequence = numberMetadata(
          item,
          "consumedInboxSequence",
        );
        if (inboxSequence !== undefined) {
          current.lastInboxSequence = Math.max(
            current.lastInboxSequence ?? 0,
            inboxSequence,
          );
        }
        if (consumedInboxSequence !== undefined) {
          current.consumedInboxSequence = Math.max(
            current.consumedInboxSequence ?? 0,
            consumedInboxSequence,
          );
        }
        current.pendingInboxCount = Math.max(
          0,
          (current.lastInboxSequence ?? 0) -
            (current.consumedInboxSequence ?? 0),
        );
        current.checkpointSequence =
          numberMetadata(item, "checkpointSequence") ??
          current.checkpointSequence;
        current.unreadReportCount =
          numberMetadata(item, "unreadReportCount") ??
          current.unreadReportCount;
        const recovered = optionalBooleanMetadata(item, "recovered");
        if (recovered !== undefined) current.recovered = recovered;
      }
      sessions.set(agentId, current);
    }
  }
  for (const session of sessions.values()) {
    session.children = [];
    session.events.sort(
      (left, right) =>
        (numberMetadata(left, "childSequence") ?? 0) -
        (numberMetadata(right, "childSequence") ?? 0),
    );
  }
  for (const session of sessions.values()) {
    const parent = sessions.get(session.parentAgentId);
    if (!parent) continue;
    session.parent = { agentId: parent.agentId, label: parent.label };
    parent.children.push(session);
  }
  return sessions;
}

function sessionMode(
  item: WorkLogItem,
): "one_shot" | "continuable" | undefined {
  const mode = stringMetadata(item, "sessionMode");
  return mode === "one_shot" || mode === "continuable" ? mode : undefined;
}

function workLogStatus(
  agentStatus: string,
  fallback: WorkLogItem["status"],
): WorkLogItem["status"] {
  if (agentStatus === "running") return "running";
  if (agentStatus === "failed") return "failed";
  if (agentStatus) return "completed";
  return fallback;
}

function optionalBooleanMetadata(
  item: WorkLogItem,
  key: string,
): boolean | undefined {
  const value = item.metadata?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function stringMetadata(item: WorkLogItem, key: string): string {
  const value = item.metadata?.[key];
  return typeof value === "string" ? value : "";
}

function numberMetadata(
  item: WorkLogItem,
  key: string,
): number | undefined {
  const value = item.metadata?.[key];
  return typeof value === "number" ? value : undefined;
}
