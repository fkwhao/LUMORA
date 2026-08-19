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
      };
      const childEventType = stringMetadata(item, "childEventType");
      current.createdAt = message.createdAt || current.createdAt;
      if (childEventType) {
        current.events.push(item);
      } else {
        current.sessionId = stringMetadata(item, "sessionId") || current.sessionId;
        current.parentAgentId =
          stringMetadata(item, "parentAgentId") || current.parentAgentId;
        current.label =
          stringMetadata(item, "agentLabel") || item.title || current.label;
        current.status = item.status;
        current.durationMs = item.durationMs;
        current.answer = item.output || current.answer;
        current.model = item.model || current.model;
        current.delegationDepth =
          numberMetadata(item, "delegationDepth") ?? current.delegationDepth;
        current.promptTokens = numberMetadata(item, "promptTokens");
        current.completionTokens = numberMetadata(item, "completionTokens");
        current.totalTokens = numberMetadata(item, "totalTokens");
        current.activeContextTokens = numberMetadata(
          item,
          "activeContextTokens",
        );
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
