import type { CitationReference } from "../../../../shared/citation-contract";
import type { ChatMessage, WorkLogItem } from "../../../../shared/model-contract";

const INLINE_MARKER = /\[(\d{1,3})\]/g;
const DEFINITION = /^\[(\d{1,3})\]:\s*(<[^>]+>|\S+?)(?:\s+(?:"([^"]+)"|'([^']+)'|\(([^)]+)\)))?\s*$/gm;

export function citationsFromMessage(message?: ChatMessage): CitationReference[] {
  if (!message || message.role !== "assistant") return [];
  const numbers = inlineCitationNumbers(message.content);
  if (numbers.length === 0) return [];

  const definitions = citationDefinitions(message.content);
  const observed = observedCitations(message.workLog, message.threadMessages);
  return numbers.flatMap((number) => {
    const explicit = definitions.get(number);
    if (explicit) return [{ ...explicit, number }];
    const fallback = observed[number - 1];
    return fallback ? [{ ...fallback, number }] : [];
  });
}

export function inlineCitationNumbers(content: string): number[] {
  const withoutDefinitions = stripCitationDefinitions(content);
  const seen = new Set<number>();
  for (const match of withoutDefinitions.matchAll(INLINE_MARKER)) {
    const number = Number(match[1]);
    if (number > 0) seen.add(number);
  }
  return [...seen].sort((left, right) => left - right);
}

export function stripCitationDefinitions(content: string): string {
  return content.replace(DEFINITION, "").replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function citationTabId(reference: CitationReference): `citation:${string}` {
  return `citation:${reference.kind}-${stableCitationHash(citationKey(reference))}`;
}

export function citationKey(reference: CitationReference): string {
  if (reference.kind === "web") return `web:${reference.url ?? reference.label}`;
  if (reference.kind === "file") return `file:${reference.path ?? reference.label}`;
  if (reference.kind === "attachment") {
    return `attachment:${reference.attachmentId ?? reference.label}`;
  }
  return `artifact:${reference.artifactId ?? reference.label}`;
}

function citationDefinitions(content: string): Map<number, CitationReference> {
  const definitions = new Map<number, CitationReference>();
  for (const match of content.matchAll(DEFINITION)) {
    const number = Number(match[1]);
    const target = unwrapTarget(match[2] ?? "");
    const label = (match[3] ?? match[4] ?? match[5])?.trim();
    const reference = referenceFromTarget(number, target, label);
    if (reference) definitions.set(number, reference);
  }
  return definitions;
}

function referenceFromTarget(
  number: number,
  target: string,
  explicitLabel?: string,
): CitationReference | undefined {
  if (/^https?:\/\//i.test(target)) {
    try {
      const url = new URL(target);
      return {
        number,
        kind: "web",
        label: explicitLabel || url.hostname,
        host: url.hostname,
        url: url.toString(),
      };
    } catch {
      return undefined;
    }
  }
  if (target.startsWith("lumora-file:")) {
    const locator = localLocator(target.slice("lumora-file:".length), "line");
    if (!locator.value) return undefined;
    return {
      number,
      kind: "file",
      label: explicitLabel || fileName(locator.value),
      path: locator.value,
      startLine: locator.start,
      endLine: locator.end,
    };
  }
  if (target.startsWith("lumora-attachment:")) {
    const locator = localLocator(
      target.slice("lumora-attachment:".length),
      "page",
    );
    if (!locator.value) return undefined;
    return {
      number,
      kind: "attachment",
      label: explicitLabel || "附件",
      attachmentId: locator.value,
      startPage: locator.start,
      endPage: locator.end,
    };
  }
  if (target.startsWith("lumora-artifact:")) {
    const artifactId = decodeSafe(target.slice("lumora-artifact:".length));
    if (!artifactId) return undefined;
    return {
      number,
      kind: "artifact",
      label: explicitLabel || "运行结果",
      artifactId,
    };
  }
  return undefined;
}

function observedCitations(
  workLog?: WorkLogItem[],
  threadMessages?: ChatMessage[],
): CitationReference[] {
  const items = [
    ...(workLog ?? []),
    ...(threadMessages ?? []).flatMap((message) => message.workLog ?? []),
  ];
  const references: CitationReference[] = [];
  const seen = new Set<string>();
  const append = (reference: CitationReference) => {
    const key = citationKey(reference);
    if (seen.has(key)) return;
    seen.add(key);
    references.push({ ...reference, number: references.length + 1 });
  };

  for (const item of items) {
    if (item.status !== "completed") continue;
    for (const source of webSources(item)) append(source);

    const toolName = item.toolName?.toLowerCase() ?? "";
    const metadata = item.metadata ?? {};
    if (toolName === "read_file" || toolName === "search_in_file") {
      const path = stringValue(metadata.path) || stringValue(item.arguments?.path);
      if (!path) continue;
      append({
        number: 0,
        kind: "file",
        label: fileName(path),
        path,
        startLine: positiveInteger(metadata.startLine),
        endLine: positiveInteger(metadata.endLine),
      });
    } else if (toolName === "read_pdf" || toolName === "search_pdf") {
      const attachmentId = stringValue(metadata.attachmentId)
        || stringValue(item.arguments?.attachmentId);
      if (!attachmentId) continue;
      append({
        number: 0,
        kind: "attachment",
        label: stringValue(metadata.name) || "PDF 附件",
        attachmentId,
        startPage: positiveInteger(metadata.startPage),
        endPage: positiveInteger(metadata.endPage),
      });
    } else if (toolName === "artifact_read" || toolName === "artifact_search") {
      const artifactId = stringValue(metadata.artifactId)
        || stringValue(item.arguments?.artifactId);
      if (!artifactId) continue;
      append({
        number: 0,
        kind: "artifact",
        label: "运行结果",
        artifactId,
      });
    }
  }
  return references;
}

function webSources(item: WorkLogItem): CitationReference[] {
  const raw = item.metadata?.sources;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const source = candidate as Record<string, unknown>;
    const value = stringValue(source.url);
    if (!/^https?:\/\//i.test(value)) return [];
    try {
      const url = new URL(value);
      return [{
        number: 0,
        kind: "web" as const,
        label: stringValue(source.title) || url.hostname,
        host: url.hostname,
        url: url.toString(),
      }];
    } catch {
      return [];
    }
  });
}

function localLocator(
  raw: string,
  unit: "line" | "page",
): { value: string; start?: number; end?: number } {
  const [encodedValue, fragment = ""] = raw.split("#", 2);
  const value = decodeSafe(encodedValue ?? "").trim();
  const pattern = unit === "line"
    ? /^(?:L|line=)(\d+)(?:-(?:L)?(\d+))?$/i
    : /^(?:P|page=)(\d+)(?:-(?:P)?(\d+))?$/i;
  const match = fragment.match(pattern);
  return {
    value,
    start: match ? Number(match[1]) : undefined,
    end: match?.[2] ? Number(match[2]) : undefined,
  };
}

function unwrapTarget(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("<") && trimmed.endsWith(">")
    ? trimmed.slice(1, -1)
    : trimmed;
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function fileName(value: string): string {
  return value.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) || value;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown): number | undefined {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}

function stableCitationHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(36);
}
