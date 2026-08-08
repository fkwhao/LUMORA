import { FileDiff, FilePenLine, X } from "lucide-react";
import { useRef, type CSSProperties, type PointerEvent } from "react";

interface DiffReviewPaneProps {
  width: number;
  changes: FileChange[];
  selectedChangeId?: string;
  onClose(): void;
  onSelectChange(changeId: string): void;
  onWidthChange(width: number): void;
}

export interface FileChange {
  changeId: string;
  path: string;
  oldText: string;
  newText: string;
  previewAvailable: boolean;
}

const MIN_REVIEW_WIDTH = 340;
const MAX_REVIEW_WIDTH = 720;

/**
 * 文件变更审阅面板。
 *
 * 展示工具事件携带的有界局部补丁，不读取或复制整份工作区文件。
 */
export function DiffReviewPane({
  width,
  changes,
  selectedChangeId,
  onClose,
  onSelectChange,
  onWidthChange,
}: DiffReviewPaneProps) {
  const dragStart = useRef<{ x: number; width: number } | undefined>(
    undefined,
  );
  const style = { "--review-width": `${width}px` } as CSSProperties;
  const selected =
    changes.find((change) => change.changeId === selectedChangeId) ?? changes[0];

  function startResize(event: PointerEvent<HTMLDivElement>) {
    dragStart.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-review-pane");
  }

  function resize(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) {
      return;
    }
    const nextWidth =
      dragStart.current.width + dragStart.current.x - event.clientX;
    onWidthChange(
      Math.min(MAX_REVIEW_WIDTH, Math.max(MIN_REVIEW_WIDTH, nextWidth)),
    );
  }

  function stopResize(event: PointerEvent<HTMLDivElement>) {
    dragStart.current = undefined;
    event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.classList.remove("resizing-review-pane");
  }

  return (
    <aside className="review-pane" style={style} aria-label="变更审阅">
      <div
        className="review-resize-handle"
        role="separator"
        aria-label="调整审阅面板宽度"
        aria-orientation="vertical"
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
      />
      <header className="review-header">
        <div>
          <FileDiff size={15} />
          <strong>审阅</strong>
        </div>
        <button type="button" aria-label="关闭审阅" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
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
    </aside>
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
