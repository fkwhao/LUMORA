import { globalStyle, keyframes } from "@vanilla-extract/css";

const surfaceIn = keyframes({
  from: { opacity: 0, transform: "translateY(5px) scale(0.997)" },
  to: { opacity: 1, transform: "translateY(0) scale(1)" },
});

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

globalStyle(
  ".home-layout,\n.task-layout,\n.prototype-layout,\n.settings-surface",
  {
    animation: `${surfaceIn} 190ms cubic-bezier(0.2, 0.75, 0.25, 1) both`,
  },
);

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

globalStyle(".settings-dialog-backdrop", {
  animation: `${popIn} 150ms ease-out both`,
});

globalStyle(".settings-dialog", {
  animation: `${riseIn} 180ms cubic-bezier(0.2, 0.75, 0.25, 1) both`,
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
  ".submit-task:active:not(:disabled),\n.send-follow-up:active:not(:disabled),\n.icon-button:active,\n.task-actions > button:active",
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
  ".home-layout,\n.task-layout,\n.prototype-layout,\n.settings-surface,\n.home-hero,\n.home-composer-stack,\n.history-search,\n.task-more-menu,\n.review-pane,\n.settings-dialog-backdrop,\n.settings-dialog,\n.window-navigation button svg",
  {
    "@media": {
      "(prefers-reduced-motion: reduce)": {
        animation: "none",
      },
    },
  },
);

globalStyle(
  ".app-shell,\n.settings-shell,\n.sidebar,\n.settings-sidebar,\n.agent-run-events,\nbutton",
  {
    "@media": {
      "(prefers-reduced-motion: reduce)": {
        transition: "none",
      },
    },
  },
);
