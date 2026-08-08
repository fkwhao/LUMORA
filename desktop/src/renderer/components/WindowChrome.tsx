import {
  ArrowLeft,
  ArrowRight,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

export interface ConversationTab {
  taskId: string;
  title: string;
  projectName?: string;
}

interface WindowChromeProps {
  canGoBack: boolean;
  canGoForward: boolean;
  sidebarCollapsed: boolean;
  activeTaskId?: string;
  conversationHubActive?: boolean;
  conversationTabs?: ConversationTab[];
  onGoBack(): void;
  onGoForward(): void;
  onShowConversationHub?(): void;
  onNewConversation?(): void;
  onOpenTab?(taskId: string): void;
  onCloseTab?(taskId: string): void;
  onResizeStart(event: React.PointerEvent<HTMLDivElement>): void;
  onToggleSidebar(): void;
}

export function WindowChrome({
  canGoBack,
  canGoForward,
  sidebarCollapsed,
  activeTaskId,
  conversationHubActive = false,
  conversationTabs = [],
  onGoBack,
  onGoForward,
  onShowConversationHub,
  onNewConversation,
  onOpenTab,
  onCloseTab,
  onResizeStart,
  onToggleSidebar,
}: WindowChromeProps) {
  const [displayActiveTaskId, setDisplayActiveTaskId] = useState(activeTaskId);

  useEffect(() => {
    setDisplayActiveTaskId(activeTaskId);
  }, [activeTaskId]);

  function activateConversationTab(taskId: string) {
    if (displayActiveTaskId !== taskId) {
      flushSync(() => setDisplayActiveTaskId(taskId));
    }
    onOpenTab?.(taskId);
  }

  return (
    <>
      <div className="window-drag-region" aria-hidden="true" />
      <div
        className={`window-navigation${
          sidebarCollapsed ? " conversation-tabs-visible" : ""
        }`}
      >
        <button
          className="window-sidebar-toggle"
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
        {sidebarCollapsed ? (
          <>
            <button
              className={`conversation-hub-trigger${
                conversationHubActive ? " active" : ""
              }`}
              type="button"
              aria-label="会话与项目"
              title="会话与项目"
              aria-pressed={conversationHubActive}
              onClick={onShowConversationHub}
            >
              <LayoutGrid size={17} strokeWidth={1.7} />
            </button>
            <div
              className="conversation-tab-strip"
              role="tablist"
              aria-label="已打开的会话"
            >
              {conversationTabs.map((tab) => {
                const active =
                  !conversationHubActive &&
                  displayActiveTaskId === tab.taskId;
                return (
                  <div
                    className={`conversation-tab${active ? " active" : ""}`}
                    key={tab.taskId}
                    role="presentation"
                  >
                    <button
                      className="conversation-tab-target"
                      type="button"
                      role="tab"
                      aria-selected={active}
                      title={tab.title}
                      onPointerDown={(event) => {
                        if (event.button === 0) {
                          setDisplayActiveTaskId(tab.taskId);
                        }
                      }}
                      onClick={() => activateConversationTab(tab.taskId)}
                    >
                      <span
                        className="conversation-tab-project"
                        aria-hidden="true"
                      >
                        {(tab.projectName ?? "L").slice(0, 1).toUpperCase()}
                      </span>
                      <span className="conversation-tab-title">
                        {tab.title}
                      </span>
                    </button>
                    <button
                      className="conversation-tab-close"
                      type="button"
                      aria-label={`关闭会话页签：${tab.title}`}
                      title="关闭页签"
                      onClick={() => onCloseTab?.(tab.taskId)}
                    >
                      <X size={14} strokeWidth={1.8} />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              className="conversation-new-tab"
              type="button"
              aria-label="新建会话"
              title="新建会话"
              onClick={onNewConversation}
            >
              <Plus size={18} strokeWidth={1.7} />
            </button>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
      <div
        aria-hidden={sidebarCollapsed || undefined}
        aria-label={sidebarCollapsed ? undefined : "调整侧边栏宽度"}
        aria-orientation={sidebarCollapsed ? undefined : "vertical"}
        className="sidebar-resize-handle"
        role={sidebarCollapsed ? undefined : "separator"}
        onPointerDown={onResizeStart}
      />
    </>
  );
}
