import { FileDiff, FilePenLine } from "lucide-react";

interface DiffReviewPaneProps {
  changes: FileChange[];
  selectedChangeId?: string;
  onSelectChange(changeId: string): void;
}

export interface FileChange {
  changeId: string;
  path: string;
  oldText: string;
  newText: string;
  previewAvailable: boolean;
}

/**
 * 文件变更审阅面板。
 *
 * 展示工具事件携带的有界局部补丁，不读取或复制整份工作区文件。
 */
export function DiffReviewPane({
  changes,
  selectedChangeId,
  onSelectChange,
}: DiffReviewPaneProps) {
  const selected =
    changes.find((change) => change.changeId === selectedChangeId) ?? changes[0];

  return (
    <section className="review-pane-content" aria-label="变更审阅内容">
      <div className="review-toolbar">
        <button className="active" type="button">
          文件改动
        </button>
        <span>{changes.length} 项改动</span>
      </div>
      {changes.length > 0 && (
        <div className="review-file-list" aria-label="已修改文件">
          {changes.map((change) => (
            <button
              className={change.changeId === selected?.changeId ? "active" : ""}
              key={change.changeId}
              type="button"
              onClick={() => onSelectChange(change.changeId)}
            >
              <FilePenLine size={13} />
              <span>{fileName(change.path)}</span>
            </button>
          ))}
        </div>
      )}
      {!selected ? <div className="review-empty">
        <span>
          <FileDiff size={22} />
        </span>
        <strong>暂无文件变更</strong>
        <p>Agent 编辑文件后，可从处理步骤直接打开局部 Diff。</p>
      </div> : (
        <div className="review-change-preview">
          <header>
            <strong>{fileName(selected.path)}</strong>
            <span>{selected.path}</span>
          </header>
          {selected.previewAvailable ? (
            <div className="review-diff" aria-label={`${selected.path} 文件改动`}>
              <DiffBlock kind="removed" text={selected.oldText} />
              <DiffBlock kind="added" text={selected.newText} />
            </div>
          ) : (
            <div className="review-preview-unavailable">
              <FileDiff size={20} />
              <strong>此历史记录没有补丁预览</strong>
              <p>较早的记录只保存了文件名；重新执行一次修改即可查看局部 Diff。</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DiffBlock({
  kind,
  text,
}: {
  kind: "removed" | "added";
  text: string;
}) {
  const marker = kind === "removed" ? "−" : "+";
  const lines = text.split("\n");
  return (
    <div className={`review-diff-block ${kind}`}>
      {lines.map((line, index) => (
        <div className="review-diff-line" key={`${kind}-${index}`}>
          <span>{marker}</span>
          <code>{line || " "}</code>
        </div>
      ))}
    </div>
  );
}

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
