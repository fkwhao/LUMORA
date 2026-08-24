import type {
  ChatMessage,
  WorkLogItem,
  WorkLogItemStatus,
} from "../../../../shared/model-contract";
import type {
  SubagentActivation,
  SubagentActivationInput,
  SubagentSession,
} from "../components/SubagentSessionPane";

interface MutableSession extends SubagentSession {
  activationIndex: Map<string, SubagentActivation>;
  inboxInputs: Map<number, SubagentActivationInput>;
  peerMessageIndex: Map<string, WorkLogItem>;
  lastActivationId?: string;
}

/** Project the durable public event stream into independent Agent conversations. */
export function subagentSessionsFromMessages(
  messages: ChatMessage[],
): Map<string, SubagentSession> {
  const sessions = new Map<string, MutableSession>();

  for (const message of messages) {
    for (const item of message.workLog ?? []) {
      if (item.kind === "message") {
        projectPeerMessage(sessions, item, message.createdAt);
        continue;
      }
      if (item.kind !== "agent") continue;
      const agentId = stringMetadata(item, "agentId");
      if (!agentId) continue;
      const current = ensureSession(sessions, agentId, item, message.createdAt);
      const childEventType = stringMetadata(item, "childEventType");
      if (childEventType) {
        const activation = ensureActivation(
          current,
          stringMetadata(item, "activationId") || current.lastActivationId,
          message.createdAt,
        );
        upsertEvent(activation.events, unwrapChildEvent(item, childEventType));
        continue;
      }

      projectSessionEvent(current, item, message.createdAt);
    }
  }

  for (const session of sessions.values()) {
    session.children = [];
    session.activations.sort(compareActivations);
    for (const activation of session.activations) {
      activation.events.sort(
        (left, right) =>
          (numberMetadata(left, "childSequence") ?? 0) -
          (numberMetadata(right, "childSequence") ?? 0),
      );
      activation.inputs.sort((left, right) => left.sequence - right.sequence);
    }
    const consumedPeerIds = new Set(
      session.activations.flatMap((activation) =>
        activation.events
          .filter((item) =>
            item.kind === "message" &&
            stringMetadata(item, "messageStatus") === "consumed",
          )
          .map((item) => item.itemId),
      ),
    );
    session.pendingPeerMessages = [...session.peerMessageIndex.values()]
      .filter((item) => !consumedPeerIds.has(item.itemId))
      .sort((left, right) =>
        (numberMetadata(left, "inboxSequence") ?? 0) -
        (numberMetadata(right, "inboxSequence") ?? 0),
      );
    session.totalTokens = sumDefined(
      session.activations.map((activation) => activation.totalTokens),
    );
    session.promptTokens = sumDefined(
      session.activations.map((activation) => activation.promptTokens),
    );
    session.completionTokens = sumDefined(
      session.activations.map((activation) => activation.completionTokens),
    );
    session.durationMs = sumDefined(
      session.activations.map((activation) => activation.durationMs),
    );
  }

  for (const session of sessions.values()) {
    const parent = sessions.get(session.parentAgentId);
    if (!parent) continue;
    session.parent = { agentId: parent.agentId, label: parent.label };
    parent.children.push(session);
  }
  return new Map(sessions);
}

function ensureSession(
  sessions: Map<string, MutableSession>,
  agentId: string,
  item: WorkLogItem,
  createdAt?: string,
): MutableSession {
  const existing = sessions.get(agentId);
  if (existing) return existing;
  const created: MutableSession = {
    agentId,
    sessionId: stringMetadata(item, "sessionId"),
    parentAgentId: stringMetadata(item, "parentAgentId"),
    teamId: stringMetadata(item, "teamId"),
    delegationDepth: numberMetadata(item, "delegationDepth") ?? 1,
    label: stringMetadata(item, "agentLabel") || item.title || "子 Agent",
    status: "running",
    model: item.model || "",
    createdAt,
    activations: [],
    pendingPeerMessages: [],
    children: [],
    pendingInboxCount: 0,
    activationIndex: new Map(),
    inboxInputs: new Map(),
    peerMessageIndex: new Map(),
  };
  sessions.set(agentId, created);
  return created;
}

