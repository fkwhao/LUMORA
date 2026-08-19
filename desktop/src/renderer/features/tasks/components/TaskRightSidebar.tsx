import { Bot, FileDiff, X } from "lucide-react";
import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import type { WorkLogItemStatus } from "../../../../shared/model-contract";
import {
  MAX_CONTEXT_PANE_WIDTH,
  MIN_CONTEXT_PANE_WIDTH,
} from "../../../constants/layout";
import {
  clampContextPaneWidth,
  shouldCollapseContextPaneOnDrag,
  shouldExpandContextPaneOnDrag,
} from "../../layout/context-pane-preferences";
import type { RightSidebarTabId } from "../state/right-sidebar-tabs";

export interface TaskRightSidebarTab {
  id: RightSidebarTabId;
  label: string;
  kind: "context" | "review" | "agent";
  status?: WorkLogItemStatus;
  usagePercent?: number;
}

interface TaskRightSidebarProps {
  open: boolean;
  width: number;
  tabs: TaskRightSidebarTab[];
  activeTabId?: RightSidebarTabId;
  children?: ReactNode;
  onSelectTab(tabId: RightSidebarTabId): void;
  onCloseTab(tabId: RightSidebarTabId): void;
  onOpenChange(open: boolean): void;
  onWidthChange(width: number): void;
  onWidthCommit(width: number): void;
}

interface DragState {
  x: number;
  width: number;
  currentWidth: number;
  rememberedWidth: number;
  startedOpen: boolean;
  open: boolean;
}

export function TaskRightSidebar({
  open,
  width,
  tabs,
  activeTabId,
  children,
  onSelectTab,
  onCloseTab,
  onOpenChange,
  onWidthChange,
  onWidthCommit,
}: TaskRightSidebarProps) {
  const paneRef = useRef<HTMLElement>(null);
  const dragStart = useRef<DragState | undefined>(undefined);
  const style = { "--context-pane-width": `${width}px` } as CSSProperties;

  function startResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startWidth = open ? width : 0;
    dragStart.current = {
      x: event.clientX,
      width: startWidth,
      currentWidth: startWidth,
      rememberedWidth: width,
      startedOpen: open,
      open,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.classList.add("resizing-context-pane");
    if (!open) document.body.classList.add("opening-context-pane-by-drag");
  }

  function resize(event: PointerEvent<HTMLDivElement>) {
    const drag = dragStart.current;
    if (!drag) return;
    const nextWidth = Math.min(
      MAX_CONTEXT_PANE_WIDTH,
      Math.max(0, Math.round(drag.width + drag.x - event.clientX)),
    );
    drag.currentWidth = nextWidth;
    paneRef.current?.style.setProperty("--context-pane-width", `${nextWidth}px`);
    event.currentTarget.setAttribute("aria-valuenow", String(nextWidth));
    const nextOpen = drag.startedOpen
      ? !shouldCollapseContextPaneOnDrag(nextWidth)
      : shouldExpandContextPaneOnDrag(nextWidth);
    if (nextOpen === drag.open) return;
    drag.open = nextOpen;
    paneRef.current?.classList.toggle("is-open", nextOpen);
    paneRef.current?.setAttribute("aria-hidden", String(!nextOpen));
  }

  function stopResize(event: PointerEvent<HTMLDivElement>) {
    const drag = dragStart.current;
    dragStart.current = undefined;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    document.body.classList.remove("resizing-context-pane");
    document.body.classList.remove("opening-context-pane-by-drag");
    if (!drag) return;
    const settledWidth = drag.open
      ? clampContextPaneWidth(drag.currentWidth)
      : drag.startedOpen
        ? MIN_CONTEXT_PANE_WIDTH
        : drag.rememberedWidth;
    onOpenChange(drag.open);
    onWidthChange(settledWidth);
    onWidthCommit(settledWidth);
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    if (!open) {
      if (event.key === "ArrowLeft") onOpenChange(true);
      return;
    }
    if (event.key === "ArrowRight" && width <= MIN_CONTEXT_PANE_WIDTH) {
      onOpenChange(false);
      return;
    }
    const nextWidth = clampContextPaneWidth(
      width + (event.key === "ArrowLeft" ? 24 : -24),
    );
    onWidthChange(nextWidth);
    onWidthCommit(nextWidth);
  }

  return (
    <aside
      ref={paneRef}
      className={`conversation-usage-pane task-right-sidebar${open ? " is-open" : ""}`}
      style={style}
      aria-label="任务详情侧栏"
      aria-hidden={!open}
    >
      <div
        className="context-pane-resize-handle"
        role="separator"
        aria-label="调整右侧栏宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_CONTEXT_PANE_WIDTH}
        aria-valuemax={MAX_CONTEXT_PANE_WIDTH}
        aria-valuenow={width}
        tabIndex={open ? 0 : -1}
        onKeyDown={resizeWithKeyboard}
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
      />

      <div className="right-sidebar-tabbar" role="tablist" aria-label="任务详情页签">
        {tabs.map((tab) => {
          const selected = tab.id === activeTabId;
          const key = safeId(tab.id);
          return (
            <div
              className={`right-sidebar-tab${selected ? " is-active" : ""}`}
              data-kind={tab.kind}
              key={tab.id}
            >
              <button
                className="right-sidebar-tab-select"
                id={`right-sidebar-tab-${key}`}
                type="button"
                role="tab"
                aria-controls={`right-sidebar-panel-${key}`}
                aria-selected={selected}
                title={tab.label}
                onClick={() => onSelectTab(tab.id)}
              >
                <TabIcon tab={tab} />
                <span>{tab.label}</span>
              </button>
              <button
                className="right-sidebar-tab-close"
                type="button"
                aria-label={`关闭${tab.label}页签`}
                title="关闭页签"
                onClick={() => onCloseTab(tab.id)}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="right-sidebar-content">
        {activeTabId && (
          <div
            className="right-sidebar-tab-panel"
            id={`right-sidebar-panel-${safeId(activeTabId)}`}
            role="tabpanel"
            aria-labelledby={`right-sidebar-tab-${safeId(activeTabId)}`}
          >
            {children}
          </div>
        )}
      </div>
    </aside>
  );
}

function TabIcon({ tab }: { tab: TaskRightSidebarTab }) {
  if (tab.kind === "context") {
    return (
      <span
        className="context-pane-mini-ring"
        style={{ "--usage": tab.usagePercent ?? 0 } as CSSProperties}
        aria-hidden="true"
      />
    );
  }
  if (tab.kind === "review") return <FileDiff size={13} aria-hidden="true" />;
  return (
    <span className="subagent-pane-avatar" data-status={tab.status} aria-hidden="true">
      <Bot size={11} />
    </span>
  );
}

function safeId(tabId: string): string {
  return tabId.replace(/[^a-zA-Z0-9_-]/g, "-");
}
