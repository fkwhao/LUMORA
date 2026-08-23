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
}: FileDiffProps) {
  const filePath = splitFilePath(file);

  return (
    <div
      className={`${styles.diff}${preview ? ` ${styles.preview}` : ""}${
        headerless ? ` ${styles.headerless}` : ""
      }${parentScroll ? ` ${styles.parentScroll}` : ""}`}
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
          {rows.map((row, index) => row.type === "gap" ? (
            <div
              key={`gap-${index}`}
              className={`${styles.diffRow} ${styles.gap}`}
            >
              {row.text}
            </div>
          ) : (
            <div
              key={`${row.old ?? "n"}-${row.cur ?? "n"}-${index}`}
              className={`${styles.diffRow} ${styles[row.type]}`}
            >
              <span
                className={styles.ln}
                title={row.type === "del" ? `原第 ${row.old} 行` : `新第 ${row.cur ?? row.old} 行`}
              >
                {displayLineNumber(row)}
              </span>
              <span className={styles.sign}>
                {row.type === "add" ? "+" : row.type === "del" ? "−" : ""}
              </span>
              <code>{row.text || " "}</code>
            </div>
          ))}
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
