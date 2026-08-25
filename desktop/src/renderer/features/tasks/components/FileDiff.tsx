import hljs from "highlight.js";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";

import styles from "./FileDiff.module.css";

export interface FileDiffRow {
  old: number | null;
  cur: number | null;
  type: "ctx" | "del" | "add" | "gap";
  text: string;
}

interface FileDiffProps {
  file: string;
  rows: FileDiffRow[];
  additions: number;
  deletions: number;
  maxBodyHeight?: number;
  preview?: boolean;
  headerless?: boolean;
  parentScroll?: boolean;
  truncated?: boolean;
  truncatedMessage?: string;
  emptyMessage?: string;
  source?: boolean;
  highlightedLineRange?: {
    start: number;
    end?: number;
  };
}

export function FileDiff({
  file,
  rows,
  additions,
  deletions,
  maxBodyHeight,
  preview = false,
  headerless = false,
  parentScroll = false,
  truncated = false,
  truncatedMessage = "补丁过大，仅展示前 500,000 个字符",
  emptyMessage = "该文件没有可展示的文本补丁",
  source = false,
  highlightedLineRange,
}: FileDiffProps) {
  const filePath = splitFilePath(file);
  const syntaxLanguage = useMemo(() => languageForFile(file), [file]);
  const focusedLineRef = useRef<HTMLDivElement>(null);
  const highlightedRows = useMemo(
    () => rows.map((row) => row.type === "gap"
      ? undefined
      : highlightDiffLine(row.text || " ", syntaxLanguage)),
    [rows, syntaxLanguage],
  );
  const focusedLine = source ? highlightedLineRange?.start : undefined;
  const sourceLineDigits = useMemo(() => {
    if (!source) return 0;
    return rows.reduce((digits, row) => {
      const line = displayLineNumber(row);
      return typeof line === "number"
        ? Math.max(digits, String(line).length)
        : digits;
    }, 1);
  }, [rows, source]);
  const sourceStyle = source
    ? ({
        "--source-gutter-width": `calc(${sourceLineDigits}ch + 14px)`,
      } as CSSProperties)
    : undefined;

  useEffect(() => {
    focusedLineRef.current?.scrollIntoView?.({ block: "center" });
  }, [file, focusedLine, rows]);

  return (
    <div
      className={`${styles.diff}${preview ? ` ${styles.preview}` : ""}${
        headerless ? ` ${styles.headerless}` : ""
      }${parentScroll ? ` ${styles.parentScroll}` : ""}${
        source ? ` ${styles.source}` : ""
      }`}
      style={sourceStyle}
    >
      {!headerless && <div className={styles.diffHead}>
        <span className={styles.diffFileWrap}>
          <svg
            className={styles.diffIcon}
            viewBox="0 0 24 24"
            width="15"
            height="15"
            aria-hidden="true"
          >
            <path
              d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className={styles.diffFile} title={file}>
            {filePath.directory && (
              <span className={styles.diffDirectory}>{filePath.directory}</span>
            )}
            <span className={styles.diffName}>{filePath.name}</span>
          </span>
        </span>
        <span className={styles.diffStat} aria-label={`${additions} 行新增，${deletions} 行删除`}>
          <span className={styles.add}>+{additions}</span>
          <span className={styles.del}>-{deletions}</span>
        </span>
      </div>}
      {rows.length > 0 ? (
        <div
          className={styles.diffBody}
          data-diff-scroll-owner={parentScroll ? "parent" : "self"}
          style={maxBodyHeight === undefined ? undefined : { maxHeight: maxBodyHeight }}
        >
          <div className={styles.diffCanvas} data-diff-canvas>
            {rows.map((row, index) => {
              if (row.type === "gap") {
                return (
                  <div
                    key={`gap-${index}`}
                    className={`${styles.diffRow} ${styles.gap}`}
                  >
                    {row.text}
                  </div>
                );
              }
              const lineNumber = displayLineNumber(row);
              const highlighted = source
                && typeof lineNumber === "number"
                && highlightedLineRange !== undefined
                && lineNumber >= highlightedLineRange.start
                && lineNumber <= (
                  highlightedLineRange.end ?? highlightedLineRange.start
                );
              return (
                <div
                  key={`${row.old ?? "n"}-${row.cur ?? "n"}-${index}`}
                  className={`${styles.diffRow} ${styles[row.type]}${
                    highlighted ? ` ${styles.highlighted}` : ""
                  }`}
                  data-highlighted={highlighted || undefined}
                  data-source-line={source ? lineNumber : undefined}
                  ref={source && lineNumber === focusedLine ? focusedLineRef : undefined}
                >
                  <span
                    className={styles.ln}
                    title={source
                      ? `第 ${lineNumber} 行`
                      : row.type === "del"
                        ? `原第 ${row.old} 行`
                        : `新第 ${row.cur ?? row.old} 行`}
                  >
                    {lineNumber}
                  </span>
                  {!source && (
                    <span className={styles.sign}>
                      {row.type === "add" ? "+" : row.type === "del" ? "−" : ""}
                    </span>
                  )}
                  {highlightedRows[index] === undefined ? (
                    <code>{row.text || " "}</code>
                  ) : (
                    <code
                      className={styles.syntaxCode}
                      data-language={syntaxLanguage}
                      // highlight.js 会转义源代码，仅返回用于着色的 span。
                      dangerouslySetInnerHTML={{ __html: highlightedRows[index] }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={styles.empty}>{emptyMessage}</div>
      )}
      {truncated && rows.length > 0 && (
        <div className={styles.truncated}>{truncatedMessage}</div>
      )}
    </div>
  );
}

export function SourceFilePreview({
  file,
  content,
  startLine,
  endLine,
  truncated = false,
}: {
  file: string;
  content: string;
  startLine?: number;
  endLine?: number;
  truncated?: boolean;
}) {
  const rows = useMemo<FileDiffRow[]>(
    () => content.split(/\r?\n/).map((text, index) => ({
      old: index + 1,
      cur: index + 1,
      type: "ctx",
      text,
    })),
    [content],
  );

  return (
    <FileDiff
      file={file}
      rows={rows}
      additions={0}
      deletions={0}
      headerless
      source
      highlightedLineRange={startLine === undefined
        ? undefined
        : { start: startLine, end: endLine }}
      truncated={truncated}
      truncatedMessage="文件较大，当前仅显示开头部分。"
      emptyMessage="该文件没有可展示的文本内容"
    />
  );
}

const EXTENSION_LANGUAGES: Record<string, string> = {
  bash: "bash",
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  cts: "typescript",
  cxx: "cpp",
  dart: "dart",
  fs: "fsharp",
  go: "go",
  gradle: "gradle",
  graphql: "graphql",
  groovy: "groovy",
  h: "c",
  hpp: "cpp",
  htm: "xml",
  html: "xml",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  jsonc: "json",
  jsx: "javascript",
  kt: "kotlin",
  kts: "kotlin",
  less: "less",
  lua: "lua",
  md: "markdown",
  markdown: "markdown",
  mjs: "javascript",
  mts: "typescript",
  php: "php",
  properties: "properties",
  proto: "protobuf",
  ps1: "powershell",
  py: "python",
  r: "r",
  rb: "ruby",
  rs: "rust",
  sass: "scss",
  scala: "scala",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  svelte: "xml",
  svg: "xml",
  swift: "swift",
  toml: "ini",
  ts: "typescript",
  tsx: "typescript",
  vue: "xml",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

/** Resolve a deterministic highlighter from the project-relative file path. */
export function languageForFile(path: string): string | undefined {
  const fileName = splitFilePath(path).name;
  const normalizedName = fileName.toLowerCase();
  let language: string | undefined;

  if (normalizedName === "makefile" || normalizedName.startsWith("makefile.")) {
    language = "makefile";
  } else if (normalizedName === "cmakelists.txt") {
    language = "cmake";
  } else if (normalizedName === "dockerfile" || normalizedName.startsWith("dockerfile.")) {
    language = "dockerfile";
  } else {
    const extension = normalizedName.includes(".")
      ? normalizedName.slice(normalizedName.lastIndexOf(".") + 1)
      : "";
    language = EXTENSION_LANGUAGES[extension];
  }

  return language && hljs.getLanguage(language) ? language : undefined;
}

function highlightDiffLine(
  source: string,
  language: string | undefined,
): string | undefined {
  if (!language) return undefined;
  try {
    return hljs.highlight(source, {
      language,
      ignoreIllegals: true,
    }).value;
  } catch {
    return undefined;
  }
}

function displayLineNumber(row: FileDiffRow): number | "" {
  return row.type === "del" ? row.old ?? "" : row.cur ?? row.old ?? "";
}

export function splitFilePath(path: string): {
  directory: string;
  name: string;
} {
  const separatorIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (separatorIndex < 0) return { directory: "./", name: path };
  return {
    directory: path.slice(0, separatorIndex + 1),
    name: path.slice(separatorIndex + 1),
  };
}

export function rowsFromPatch(patch: string): FileDiffRow[] {
  const rows: FileDiffRow[] = [];
  let oldLine = 0;
  let currentLine = 0;
  let inHunk = false;
  let hasPreviousHunk = false;
  for (const line of patch.split(/\r?\n/)) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      const nextOldLine = Number(hunk[1]);
      const nextCurrentLine = Number(hunk[2]);
      const unchangedLines = hasPreviousHunk
        ? Math.max(nextOldLine - oldLine, nextCurrentLine - currentLine)
        : Math.max(nextOldLine - 1, nextCurrentLine - 1);
      if (unchangedLines > 0) {
        rows.push({
          old: null,
          cur: null,
          type: "gap",
          text: `${unchangedLines} 行未修改`,
        });
      }
      oldLine = nextOldLine;
      currentLine = nextCurrentLine;
      inHunk = true;
      hasPreviousHunk = true;
      continue;
    }
    if (!inHunk || line.startsWith("\\ No newline")) continue;
    if (line.startsWith("+")) {
      rows.push({ old: null, cur: currentLine++, type: "add", text: line.slice(1) });
    } else if (line.startsWith("-")) {
      rows.push({ old: oldLine++, cur: null, type: "del", text: line.slice(1) });
    } else if (line.startsWith(" ")) {
      rows.push({ old: oldLine++, cur: currentLine++, type: "ctx", text: line.slice(1) });
    }
  }
  return rows;
}
