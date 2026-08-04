import { globalStyle, keyframes } from "@vanilla-extract/css";

const streamCursorBlink = keyframes({
  "0%, 45%": { opacity: 1 },
  "46%, 100%": { opacity: 0 },
});

const bottomStatusDot = keyframes({
  "0%, 60%, 100%": { opacity: 0.42, transform: "translateY(0)" },
  "30%": { opacity: 1, transform: "translateY(-2.5px)" },
});

const thinkingTextSweep = keyframes({
  "0%": { backgroundPosition: "100% 50%" },
  "100%": { backgroundPosition: "-50% 50%" },
});

globalStyle(".task-layout", {
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  width: "100%",
  height: "100%",
  margin: "0",
  overflow: "hidden",
  borderRight: "0",
  borderBottom: "0",
  borderRadius: "14px 0 0 0",
});

globalStyle(".task-header", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: "44px",
  gap: "20px",
  padding: "5px 12px",
  borderBottom: "1px solid var(--line)",
});

globalStyle(".task-title-row", {
  display: "flex",
  minWidth: "0",
  alignItems: "center",
  gap: "12px",
});

globalStyle(".task-title-row > div", {
  minWidth: "0",
});

globalStyle(".task-title-row h1", {
  maxWidth: "680px",
  margin: "0",
  overflow: "hidden",
  fontSize: "15px",
  letterSpacing: "-0.02em",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".icon-button", {
  display: "grid",
  width: "30px",
  height: "30px",
  flex: "0 0 auto",
  padding: "0",
  placeItems: "center",
  border: "1px solid var(--line)",
  borderRadius: "9px",
  background: "#fff",
  cursor: "pointer",
});

globalStyle(".status-badge", {
  flex: "0 0 auto",
  padding: "5px 8px",
  color: "var(--blue)",
  border: "1px solid #c9dbfb",
  borderRadius: "7px",
  background: "var(--blue-soft)",
  fontSize: "9px",
  fontWeight: "650",
});

globalStyle(".status-waiting_approval", {
  color: "#95600d",
  borderColor: "#f0d49e",
  background: "var(--amber-soft)",
});

globalStyle(".status-completed", {
  color: "#0d754d",
  borderColor: "#b9dfcc",
  background: "var(--green-soft)",
});

globalStyle(".status-failed,\n.status-rejected,\n.status-interrupted", {
  color: "var(--danger)",
  borderColor: "#f0c6c4",
  background: "#fff1f1",
});

globalStyle(".task-actions", {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  position: "relative",
});

globalStyle(".task-more-menu", {
  position: "absolute",
  zIndex: "20",
  top: "36px",
  right: "0",
  display: "grid",
  minWidth: "160px",
  padding: "5px",
  border: "1px solid #dfe4e9",
  borderRadius: "10px",
  background: "#fff",
  boxShadow: "0 14px 36px rgb(35 43 54 / 16%)",
});

globalStyle(".task-more-menu button", {
  display: "flex",
  minHeight: "34px",
  alignItems: "center",
  gap: "8px",
  padding: "0 9px",
  color: "#434a55",
  border: "0",
  borderRadius: "7px",
  background: "transparent",
  cursor: "pointer",
  fontSize: "10px",
  textAlign: "left",
});

globalStyle(".task-more-menu button:hover", {
  background: "#f1f4f7",
});

globalStyle(".task-actions > button:not(.icon-button)", {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "34px",
  gap: "6px",
  padding: "0 11px",
  color: "#59616d",
  border: "1px solid var(--line)",
  borderRadius: "9px",
  background: "#fff",
  cursor: "pointer",
  fontSize: "10px",
});

globalStyle(".task-actions > .review-toggle.active", {
  color: "var(--ink)",
  borderColor: "var(--line-strong)",
  background: "var(--surface-soft)",
});

globalStyle(".task-stage", {
  display: "flex",
  minWidth: "0",
  minHeight: "0",
  overflow: "hidden",
  border: "0",
  borderRadius: "0",
  background: "var(--surface)",
  boxShadow: "none",
});

globalStyle(".question-rail", {
  position: "relative",
  zIndex: "8",
  display: "block",
  width: "42px",
  minWidth: "42px",
  minHeight: "0",
  padding: "18px 0",
});

globalStyle(".question-rail-track", {
  position: "relative",
  width: "100%",
  height: "100%",
  padding: "0",
  overscrollBehavior: "contain",
  touchAction: "none",
  userSelect: "none",
});

globalStyle(".question-rail-list", {
  display: "flex",
  width: "100%",
  minHeight: "100%",
  alignItems: "center",
  flexDirection: "column",
  justifyContent: "center",
});

globalStyle(".question-rail-item", {
  position: "relative",
  zIndex: "1",
  display: "block",
  width: "34px",
  height: "12px",
  minHeight: "12px",
  flex: "0 0 12px",
  padding: "0",
  border: "0",
  background: "transparent",
  cursor: "pointer",
});

globalStyle(".question-rail-item::before", {
  position: "absolute",
  top: "5px",
  left: "3px",
  width: "8px",
  height: "2px",
  borderRadius: "2px",
  background: "var(--subtle)",
  boxShadow: "0 0 0 4px var(--surface)",
  content: '""',
  opacity: "0.72",
  transition:
    "width 180ms cubic-bezier(0.2, 0.75, 0.25, 1), left 180ms cubic-bezier(0.2, 0.75, 0.25, 1), background 140ms ease, opacity 140ms ease",
});

globalStyle(".question-rail-item.active::before", {
  background: "var(--ink)",
  opacity: "1",
});

globalStyle(
  ".question-rail-item:has(+ .question-rail-item:is(:hover, :focus-visible))::before,\n.question-rail-item:is(:hover, :focus-visible) + .question-rail-item::before",
  {
    left: "3px",
    width: "20px",
    opacity: "0.92",
  },
);

globalStyle(
  ".question-rail-item:has(+ .question-rail-item + .question-rail-item:is(:hover, :focus-visible))::before,\n.question-rail-item:is(:hover, :focus-visible) + .question-rail-item + .question-rail-item::before",
  {
    left: "3px",
    width: "14px",
    opacity: "0.84",
  },
);

globalStyle(
  ".question-rail-item:has(+ .question-rail-item + .question-rail-item + .question-rail-item:is(:hover, :focus-visible))::before,\n.question-rail-item:is(:hover, :focus-visible) + .question-rail-item + .question-rail-item + .question-rail-item::before",
  {
    left: "3px",
    width: "10px",
    opacity: "0.76",
  },
);

globalStyle(
  ".question-rail-item:hover::before,\n.question-rail-item:focus-visible::before",
  {
    left: "3px",
    width: "28px",
    background: "var(--ink)",
    opacity: "1",
  },
);

globalStyle(".question-rail-item:focus-visible", {
  outline: "2px solid var(--blue)",
  outlineOffset: "2px",
  borderRadius: "4px",
});

globalStyle(".question-rail-tooltip", {
  position: "absolute",
  zIndex: "30",
  top: "50%",
  left: "42px",
  display: "grid",
  width: "min(328px, 36vw)",
  gap: "7px",
  padding: "11px 13px 12px",
  color: "#f5f6f7",
  border: "1px solid rgb(255 255 255 / 8%)",
  borderRadius: "13px",
  background: "rgb(31 33 37 / 96%)",
  boxShadow: "0 18px 45px rgb(0 0 0 / 24%)",
  opacity: "0",
  pointerEvents: "none",
  transform: "translate(6px, -50%) scale(0.98)",
  transformOrigin: "left center",
  transition: "opacity 140ms ease, transform 160ms ease",
});

globalStyle(
  ".question-rail-item:hover .question-rail-tooltip,\n.question-rail-item:focus-visible .question-rail-tooltip",
  {
    opacity: "1",
    transform: "translate(0, -50%) scale(1)",
  },
);

globalStyle(".question-rail-tooltip strong", {
  display: "-webkit-box",
  overflow: "hidden",
  color: "#f2f3f5",
  fontSize: "14px",
  fontWeight: "600",
  lineHeight: "1.5",
  textAlign: "left",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
});

globalStyle(".question-rail-result", {
  display: "-webkit-box",
  maxHeight: "91px",
  overflow: "hidden",
  color: "#a6a9af",
  fontSize: "14px",
  fontWeight: "450",
  lineHeight: "1.62",
  textAlign: "left",
  whiteSpace: "pre-wrap",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 4,
});

globalStyle(".conversation-pane", {
  position: "relative",
  display: "block",
  flex: "1 1 auto",
  minWidth: "0",
  minHeight: "0",
  borderRight: "1px solid var(--line)",
});

globalStyle(".conversation-scroll", {
  height: "100%",
  minHeight: "0",
  padding:
    "28px clamp(12px, 3vw, 28px) calc(var(--conversation-footer-height, 126px) + 18px)",
  overflow: "auto",
  scrollbarGutter: "stable",
});

globalStyle(".conversation-scroll::-webkit-scrollbar", {
  width: "10px",
});

globalStyle(".conversation-scroll::-webkit-scrollbar-track", {
  background: "transparent",
});

globalStyle(".conversation-content,\n.conversation-footer-inner", {
  width: "min(100%, 860px)",
  margin: "0 auto",
});

globalStyle(".conversation-footer-inner", {
  position: "relative",
  zIndex: "1",
  pointerEvents: "none",
});

globalStyle(".user-message-group", {
  width: "fit-content",
  marginLeft: "auto",
  maxWidth: "min(72%, 620px)",
  marginTop: "22px",
  scrollMarginTop: "34px",
});

globalStyle(".conversation-content > .user-message-group:first-child", {
  marginTop: "0",
});

globalStyle(".user-message", {
  padding: "7px 13px",
  border: "0",
  borderRadius: "16px",
  background: "#eef0f3",
});

globalStyle(".user-message span", {
  display: "none",
});

globalStyle(".user-message p", {
  margin: "0",
  fontSize: "12.5px",
  lineHeight: "1.5",
  whiteSpace: "pre-wrap",
});

globalStyle(".follow-up-message", {
  marginTop: "22px",
});

globalStyle(".user-message-meta", {
  display: "flex",
  minHeight: "30px",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "8px",
  padding: "4px 3px 0",
  color: "var(--muted)",
  fontSize: "14px",
  lineHeight: "1",
  opacity: "0",
});

globalStyle(
  ".user-message-group:hover .user-message-meta,\n.user-message-group:focus-within .user-message-meta",
  {
    opacity: "1",
  },
);

globalStyle(".user-message-meta time:empty", {
  display: "none",
});

globalStyle(".user-message-meta time", {
  fontSize: "14px",
  fontWeight: "450",
  fontVariantNumeric: "tabular-nums",
  lineHeight: "1.4",
});

globalStyle(".user-message-actions", {
  display: "inline-flex",
  alignItems: "center",
  gap: "2px",
});

globalStyle(".user-message-actions button", {
  display: "grid",
  width: "26px",
  height: "26px",
  padding: "0",
  placeItems: "center",
  color: "var(--subtle)",
  border: "0",
  borderRadius: "7px",
  background: "transparent",
  cursor: "pointer",
  transition: "color 120ms ease, background 120ms ease",
});

globalStyle(".user-message-actions button:hover", {
  color: "var(--ink)",
  background: "var(--surface-soft)",
});

globalStyle(".user-message-actions button:disabled", {
  cursor: "not-allowed",
  opacity: "0.35",
});

globalStyle(".user-message-edit", {
  display: "grid",
  minWidth: "min(52vw, 480px)",
  gap: "9px",
});

globalStyle(".user-message-edit textarea", {
  width: "100%",
  minHeight: "58px",
  maxHeight: "220px",
  resize: "none",
  padding: "0",
  color: "var(--ink)",
  border: "0",
  outline: "0",
  background: "transparent",
  font: "inherit",
  lineHeight: "1.55",
});

globalStyle(".user-message-edit-actions", {
  display: "flex",
  justifyContent: "flex-end",
  gap: "6px",
});

globalStyle(".user-message-edit-actions button", {
  display: "inline-flex",
  minHeight: "28px",
  alignItems: "center",
  gap: "5px",
  padding: "0 9px",
  color: "var(--muted)",
  border: "1px solid var(--line)",
  borderRadius: "8px",
  background: "var(--surface)",
  cursor: "pointer",
  fontSize: "9.5px",
});

globalStyle(".user-message-edit-actions button.confirm", {
  color: "#fff",
  borderColor: "var(--blue)",
  background: "var(--blue)",
});

globalStyle(".assistant-message", {
  maxWidth: "100%",
  marginTop: "12px",
  padding: "0",
});

globalStyle(".assistant-message::before", {
  content: "none",
});

globalStyle(".assistant-message > span", {
  display: "none",
});

globalStyle(".assistant-message > p", {
  margin: "0",
  color: "#272c33",
  fontSize: "12.5px",
  lineHeight: "1.78",
  whiteSpace: "pre-wrap",
});

globalStyle(".markdown-body", {
  minWidth: "0",
  marginTop: "0",
  color: "#272c33",
  fontSize: "12.5px",
  lineHeight: "1.78",
  overflowWrap: "anywhere",
});

globalStyle(".markdown-body > :first-child", {
  marginTop: "0",
});

globalStyle(".markdown-body > :last-child", {
  marginBottom: "0",
});

globalStyle(".markdown-body p", {
  margin: "0 0 10px",
});

globalStyle(".markdown-body h1,\n.markdown-body h2,\n.markdown-body h3,\n.markdown-body h4", {
  margin: "18px 0 8px",
  color: "#171a1f",
  lineHeight: "1.35",
  letterSpacing: "-0.015em",
});

globalStyle(".markdown-body h1", {
  paddingBottom: "7px",
  borderBottom: "1px solid #e4e7eb",
  fontSize: "17px",
});

globalStyle(".markdown-body h2", {
  fontSize: "15px",
});

globalStyle(".markdown-body h3,\n.markdown-body h4", {
  fontSize: "13px",
});

globalStyle(".markdown-body ul,\n.markdown-body ol", {
  margin: "8px 0 12px",
  paddingLeft: "22px",
});

globalStyle(".markdown-body li", {
  margin: "4px 0",
  paddingLeft: "2px",
});

globalStyle(".markdown-body li::marker", {
  color: "#7b8490",
});

globalStyle(".markdown-body blockquote", {
  margin: "12px 0",
  padding: "3px 12px",
  color: "#59616d",
  borderLeft: "3px solid #a9c4ee",
  background: "#f6f8fb",
});

globalStyle(".markdown-body blockquote p", {
  margin: "5px 0",
});

globalStyle(".markdown-body a", {
  color: "#1768d7",
  textDecorationColor: "#a9c8ef",
  textUnderlineOffset: "3px",
});

globalStyle(".markdown-body a:hover", {
  color: "#0f4fa9",
  textDecorationColor: "currentColor",
});

globalStyle(".markdown-body code", {
  padding: "2px 5px",
  color: "#9f3355",
  border: "1px solid #e3e6ea",
  borderRadius: "5px",
  background: "#f1f3f5",
  fontFamily:
    'var(--code-font, "Cascadia Code", "SFMono-Regular", Consolas, monospace)',
  fontSize: "0.9em",
});

globalStyle(".markdown-body pre", {
  margin: "12px 0",
  padding: "14px 15px",
  overflow: "auto",
  color: "#d9e0e8",
  border: "1px solid #2b3038",
  borderRadius: "10px",
  background: "#191c22",
  boxShadow: "inset 0 1px 0 rgb(255 255 255 / 5%)",
  lineHeight: "1.6",
  tabSize: "2",
});

globalStyle(".markdown-body pre code", {
  padding: "0",
  color: "inherit",
  border: "0",
  borderRadius: "0",
  background: "transparent",
  fontSize: "10px",
});

globalStyle(".markdown-body .hljs-comment,\n.markdown-body .hljs-quote", {
  color: "#7f8a98",
  fontStyle: "italic",
});

globalStyle(
  ".markdown-body .hljs-keyword,\n.markdown-body .hljs-selector-tag,\n.markdown-body .hljs-literal,\n.markdown-body .hljs-type",
  { color: "#c792ea" },
);

globalStyle(
  ".markdown-body .hljs-string,\n.markdown-body .hljs-regexp,\n.markdown-body .hljs-addition,\n.markdown-body .hljs-attribute",
  { color: "#9acb7c" },
);

globalStyle(
  ".markdown-body .hljs-number,\n.markdown-body .hljs-symbol,\n.markdown-body .hljs-bullet",
  { color: "#f2b36b" },
);

globalStyle(
  ".markdown-body .hljs-title,\n.markdown-body .hljs-section,\n.markdown-body .hljs-function",
  { color: "#72b7f2" },
);

globalStyle(
  ".markdown-body .hljs-variable,\n.markdown-body .hljs-template-variable,\n.markdown-body .hljs-params",
  { color: "#e7a2a2" },
);

globalStyle(".markdown-body .hljs-deletion", {
  color: "#f07178",
  background: "rgb(240 113 120 / 12%)",
});

globalStyle(".markdown-body pre code.language-diff", {
  color: "#c8d3df",
});

globalStyle(".markdown-body table", {
  display: "block",
  width: "100%",
  margin: "12px 0",
  overflowX: "auto",
  borderCollapse: "collapse",
});

globalStyle(".markdown-body th,\n.markdown-body td", {
  minWidth: "96px",
  padding: "7px 9px",
  border: "1px solid #dfe3e8",
  textAlign: "left",
  verticalAlign: "top",
});

globalStyle(".markdown-body th", {
  background: "#f3f5f7",
  fontWeight: "700",
});

globalStyle(".markdown-body tr:nth-child(even) td", {
  background: "#fafbfc",
});

globalStyle(".markdown-body hr", {
  height: "1px",
  margin: "18px 0",
  border: "0",
  background: "#e1e5e9",
});

globalStyle(".markdown-body img", {
  maxWidth: "100%",
  borderRadius: "9px",
});

globalStyle(".markdown-body input[type=\"checkbox\"]", {
  margin: "0 6px 0 -18px",
  accentColor: "var(--blue)",
});

globalStyle(".assistant-message.pending p", {
  color: "var(--muted)",
});

globalStyle(".thinking-stage", {
  display: "flex",
  minHeight: "0",
  alignItems: "center",
  marginTop: "22px",
  color: "var(--muted)",
  fontSize: "14px",
  fontWeight: "450",
  fontVariantNumeric: "tabular-nums",
  lineHeight: "1.25",
});

globalStyle(".thinking-stage > span:first-child", {
  color: "transparent",
  backgroundImage:
    "linear-gradient(90deg, var(--muted) 0%, var(--muted) 40%, var(--ink) 50%, var(--muted) 60%, var(--muted) 100%)",
  backgroundPosition: "100% 50%",
  backgroundSize: "220% 100%",
  backgroundClip: "text",
  WebkitBackgroundClip: "text",
  animation: `${thinkingTextSweep} 1750ms linear infinite`,
  contain: "paint",
  transform: "translateZ(0)",
  willChange: "background-position",
  "@media": {
    "(prefers-reduced-motion: reduce)": {
      color: "var(--muted)",
      backgroundImage: "none",
      animation: "none",
    },
  },
});

globalStyle(".thinking-dots", {
  marginLeft: "4px",
  color: "var(--blue)",
  letterSpacing: "2px",
});

globalStyle(".stream-cursor", {
  display: "inline-block",
  width: "2px",
  height: "1em",
  marginLeft: "3px",
  verticalAlign: "-0.12em",
  borderRadius: "2px",
  background: "var(--blue)",
  animation: `${streamCursorBlink} 900ms steps(1) infinite`,
});

globalStyle(".agent-run", {
  marginTop: "24px",
});

globalStyle(".agent-run-heading", {
  borderBottom: "1px solid var(--line)",
});

globalStyle(".agent-run-toggle", {
  display: "inline-flex",
  minHeight: "0",
  alignItems: "center",
  gap: "6px",
  padding: "0 0 9px",
  color: "var(--muted)",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "13.5px",
  fontWeight: "450",
  fontStyle: "normal",
  fontVariantNumeric: "tabular-nums",
  lineHeight: "1.25",
});

globalStyle(".agent-run-toggle svg", {
  transition: "transform 150ms ease",
});

globalStyle(".agent-run.expanded .agent-run-toggle svg", {
  transform: "rotate(90deg)",
});

globalStyle(".agent-run-events", {
  display: "grid",
  gridTemplateRows: "0fr",
  overflow: "hidden",
  opacity: "0",
  transition:
    "grid-template-rows 200ms cubic-bezier(0.2, 0.75, 0.25, 1), opacity 150ms ease",
});

globalStyle(".agent-run.expanded .agent-run-events", {
  gridTemplateRows: "1fr",
  opacity: "1",
});

globalStyle(".agent-run-events-inner", {
  display: "flex",
  minHeight: "0",
  gap: "20px",
  flexDirection: "column",
  overflow: "hidden",
  padding: "0",
  transition: "padding 200ms cubic-bezier(0.2, 0.75, 0.25, 1)",
});

globalStyle(".agent-run.expanded .agent-run-events-inner", {
  padding: "20px 0 26px",
});

globalStyle(
  ".agent-run-toggle.is-running > span,\n.work-phase-toggle.shimmer-text > span,\n.tool-call-item > button.shimmer-text > span,\n.work-log-placeholder.shimmer-text",
  {
    color: "transparent",
    backgroundImage:
      "linear-gradient(90deg, var(--muted) 0%, var(--muted) 36%, var(--ink) 50%, var(--muted) 64%, var(--muted) 100%)",
    backgroundPosition: "100% 50%",
    backgroundSize: "220% 100%",
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    animation: `${thinkingTextSweep} 1750ms linear infinite`,
    "@media": {
      "(prefers-reduced-motion: reduce)": {
        color: "var(--muted)",
        backgroundImage: "none",
        animation: "none",
      },
    },
  },
);

globalStyle(".work-progress-message", {
  maxWidth: "100%",
  color: "var(--ink)",
});

globalStyle(".work-progress-message .markdown-body", {
  color: "var(--ink)",
  fontSize: "13px",
  lineHeight: "1.7",
});

globalStyle(".work-log-placeholder", {
  margin: "0",
  color: "var(--muted)",
  fontSize: "12px",
});

globalStyle(".work-phase", {
  minWidth: "0",
});

globalStyle(".work-phase-toggle", {
  display: "inline-flex",
  maxWidth: "100%",
  minHeight: "24px",
  alignItems: "center",
  gap: "5px",
  padding: "0",
  color: "var(--ink)",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: "450",
  lineHeight: "1.55",
  textAlign: "left",
});

globalStyle(".work-phase-toggle > span", {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".work-phase-chevron", {
  flex: "0 0 auto",
  color: "var(--subtle)",
  transform: "rotate(-90deg)",
  transition: "transform 160ms cubic-bezier(0.2, 0.75, 0.25, 1)",
});

globalStyle(".work-phase.expanded .work-phase-chevron", {
  transform: "rotate(0deg)",
});

globalStyle(".work-phase-steps", {
  display: "grid",
  gridTemplateRows: "0fr",
  overflow: "hidden",
  opacity: "0",
  transition:
    "grid-template-rows 190ms cubic-bezier(0.2, 0.75, 0.25, 1), opacity 140ms ease",
});

globalStyle(".work-phase.expanded .work-phase-steps", {
  gridTemplateRows: "1fr",
  opacity: "1",
});

globalStyle(".work-phase-steps-inner", {
  minHeight: "0",
  margin: "0 0 0 3px",
  padding: "0 0 0 15px",
  overflow: "hidden",
  borderLeft: "1px solid color-mix(in srgb, var(--line) 82%, transparent)",
  transition: "margin 190ms cubic-bezier(0.2, 0.75, 0.25, 1)",
});

globalStyle(".work-phase.expanded .work-phase-steps-inner", {
  marginTop: "6px",
  marginBottom: "3px",
});

globalStyle(".tool-group", {
  minWidth: "0",
});

globalStyle(".tool-group-toggle", {
  display: "inline-flex",
  maxWidth: "100%",
  alignItems: "center",
  gap: "7px",
  padding: "0",
  color: "var(--muted)",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "12.5px",
  lineHeight: "1.5",
  textAlign: "left",
});

globalStyle(".tool-group-toggle > span", {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".tool-group-toggle .tool-group-chevron", {
  flex: "0 0 auto",
  transform: "rotate(-90deg)",
  transition: "transform 150ms ease",
});

globalStyle(".tool-group.expanded > .tool-group-toggle .tool-group-chevron", {
  transform: "rotate(0deg)",
});

globalStyle(".tool-call-list", {
  display: "grid",
  gridTemplateRows: "0fr",
  overflow: "hidden",
  opacity: "0",
  transition:
    "grid-template-rows 200ms cubic-bezier(0.2, 0.75, 0.25, 1), opacity 150ms ease",
});

globalStyle(".tool-group.expanded > .tool-call-list", {
  gridTemplateRows: "1fr",
  opacity: "1",
});

globalStyle(".tool-call-list-inner", {
  display: "grid",
  minHeight: "0",
  maxHeight: "316px",
  gap: "0",
  marginTop: "0",
  padding: "0 12px 0 0",
  overflowY: "auto",
  scrollbarWidth: "thin",
  scrollbarColor: "color-mix(in srgb, var(--subtle) 34%, transparent) transparent",
  transition:
    "margin 200ms cubic-bezier(0.2, 0.75, 0.25, 1), padding 200ms cubic-bezier(0.2, 0.75, 0.25, 1)",
});

globalStyle(".tool-group.expanded .tool-call-list-inner", {
  marginTop: "8px",
  paddingBottom: "3px",
  paddingTop: "1px",
});

globalStyle(".tool-call-list-inner::-webkit-scrollbar", {
  width: "8px",
});

globalStyle(".tool-call-list-inner::-webkit-scrollbar-track", {
  background: "transparent",
});

globalStyle(".tool-call-list-inner::-webkit-scrollbar-thumb", {
  border: "2px solid transparent",
  borderRadius: "999px",
  background:
    "color-mix(in srgb, var(--subtle) 34%, transparent) padding-box",
});

globalStyle(".tool-call-item", {
  minWidth: "0",
});

globalStyle(".tool-call-item > button", {
  display: "grid",
  width: "100%",
  minWidth: "0",
  gridTemplateColumns: "18px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "7px",
  padding: "4px 0",
  color: "var(--muted)",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "12px",
  lineHeight: "1.55",
  textAlign: "left",
});

globalStyle(".tool-call-review-chevron", {
  color: "var(--subtle)",
});

globalStyle(".tool-call-item > button > span", {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".tool-call-item > button:hover", {
  color: "var(--ink)",
});

globalStyle(".tool-call-detail", {
  display: "grid",
  minHeight: "0",
  gap: "10px",
  margin: "0 0 0 25px",
  padding: "0",
  overflow: "hidden",
  border: "0",
  background: "transparent",
  transition: "margin 200ms cubic-bezier(0.2, 0.75, 0.25, 1)",
});

globalStyle(".tool-call-detail-region", {
  display: "grid",
  gridTemplateRows: "0fr",
  overflow: "hidden",
  opacity: "0",
  transition:
    "grid-template-rows 200ms cubic-bezier(0.2, 0.75, 0.25, 1), opacity 150ms ease",
});

globalStyle(".tool-call-item.expanded > .tool-call-detail-region", {
  gridTemplateRows: "1fr",
  opacity: "1",
});

globalStyle(".tool-call-item.expanded .tool-call-detail", {
  margin: "5px 0 14px 25px",
});

globalStyle(".tool-call-detail > div > span", {
  display: "block",
  marginBottom: "5px",
  color: "var(--subtle)",
  fontSize: "10.5px",
  fontWeight: "450",
});

globalStyle(".tool-call-detail pre", {
  maxHeight: "220px",
  margin: "0",
  padding: "10px 12px",
  overflow: "auto",
  color: "var(--muted)",
  border: "0",
  borderRadius: "6px",
  background: "color-mix(in srgb, var(--surface-soft) 74%, transparent)",
  boxShadow: "none",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});

globalStyle(".tool-call-detail-shell pre", {
  color: "var(--ink)",
  background: "var(--surface-soft)",
});

globalStyle(".tool-call-detail code", {
  fontFamily:
    'var(--code-font, "Cascadia Code", "SFMono-Regular", Consolas, monospace)',
  fontSize: "10px",
  lineHeight: "1.6",
});

globalStyle(".tool-call-detail footer", {
  display: "flex",
  gap: "12px",
  marginTop: "-2px",
  color: "var(--subtle)",
  fontSize: "9.5px",
});

globalStyle(".agent-run-event", {
  display: "grid",
  gridTemplateColumns: "18px minmax(0, 1fr)",
  alignItems: "start",
  gap: "7px",
  color: "var(--muted)",
});

globalStyle(".agent-run-event > span", {
  display: "grid",
  height: "20px",
  placeItems: "center",
  color: "var(--subtle)",
});

globalStyle(".agent-run-event strong", {
  display: "block",
  color: "var(--muted)",
  fontSize: "10.5px",
  fontWeight: "560",
  lineHeight: "1.55",
});

globalStyle(".agent-run-event p", {
  margin: "3px 0 0",
  color: "var(--subtle)",
  fontSize: "9.5px",
  lineHeight: "1.55",
});

globalStyle(".task-error-banner", {
  marginTop: "14px",
  padding: "11px 12px",
  color: "#a53330",
  border: "1px solid #efc8c6",
  borderRadius: "9px",
  background: "#fff2f2",
  fontSize: "10px",
});

globalStyle(".conversation-footer", {
  position: "absolute",
  zIndex: "12",
  right: "0",
  bottom: "0",
  left: "0",
  padding: "0 clamp(12px, 3vw, 38px) 18px clamp(12px, 3vw, 28px)",
  background: "transparent",
  pointerEvents: "none",
});

globalStyle(".conversation-footer::after", {
  position: "absolute",
  zIndex: "0",
  right: "0",
  bottom: "0",
  left: "0",
  height: "38px",
  background: "var(--surface)",
  content: '""',
});

globalStyle(".approval-dock,\n.conversation-composer-wrap", {
  pointerEvents: "auto",
});

globalStyle(".conversation-composer-wrap", {
  position: "relative",
});

globalStyle(".scroll-to-bottom", {
  position: "absolute",
  zIndex: "3",
  top: "-48px",
  left: "50%",
  display: "grid",
  width: "36px",
  height: "36px",
  padding: "0",
  placeItems: "center",
  color: "var(--ink)",
  border: "1px solid var(--line-strong)",
  borderRadius: "50%",
  outline: "0",
  background: "var(--surface)",
  boxShadow: "0 5px 16px rgb(28 35 45 / 12%)",
  cursor: "pointer",
  transform: "translateX(-50%)",
});

globalStyle(".scroll-to-bottom:hover", {
  color: "var(--ink)",
  borderColor: "var(--subtle)",
});

globalStyle(".scroll-to-bottom:focus-visible", {
  outline: "2px solid var(--blue)",
  outlineOffset: "2px",
});

globalStyle(".scroll-to-bottom-dots", {
  display: "flex",
  height: "8px",
  alignItems: "center",
  gap: "3px",
});

globalStyle(".scroll-to-bottom-dots i", {
  display: "block",
  width: "4px",
  height: "4px",
  borderRadius: "50%",
  background: "currentColor",
  animation: `${bottomStatusDot} 900ms ease-in-out infinite`,
});

globalStyle(".scroll-to-bottom-dots i:nth-child(2)", {
  animationDelay: "120ms",
});

globalStyle(".scroll-to-bottom-dots i:nth-child(3)", {
  animationDelay: "240ms",
});

globalStyle(".follow-up-composer", {
  width: "100%",
  minWidth: "0",
  padding: "12px 13px 11px",
  border: "1px solid color-mix(in srgb, var(--line) 58%, transparent)",
  borderRadius: "20px",
  background: "#f8f9fb",
  boxShadow: "0 1px 4px rgb(28 35 45 / 8%)",
});

globalStyle(".follow-up-composer textarea", {
  minHeight: "46px",
  maxHeight: "180px",
  padding: "0 2px",
  fontSize: "12px",
  lineHeight: "1.55",
  overflowY: "hidden",
});

globalStyle(".follow-up-composer > .composer-toolbar", {
  display: "flex",
  minWidth: "0",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
});

globalStyle(".composer-attach", {
  flex: "0 1 auto",
  minWidth: "30px",
  whiteSpace: "nowrap",
});

globalStyle(".composer-controls", {
  display: "flex",
  minWidth: "0",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "3px",
});

globalStyle(".context-usage-control", {
  position: "relative",
  display: "grid",
  width: "16px",
  minWidth: "16px",
  maxWidth: "16px",
  height: "16px",
  minHeight: "16px",
  maxHeight: "16px",
  aspectRatio: "1 / 1",
  flex: "none",
  alignSelf: "center",
  margin: "0 5px 0 2px",
  placeItems: "center",
  overflow: "visible",
});

globalStyle(".context-usage-ring", {
  display: "block",
  width: "16px",
  height: "16px",
  borderRadius: "50%",
  outline: "0",
  lineHeight: "0",
  contain: "size layout paint",
  cursor: "help",
});

globalStyle(".context-usage-ring svg", {
  display: "block",
  width: "100%",
  height: "100%",
  overflow: "visible",
});

globalStyle(".context-usage-track, .context-usage-value", {
  fill: "none",
  strokeWidth: "2.5",
  vectorEffect: "non-scaling-stroke",
});

globalStyle(".context-usage-track", {
  stroke: "color-mix(in srgb, var(--subtle) 30%, transparent)",
});

globalStyle(".context-usage-value", {
  stroke: "var(--muted)",
  strokeLinecap: "round",
  transform: "rotate(-90deg)",
  transformBox: "fill-box",
  transformOrigin: "center",
});

globalStyle(".context-usage-tooltip", {
  position: "absolute",
  zIndex: "40",
  bottom: "calc(100% + 12px)",
  left: "50%",
  display: "grid",
  width: "max-content",
  minWidth: "202px",
  maxWidth: "216px",
  minHeight: "86px",
  alignContent: "center",
  justifyItems: "center",
  padding: "8px 8px 9px",
  color: "#f2f2f2",
  border: "1px solid #414141",
  borderRadius: "14px",
  background: "#2c2c2c",
  boxShadow: "0 12px 30px rgb(0 0 0 / 22%)",
  opacity: "0",
  pointerEvents: "none",
  transform: "translate(-50%, 4px)",
  transition: "opacity 120ms ease, transform 140ms ease",
  fontFamily: "inherit",
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "-0.012em",
  whiteSpace: "nowrap",
});

globalStyle(".context-usage-tooltip > span", {
  color: "#a7a7a7",
  fontSize: "12.5px",
  fontWeight: "520",
  lineHeight: "1.2",
});

globalStyle(".context-usage-tooltip strong", {
  marginTop: "2px",
  color: "#a7a7a7",
  fontSize: "12.5px",
  fontWeight: "520",
  lineHeight: "1.2",
});

globalStyle(".context-usage-tooltip b", {
  marginTop: "7px",
  color: "#f4f4f4",
  fontSize: "12.5px",
  fontWeight: "620",
  lineHeight: "1.24",
});

globalStyle(
  ".context-usage-control:hover .context-usage-tooltip, .context-usage-control:focus-within .context-usage-tooltip",
  {
    opacity: "1",
    transform: "translate(-50%, 0)",
  },
);

globalStyle(".composer-select", {
  position: "relative",
  display: "flex",
  minWidth: "0",
  height: "30px",
  alignItems: "center",
  color: "var(--ink)",
});

globalStyle(".composer-select select", {
  width: "100%",
  height: "30px",
  padding: "0 18px 0 5px",
  overflow: "hidden",
  color: "inherit",
  border: "0",
  outline: "0",
  appearance: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: "14px",
  textOverflow: "ellipsis",
});

globalStyle(".composer-select > svg", {
  position: "absolute",
  right: "3px",
  color: "var(--muted)",
  pointerEvents: "none",
});

globalStyle(".model-select", {
  width: "112px",
  maxWidth: "28vw",
});

globalStyle(".reasoning-select", {
  width: "48px",
  flex: "0 0 48px",
});

globalStyle(".composer-attach span", {
  "@media": {
    "(max-width: 720px)": {
      display: "none",
    },
  },
});

globalStyle(".model-select", {
  "@media": {
    "(max-width: 560px)": {
      width: "88px",
      maxWidth: "88px",
    },
  },
});

globalStyle(".follow-up-composer .send-follow-up", {
  width: "32px",
  height: "32px",
  padding: "0",
  color: "var(--surface)",
  border: "0",
  borderRadius: "50%",
  background: "var(--ink)",
  boxShadow: "none",
});

globalStyle(
  ".follow-up-composer .send-follow-up:hover:not(:disabled)",
  {
    color: "var(--surface)",
    borderColor: "transparent",
    background: "var(--ink)",
  },
);

globalStyle(".follow-up-composer .send-follow-up.is-stopping svg", {
  borderRadius: "1px",
});

globalStyle(".follow-up-composer .send-follow-up:disabled,\n.submit-task:disabled", {
  cursor: "not-allowed",
  opacity: "0.45",
  transform: "none",
});

globalStyle(".approval-dock", {
  marginBottom: "9px",
});

globalStyle(".approval-content", {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "10px",
  padding: "10px 11px",
  color: "#69430f",
  border: "1px solid #efcf96",
  borderRadius: "11px",
  background: "var(--amber-soft)",
});

globalStyle(".approval-icon", {
  display: "grid",
  width: "31px",
  height: "31px",
  placeItems: "center",
  color: "var(--amber)",
  borderRadius: "9px",
  background: "#ffedcd",
});

globalStyle(".approval-content strong", {
  display: "block",
  fontSize: "10px",
});

globalStyle(".approval-content p", {
  margin: "3px 0",
  fontSize: "9px",
});

globalStyle(".approval-content small", {
  fontSize: "8px",
});

globalStyle(".approval-actions", {
  display: "flex",
  alignItems: "center",
  gap: "6px",
});

globalStyle(".approval-actions button", {
  minHeight: "31px",
  padding: "0 10px",
  border: "1px solid #d6b978",
  borderRadius: "7px",
  background: "#fff",
  cursor: "pointer",
  fontSize: "9px",
});

globalStyle(".approval-actions button.allow", {
  color: "#fff",
  borderColor: "#d97900",
  background: "#e88710",
});

globalStyle(".review-pane", {
  position: "relative",
  display: "grid",
  width: "var(--review-width)",
  minWidth: "var(--review-width)",
  minHeight: "0",
  gridTemplateRows: "52px 44px auto minmax(0, 1fr)",
  borderLeft: "1px solid var(--line)",
  background: "var(--surface)",
});

globalStyle(".review-resize-handle", {
  position: "absolute",
  zIndex: "3",
  top: "0",
  bottom: "0",
  left: "-4px",
  width: "8px",
  cursor: "col-resize",
  touchAction: "none",
});

globalStyle(".review-resize-handle::after", {
  position: "absolute",
  top: "0",
  bottom: "0",
  left: "3px",
  width: "1px",
  background: "transparent",
  content: "\"\"",
  transition: "background 120ms ease",
});

globalStyle(
  ".review-resize-handle:hover::after,\n.resizing-review-pane .review-resize-handle::after",
  {
    background: "var(--blue)",
  },
);

globalStyle(".review-header", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 12px 0 16px",
  borderBottom: "1px solid var(--line)",
});

globalStyle(".review-header > div", {
  display: "flex",
  alignItems: "center",
  gap: "8px",
});

globalStyle(".review-header strong", {
  fontSize: "11px",
});

globalStyle(".review-header button", {
  display: "grid",
  width: "29px",
  height: "29px",
  padding: "0",
  placeItems: "center",
  color: "var(--muted)",
  border: "0",
  borderRadius: "7px",
  background: "transparent",
  cursor: "pointer",
});

globalStyle(".review-header button:hover", {
  color: "var(--ink)",
  background: "var(--surface-soft)",
});

globalStyle(".review-toolbar", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 15px",
  borderBottom: "1px solid var(--line)",
});

globalStyle(".review-toolbar button", {
  padding: "0",
  color: "var(--muted)",
  border: "0",
  background: "transparent",
  fontSize: "10px",
});

globalStyle(".review-toolbar button.active", {
  color: "var(--ink)",
  fontWeight: "650",
});

globalStyle(".review-toolbar span", {
  color: "var(--subtle)",
  fontSize: "9px",
});

globalStyle(".review-file-list", {
  display: "flex",
  minWidth: "0",
  gridRow: "3",
  gap: "3px",
  padding: "7px 10px",
  overflowX: "auto",
  borderBottom: "1px solid var(--line)",
  scrollbarWidth: "none",
});

globalStyle(".review-file-list::-webkit-scrollbar", {
  display: "none",
});

globalStyle(".review-file-list button", {
  display: "inline-flex",
  maxWidth: "190px",
  flex: "0 0 auto",
  alignItems: "center",
  gap: "6px",
  padding: "6px 8px",
  color: "var(--muted)",
  border: "0",
  borderRadius: "5px",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "10px",
});

globalStyle(".review-file-list button span", {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".review-file-list button.active", {
  color: "var(--ink)",
  background: "var(--surface-soft)",
});

globalStyle(".review-change-preview", {
  display: "grid",
  minHeight: "0",
  gridRow: "4",
  gridTemplateRows: "55px minmax(0, 1fr)",
});

globalStyle(".review-change-preview > header", {
  display: "flex",
  minWidth: "0",
  justifyContent: "center",
  flexDirection: "column",
  gap: "3px",
  padding: "0 15px",
  borderBottom: "1px solid var(--line)",
});

globalStyle(".review-change-preview > header strong", {
  overflow: "hidden",
  fontSize: "11px",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".review-change-preview > header span", {
  overflow: "hidden",
  color: "var(--subtle)",
  fontSize: "9px",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".review-diff", {
  minHeight: "0",
  padding: "12px 0 28px",
  overflow: "auto",
  background: "color-mix(in srgb, var(--surface-soft) 28%, transparent)",
});

globalStyle(".review-diff-block + .review-diff-block", {
  marginTop: "8px",
});

globalStyle(".review-diff-line", {
  display: "grid",
  minWidth: "max-content",
  gridTemplateColumns: "28px minmax(0, 1fr)",
  fontSize: "10px",
  lineHeight: "1.65",
});

globalStyle(".review-diff-line > span", {
  paddingLeft: "12px",
  color: "var(--subtle)",
  userSelect: "none",
});

globalStyle(".review-diff-line code", {
  padding: "0 14px 0 4px",
  fontFamily:
    'var(--code-font, "Cascadia Code", "SFMono-Regular", Consolas, monospace)',
  whiteSpace: "pre",
});

globalStyle(".review-diff-block.removed .review-diff-line", {
  color: "color-mix(in srgb, #ffb4b4 82%, var(--ink))",
  background: "color-mix(in srgb, #d84b4b 10%, transparent)",
});

globalStyle(".review-diff-block.added .review-diff-line", {
  color: "color-mix(in srgb, #a9dfbd 82%, var(--ink))",
  background: "color-mix(in srgb, #3d9b62 11%, transparent)",
});

globalStyle(".review-preview-unavailable", {
  display: "flex",
  minHeight: "0",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  padding: "30px",
  color: "var(--muted)",
  textAlign: "center",
});

globalStyle(".review-preview-unavailable strong", {
  marginTop: "11px",
  color: "var(--ink)",
  fontSize: "11px",
});

globalStyle(".review-preview-unavailable p", {
  maxWidth: "250px",
  margin: "6px 0 0",
  fontSize: "9px",
  lineHeight: "1.55",
});

globalStyle(".review-empty", {
  display: "flex",
  minHeight: "0",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  padding: "30px",
  textAlign: "center",
  gridRow: "3 / 5",
});

globalStyle(".review-empty > span", {
  display: "grid",
  width: "42px",
  height: "42px",
  placeItems: "center",
  color: "var(--muted)",
  border: "1px solid var(--line)",
  borderRadius: "11px",
  background: "var(--surface-soft)",
});

globalStyle(".review-empty strong", {
  marginTop: "13px",
  fontSize: "11px",
});

globalStyle(".review-empty p", {
  maxWidth: "230px",
  margin: "7px 0 0",
  color: "var(--muted)",
  fontSize: "9px",
  lineHeight: "1.55",
});

globalStyle("body.resizing-review-pane", {
  cursor: "col-resize",
  userSelect: "none",
});
