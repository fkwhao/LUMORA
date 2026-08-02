import {
  ArrowLeft,
  ArrowRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

interface WindowChromeProps {
  canGoBack: boolean;
  canGoForward: boolean;
  sidebarCollapsed: boolean;
  onGoBack(): void;
  onGoForward(): void;
  onResizeStart(event: React.PointerEvent<HTMLDivElement>): void;
  onToggleSidebar(): void;
}

export function WindowChrome({
  canGoBack,
  canGoForward,
  sidebarCollapsed,
  onGoBack,
  onGoForward,
  onResizeStart,
  onToggleSidebar,
}: WindowChromeProps) {
  return (
    <>
      <div className="window-drag-region" aria-hidden="true" />
      <div className="window-navigation">
        <button
          type="button"
          aria-expanded={!sidebarCollapsed}
          aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          onClick={onToggleSidebar}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen size={17} strokeWidth={1.8} />
          ) : (
            <PanelLeftClose size={17} strokeWidth={1.8} />
          )}
        </button>
        <button
          type="button"
          aria-label="返回"
          title="返回"
          disabled={!canGoBack}
          onClick={onGoBack}
        >
          <ArrowLeft size={17} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label="前进"
          title="前进"
          disabled={!canGoForward}
          onClick={onGoForward}
        >
          <ArrowRight size={17} strokeWidth={1.8} />
        </button>
      </div>
      {!sidebarCollapsed && (
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-label="调整侧边栏宽度"
          aria-orientation="vertical"
          onPointerDown={onResizeStart}
        />
      )}
    </>
  );
}
