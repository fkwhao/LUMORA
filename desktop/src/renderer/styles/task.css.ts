import { globalStyle, keyframes } from "@vanilla-extract/css";

const streamCursorBlink = keyframes({
  "0%, 45%": { opacity: 1 },
  "46%, 100%": { opacity: 0 },
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

globalStyle(".task-workspace", {
  display: "flex",
  minWidth: "0",
  minHeight: "0",
  overflow: "hidden",
  border: "0",
  borderRadius: "0",
  background: "var(--surface)",
  boxShadow: "none",
});

globalStyle(".conversation-pane", {
  display: "grid",
  gridTemplateRows: "minmax(0, 1fr) auto",
  flex: "1 1 auto",
  minWidth: "0",
  minHeight: "0",
  borderRight: "1px solid var(--line)",
});

globalStyle(".conversation-scroll", {
  minHeight: "0",
  padding: "28px 28px 22px",
  overflow: "auto",
});

globalStyle(".conversation-content,\n.conversation-footer-inner", {
  width: "min(100%, 920px)",
  margin: "0 auto",
});

globalStyle(".user-message-group", {
  width: "fit-content",
  marginLeft: "auto",
  maxWidth: "min(72%, 620px)",
  marginTop: "22px",
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
  minHeight: "25px",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "5px",
  padding: "2px 4px 0",
  color: "var(--subtle)",
  fontSize: "9.5px",
  lineHeight: "1",
});

globalStyle(".user-message-meta time:empty", {
  display: "none",
});

globalStyle(".user-message-actions", {
  display: "inline-flex",
  alignItems: "center",
  gap: "1px",
  opacity: "0",
  transform: "translateY(-2px)",
  transition:
    "opacity 140ms ease, transform 180ms cubic-bezier(0.2, 0.75, 0.25, 1)",
});

globalStyle(
  ".user-message-group:hover .user-message-actions,\n.user-message-group:focus-within .user-message-actions",
  {
    opacity: "1",
    transform: "translateY(0)",
  },
);

globalStyle(".user-message-actions button", {
  display: "grid",
  width: "24px",
  height: "24px",
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
  resize: "vertical",
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
  marginTop: "26px",
  borderBottom: "1px solid var(--line)",
});

globalStyle(".agent-run-toggle", {
  display: "inline-flex",
  minHeight: "34px",
  alignItems: "center",
  gap: "5px",
  padding: "0",
  color: "var(--muted)",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  fontFamily: 'Georgia, "Noto Serif SC", serif',
  fontSize: "11px",
  fontStyle: "italic",
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
  opacity: "0",
  transition:
    "grid-template-rows 200ms cubic-bezier(0.2, 0.75, 0.25, 1), opacity 150ms ease",
});

globalStyle(".agent-run.expanded .agent-run-events", {
  gridTemplateRows: "1fr",
  opacity: "1",
});

globalStyle(".agent-run-events-inner", {
  display: "grid",
  minHeight: "0",
  gap: "12px",
  overflow: "hidden",
  padding: "5px 0 16px",
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
  padding: "12px 28px 18px",
  background: "linear-gradient(transparent, #fff 20%)",
});

globalStyle(".follow-up-composer", {
  padding: "12px 13px 11px",
  border: "1px solid var(--line-strong)",
  borderRadius: "20px",
  background: "#f8f9fb",
  boxShadow: "0 10px 32px rgb(28 35 45 / 8%)",
});

globalStyle(".follow-up-composer textarea", {
  minHeight: "46px",
  padding: "0 2px",
  fontSize: "12px",
  lineHeight: "1.55",
});

globalStyle(".follow-up-composer > div", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
});

globalStyle(".follow-up-composer .send-follow-up", {
  width: "32px",
  height: "32px",
  padding: "0",
  color: "#fff",
  border: "0",
  background: "var(--blue)",
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
  gridTemplateRows: "52px 44px minmax(0, 1fr)",
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

globalStyle(".review-empty", {
  display: "flex",
  minHeight: "0",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  padding: "30px",
  textAlign: "center",
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