function projectSessionEvent(
  session: MutableSession,
  item: WorkLogItem,
  createdAt?: string,
): void {
  const recordedEventType = stringMetadata(item, "sessionEventType");
  const eventType = recordedEventType || (
    item.status === "running"
      ? "agent_started"
      : item.status === "failed"
        ? "agent_failed"
        : "agent_completed"
  );
  const agentStatus = stringMetadata(item, "agentStatus");
  const activationId = stringMetadata(item, "activationId");
  session.sessionId = stringMetadata(item, "sessionId") || session.sessionId;
  session.parentAgentId =
    stringMetadata(item, "parentAgentId") || session.parentAgentId;
  session.teamId = stringMetadata(item, "teamId") || session.teamId;
  session.label = stringMetadata(item, "agentLabel") || item.title || session.label;
  session.model = item.model || session.model;
  session.mode = sessionMode(item) || session.mode || "one_shot";
  session.delegationDepth =
    numberMetadata(item, "delegationDepth") ?? session.delegationDepth;
  session.status = workLogStatus(agentStatus, item.status);

  const inboxSequence = numberMetadata(item, "inboxSequence");
  if (eventType === "agent_inbox_enqueued" && inboxSequence !== undefined) {
    session.inboxInputs.set(inboxSequence, {
      messageId: item.itemId,
      sequence: inboxSequence,
      senderAgentId: stringMetadata(item, "senderAgentId"),
      senderLabel: stringMetadata(item, "senderAgentLabel"),
      kind: stringMetadata(item, "messageKind") === "peer" ? "peer" : "task",
      content: item.content || "",
    });
  }

  const consumedInboxSequence = numberMetadata(item, "consumedInboxSequence");
  if (eventType === "agent_activation_started" && activationId) {
    const activation = ensureActivation(session, activationId, createdAt);
    activation.status = "running";
    activation.activationStatus = "running";
    const previousConsumed = session.consumedInboxSequence ?? 0;
    const through = consumedInboxSequence ?? previousConsumed;
    const inboxInputs = [...session.inboxInputs.values()].filter(
      (input) => input.sequence > previousConsumed && input.sequence <= through,
    );
    activation.inputs = mergeActivationInputs(activation.inputs, inboxInputs);
    session.consumedInboxSequence = Math.max(previousConsumed, through);
    session.lastActivationId = activationId;
  }

  if ((activationId || !recordedEventType) && (
    eventType === "agent_started" ||
    eventType === "agent_reported" ||
    eventType === "agent_completed" ||
    eventType === "agent_failed" ||
    eventType === "agent_activation_interrupted"
  )) {
    const resolvedActivationId = activationId
      || session.lastActivationId
      || `${session.agentId}:activation:1`;
    const activation = ensureActivation(session, resolvedActivationId, createdAt);
    session.lastActivationId = resolvedActivationId;
    const activationInput = stringMetadata(item, "activationInput");
    if (activationInput && activation.inputs.length === 0) {
      activation.inputs.push({
        messageId: `${resolvedActivationId}:input`,
        sequence: 1,
        senderAgentId: session.parentAgentId || "supervisor",
        senderLabel: "",
        kind: "task",
        content: activationInput,
      });
    }
    if (eventType === "agent_started") {
      activation.status = "running";
      activation.activationStatus = "running";
    } else if (eventType === "agent_failed") {
      activation.status = "failed";
      activation.activationStatus = "failed";
      activation.answer = item.output || item.errorMessage || activation.answer;
    } else if (eventType === "agent_activation_interrupted") {
      activation.status = "completed";
      activation.activationStatus = "interrupted";
      activation.answer = item.output || activation.answer;
    } else if (eventType === "agent_completed") {
      activation.status = "completed";
      activation.activationStatus =
        stringMetadata(item, "activationStatus") || "completed";
      activation.answer = item.output || activation.answer;
    } else if (eventType === "agent_reported") {
      activation.answer = item.output || activation.answer;
    }
    activation.durationMs = item.durationMs ?? activation.durationMs;
    activation.promptTokens =
      numberMetadata(item, "promptTokens") ?? activation.promptTokens;
    activation.completionTokens =
      numberMetadata(item, "completionTokens") ?? activation.completionTokens;
    activation.totalTokens =
      numberMetadata(item, "totalTokens") ?? activation.totalTokens;
    activation.activeContextTokens =
      numberMetadata(item, "activeContextTokens") ?? activation.activeContextTokens;
  }

  if (inboxSequence !== undefined) {
    session.lastInboxSequence = Math.max(session.lastInboxSequence ?? 0, inboxSequence);
  }
  if (consumedInboxSequence !== undefined) {
    session.consumedInboxSequence = Math.max(
      session.consumedInboxSequence ?? 0,
      consumedInboxSequence,
    );
  }
  session.pendingInboxCount = Math.max(
    0,
    (session.lastInboxSequence ?? 0) - (session.consumedInboxSequence ?? 0),
  );
  session.checkpointSequence =
    numberMetadata(item, "checkpointSequence") ?? session.checkpointSequence;
  session.unreadReportCount =
    numberMetadata(item, "unreadReportCount") ?? session.unreadReportCount;
  const recovered = optionalBooleanMetadata(item, "recovered");
  if (recovered !== undefined) session.recovered = recovered;
}

