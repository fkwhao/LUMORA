import { FileDiff, X } from "lucide-react";
import { useRef, type CSSProperties, type PointerEvent } from "react";

interface DiffReviewPaneProps {
  width: number;
  onClose(): void;
  onWidthChange(width: number): void;
}

const MIN_REVIEW_WIDTH = 340;
const MAX_REVIEW_WIDTH = 720;

/**
 * 文件变更审阅面板。
 *
 * 当前执行链路尚未返回文件 Diff，因此先提供真实的审阅容器和空状态；
 * 后续接入变更事件时，只需要向主体区域填充文件列表与逐行 Diff。
 */
export function DiffReviewPane({
  width,
  onClose,
  onWidthChange,
}: DiffReviewPaneProps) {
  const dragStart = useRef<{ x: number; width: number } | undefined>(
    undefined,
  );
  const style = { "--review-width": `${width}px` } as CSSProperties;

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
          未提交的更改
        </button>
        <span>0 个文件</span>
      </div>
      <div className="review-empty">
        <span>
          <FileDiff size={22} />
        </span>
        <strong>暂无文件变更</strong>
        <p>Agent 编辑、创建或删除文件后，可在这里逐项查看 Diff。</p>
      </div>
    </aside>
  );
}
