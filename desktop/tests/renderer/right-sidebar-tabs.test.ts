import { describe, expect, it } from "vitest";

import {
  INITIAL_RIGHT_SIDEBAR_STATE,
  rightSidebarTabReducer,
  type RightSidebarTabState,
} from "../../src/renderer/features/tasks/state/right-sidebar-tabs";

describe("rightSidebarTabReducer", () => {
  it("keeps context, review, and multiple agents open as peer tabs", () => {
    let state = rightSidebarTabReducer(INITIAL_RIGHT_SIDEBAR_STATE, {
      type: "open",
      tabId: "context",
    });
    state = rightSidebarTabReducer(state, { type: "open", tabId: "review" });
    state = rightSidebarTabReducer(state, {
      type: "open",
      tabId: "agent:researcher",
    });
    state = rightSidebarTabReducer(state, {
      type: "open",
      tabId: "agent:reviewer",
    });

    expect(state.tabs).toEqual([
      "context",
      "review",
      "agent:researcher",
      "agent:reviewer",
    ]);
    expect(state.activeTabId).toBe("agent:reviewer");
    expect(state.visible).toBe(true);
  });

  it("switches tabs and selects a neighbor when the active tab closes", () => {
    let state: RightSidebarTabState = {
      tabs: ["context", "review", "agent:researcher"],
      activeTabId: "review",
      visible: true,
    };
    state = rightSidebarTabReducer(state, {
      type: "close",
      tabId: "review",
    });

    expect(state.tabs).toEqual(["context", "agent:researcher"]);
    expect(state.activeTabId).toBe("agent:researcher");

    state = rightSidebarTabReducer(state, {
      type: "select",
      tabId: "context",
    });
    expect(state.activeTabId).toBe("context");
  });

  it("preserves tabs when collapsed and opens context from an empty rail", () => {
    const open = rightSidebarTabReducer(INITIAL_RIGHT_SIDEBAR_STATE, {
      type: "open",
      tabId: "review",
    });
    const hidden = rightSidebarTabReducer(open, { type: "hide" });
    expect(hidden.tabs).toEqual(["review"]);
    expect(hidden.visible).toBe(false);
    expect(rightSidebarTabReducer(hidden, { type: "show" }).visible).toBe(true);

    expect(rightSidebarTabReducer(INITIAL_RIGHT_SIDEBAR_STATE, { type: "show" }))
      .toEqual({ tabs: ["context"], activeTabId: "context", visible: true });
  });
});
