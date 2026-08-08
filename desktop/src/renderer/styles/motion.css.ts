import { globalStyle, keyframes } from "@vanilla-extract/css";

const riseIn = keyframes({
  from: { opacity: 0, transform: "translateY(10px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

const popIn = keyframes({
  from: { opacity: 0, transform: "scale(0.96)" },
  to: { opacity: 1, transform: "scale(1)" },
});

const slideFromRight = keyframes({
  from: { opacity: 0, transform: "translateX(14px)" },
  to: { opacity: 1, transform: "translateX(0)" },
});

const searchReveal = keyframes({
  from: { opacity: 0, transform: "translateY(-4px)", height: "24px" },
  to: { opacity: 1, transform: "translateY(0)", height: "32px" },
});

globalStyle(".home-hero", {
  animation: `${riseIn} 260ms 30ms cubic-bezier(0.2, 0.75, 0.25, 1) both`,
});

globalStyle(".home-composer-stack", {
  animation: `${riseIn} 280ms 80ms cubic-bezier(0.2, 0.75, 0.25, 1) both`,
});

globalStyle(".history-search", {
  transformOrigin: "top",
  animation: `${searchReveal} 170ms cubic-bezier(0.2, 0.75, 0.25, 1) both`,
});

globalStyle(".task-more-menu", {
  transformOrigin: "top right",
  animation: `${popIn} 140ms cubic-bezier(0.2, 0.75, 0.25, 1) both`,
});

globalStyle(".review-pane", {
  animation: `${slideFromRight} 190ms cubic-bezier(0.2, 0.75, 0.25, 1) both`,
});

globalStyle(".archive-task-row,\n.agent-run-event", {
  transition:
    "background-color 140ms ease, opacity 140ms ease, transform 140ms ease",
});

globalStyle(
  "button:not(:disabled),\n.recent-item,\n.starter-item,\n.archive-task-row",
  {
    WebkitTapHighlightColor: "transparent",
  },
);

globalStyle(
  ".submit-task:active:not(:disabled),\n.icon-button:active,\n.task-actions > button:active",
  {
    transform: "scale(0.92)",
  },
);

globalStyle(
  ".submit-task,\n.send-follow-up,\n.icon-button,\n.task-actions > button,\n.project-picker,\n.clear-project",
  {
    transition:
      "color 140ms ease, background-color 140ms ease, border-color 140ms ease, box-shadow 160ms ease, transform 140ms ease",
  },
);

globalStyle(".window-navigation button svg", {
  animation: `${popIn} 130ms ease-out`,
});

globalStyle(
  ".app-shell > .home-layout,\n.app-shell > .prototype-layout",
  {
    position: "relative",
    zIndex: "2",
    width: "calc(100% - 8px)",
    transform: "translateX(0)",
    transition:
      "width 420ms cubic-bezier(0.22, 0.82, 0.24, 1), transform 420ms cubic-bezier(0.22, 0.82, 0.24, 1), box-shadow 420ms ease, color 140ms ease, background-color 140ms ease, border-color 140ms ease",
    willChange: "width, transform",
  },
);

globalStyle(".app-shell > .task-layout,\n.settings-surface", {
  position: "relative",
  zIndex: "2",
  width: "100%",
  transform: "translateX(0)",
  transition:
    "width 420ms cubic-bezier(0.22, 0.82, 0.24, 1), transform 420ms cubic-bezier(0.22, 0.82, 0.24, 1), box-shadow 420ms ease, color 140ms ease, background-color 140ms ease, border-color 140ms ease",
  willChange: "width, transform",
});

globalStyle(
  ".sidebar-collapsed.app-shell > .home-layout,\n.sidebar-collapsed.app-shell > .prototype-layout,\n.sidebar-collapsed.app-shell > .conversation-hub-layout",
  {
    width: "calc(100% + var(--sidebar-width) - 8px)",
    transform: "translateX(calc(-1 * var(--sidebar-width)))",
    boxShadow:
      "inset 18px 0 28px -28px color-mix(in srgb, var(--ink) 18%, transparent)",
  },
);

globalStyle(
  ".sidebar-collapsed.app-shell > .task-layout,\n.sidebar-collapsed .settings-surface",
  {
    width: "calc(100% + var(--sidebar-width))",
    transform: "translateX(calc(-1 * var(--sidebar-width)))",
    boxShadow:
      "inset 18px 0 28px -28px color-mix(in srgb, var(--ink) 18%, transparent)",
  },
);

globalStyle(
  ".home-hero,\n.home-composer-stack,\n.history-search,\n.task-more-menu,\n.review-pane,\n.window-navigation button svg",
  {
    "@media": {
      "(prefers-reduced-motion: reduce)": {
        animation: "none",
      },
    },
  },
);

globalStyle(
  ".app-shell,\n.settings-shell,\n.sidebar,\n.settings-sidebar,\n.home-layout,\n.task-layout,\n.prototype-layout,\n.settings-surface,\n.agent-run-events,\nbutton",
  {
    "@media": {
      "(prefers-reduced-motion: reduce)": {
        transition: "none",
      },
    },
  },
);