function projectPeerMessage(
  sessions: Map<string, MutableSession>,
  item: WorkLogItem,
  createdAt?: string,
): void {
  const targetAgentId = stringMetadata(item, "targetAgentId")
    || stringMetadata(item, "agentId");
  if (!targetAgentId) return;
  const session = ensureSession(sessions, targetAgentId, item, createdAt);
  const existing = session.peerMessageIndex.get(item.itemId);
  const next = existing ? { ...existing, ...item, metadata: item.metadata } : item;
  session.peerMessageIndex.set(item.itemId, next);
  const inboxSequence = numberMetadata(item, "inboxSequence");
  if (inboxSequence !== undefined) {
    session.lastInboxSequence = Math.max(
      session.lastInboxSequence ?? 0,
      inboxSequence,
    );
  }
  const activationId = stringMetadata(item, "activationId");
  if (activationId && stringMetadata(item, "messageStatus") === "consumed") {
    const activation = ensureActivation(session, activationId, createdAt);
    const peerInput: SubagentActivationInput = {
      messageId: item.itemId,
      sequence: inboxSequence ?? 0,
      senderAgentId: stringMetadata(item, "senderAgentId"),
      senderLabel: stringMetadata(item, "senderAgentLabel"),
      kind: "peer",
      content: item.content || "",
    };
    activation.inputs = mergeActivationInputs(activation.inputs, [peerInput]);
    upsertEvent(activation.events, next);
  }
  session.pendingInboxCount = Math.max(
    0,
    (session.lastInboxSequence ?? 0) - (session.consumedInboxSequence ?? 0),
  );
}

function ensureActivation(
  session: MutableSession,
  requestedId: string | undefined,
  createdAt?: string,
): SubagentActivation {
  const activationId = requestedId || `${session.agentId}:activation:1`;
  const existing = session.activationIndex.get(activationId);
  if (existing) return existing;
  const activation: SubagentActivation = {
    activationId,
    status: "running",
    activationStatus: "running",
    createdAt,
    inputs: [],
    events: [],
    answer: "",
  };
  session.activationIndex.set(activationId, activation);
  session.activations.push(activation);
  return activation;
}

function unwrapChildEvent(item: WorkLogItem, childType: string): WorkLogItem {
  const metadata = { ...(item.metadata ?? {}) };
  delete metadata.childEventType;
  const kind: WorkLogItem["kind"] = childType === "progress_message"
    ? "progress"
    : childType.startsWith("web_search")
      ? "search"
      : childType.startsWith("context_compaction")
        ? "context"
        : childType.startsWith("approval_review")
          ? "approval"
          : "tool";
  return { ...item, kind, metadata };
}

function upsertEvent(events: WorkLogItem[], item: WorkLogItem): void {
  const existing = events.findIndex((current) => current.itemId === item.itemId);
  if (existing >= 0) events[existing] = item;
  else events.push(item);
}

function mergeActivationInputs(
  current: SubagentActivationInput[],
  incoming: SubagentActivationInput[],
): SubagentActivationInput[] {
  const byMessageId = new Map(
    current.map((input) => [input.messageId, input] as const),
  );
  for (const input of incoming) byMessageId.set(input.messageId, input);
  return [...byMessageId.values()].sort(
    (left, right) => left.sequence - right.sequence,
  );
}

function sessionMode(
  item: WorkLogItem,
): "one_shot" | "continuable" | undefined {
  const mode = stringMetadata(item, "sessionMode");
  return mode === "one_shot" || mode === "continuable" ? mode : undefined;
}

function workLogStatus(
  agentStatus: string,
  fallback: WorkLogItemStatus,
): WorkLogItemStatus {
  if (agentStatus === "running") return "running";
  if (agentStatus === "failed") return "failed";
  if (agentStatus) return "completed";
  return fallback;
}

function compareActivations(left: SubagentActivation, right: SubagentActivation): number {
  const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
  const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
  return leftTime - rightTime;
}

function sumDefined(values: Array<number | undefined>): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined);
  return defined.length > 0 ? defined.reduce((sum, value) => sum + value, 0) : undefined;
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
