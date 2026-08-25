export type RightSidebarTabId =
  | "context"
  | "review"
  | `agent:${string}`
  | `citation:${string}`;

export interface RightSidebarTabState {
  tabs: RightSidebarTabId[];
  activeTabId?: RightSidebarTabId;
  visible: boolean;
}

export type RightSidebarTabAction =
  | { type: "open"; tabId: RightSidebarTabId }
  | { type: "select"; tabId: RightSidebarTabId }
  | { type: "close"; tabId: RightSidebarTabId }
  | { type: "show" }
  | { type: "hide" }
  | { type: "reset" };

export const INITIAL_RIGHT_SIDEBAR_STATE: RightSidebarTabState = {
  tabs: [],
  activeTabId: undefined,
  visible: false,
};

export function rightSidebarTabReducer(
  state: RightSidebarTabState,
  action: RightSidebarTabAction,
): RightSidebarTabState {
  if (action.type === "reset") return INITIAL_RIGHT_SIDEBAR_STATE;

  if (action.type === "open") {
    return {
      tabs: state.tabs.includes(action.tabId)
        ? state.tabs
        : [...state.tabs, action.tabId],
      activeTabId: action.tabId,
      visible: true,
    };
  }

  if (action.type === "select") {
    if (!state.tabs.includes(action.tabId)) return state;
    return { ...state, activeTabId: action.tabId, visible: true };
  }

  if (action.type === "close") {
    const closedIndex = state.tabs.indexOf(action.tabId);
    if (closedIndex < 0) return state;
    const tabs = state.tabs.filter((tabId) => tabId !== action.tabId);
    if (tabs.length === 0) return INITIAL_RIGHT_SIDEBAR_STATE;
    const activeTabId = state.activeTabId === action.tabId
      ? tabs[Math.min(closedIndex, tabs.length - 1)]
      : state.activeTabId;
    return { tabs, activeTabId, visible: state.visible };
  }

  if (action.type === "hide") return { ...state, visible: false };

  if (state.tabs.length === 0) {
    return {
      tabs: ["context"],
      activeTabId: "context",
      visible: true,
    };
  }
  return {
    ...state,
    activeTabId: state.activeTabId ?? state.tabs[0],
    visible: true,
  };
}
