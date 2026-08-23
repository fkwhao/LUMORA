import { globalStyle, keyframes } from "@vanilla-extract/css";

const composerFromCenter = keyframes({
  from: {
    opacity: "0.82",
    transform: "translateY(-32vh) scaleX(1.07) scaleY(1.18)",
  },
  to: { opacity: "1", transform: "translateY(0) scale(1)" },
});

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

const toolApprovalFadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const toolApprovalRiseIn = keyframes({
  from: { opacity: 0, transform: "translateY(6px) scale(.99)" },
  to: { opacity: 1, transform: "translateY(0) scale(1)" },
});

const composerMenuIn = keyframes({
  from: { opacity: 0, transform: "translateY(4px) scale(.985)" },
  to: { opacity: 1, transform: "translateY(0) scale(1)" },
});

const artifactSpin = keyframes({
  to: { transform: "rotate(360deg)" },
});

const historyHydrationSweep = keyframes({
  from: { transform: "translateX(-115%)" },
  to: { transform: "translateX(335%)" },
});

globalStyle(".task-layout", {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gridTemplateRows: "44px minmax(0, 1fr)",
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
  width: "100%",
  gridColumn: "1",
  gridRow: "1",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: "44px",
  height: "44px",
  boxSizing: "border-box",
  gap: "20px",
  padding: "5px 52px 5px 12px",
  borderBottom: "1px solid var(--line)",
  transition: "width 220ms cubic-bezier(0.22, 0.82, 0.24, 1)",
  willChange: "width",
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

globalStyle(".task-title-copy", {
  position: "relative",
  display: "flex",
  width: "min(420px, 42vw)",
  minWidth: "0",
  height: "30px",
  flex: "0 1 420px",
  alignItems: "center",
  overflow: "hidden",
});

globalStyle(".task-title-row h1", {
  position: "relative",
  zIndex: "2",
  width: "100%",
  maxWidth: "100%",
  flex: "0 1 100%",
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

globalStyle(".task-project-folder", {
  display: "grid",
  width: "30px",
  height: "30px",
  flex: "0 0 auto",
  placeItems: "center",
  color: "var(--muted)",
});

globalStyle(".task-stage", {
  display: "flex",
  width: "100%",
  gridColumn: "1",
  gridRow: "2",
  minWidth: "0",
  minHeight: "0",
  overflow: "hidden",
  border: "0",
  borderRadius: "0",
  background: "var(--aui-background, var(--surface))",
  boxShadow: "none",
  transition: "width 220ms cubic-bezier(0.22, 0.82, 0.24, 1)",
  willChange: "width",
});

globalStyle(".task-layout.has-right-sidebar .task-header, .task-layout.has-right-sidebar .task-stage", {
  width: "calc(100% - var(--context-pane-width))",
});

globalStyle(".question-rail", {
  position: "relative",
  zIndex: "8",
  display: "block",
  width: "42px",
  minWidth: "42px",
  minHeight: "0",
  padding: "18px 0",
  overflow: "visible",
  background: "var(--aui-background, var(--surface))",
});

globalStyle(".question-rail::before, .question-rail::after", {
  position: "absolute",
  zIndex: "4",
  right: "0",
  left: "0",
  height: "16px",
  content: '""',
  opacity: "0",
  pointerEvents: "none",
  transition: "opacity 160ms ease",
});

globalStyle(".question-rail::before", {
  top: "0",
  background:
    "linear-gradient(to bottom, var(--aui-background, var(--surface)) 18%, color-mix(in srgb, var(--aui-background, var(--surface)) 76%, transparent) 54%, transparent)",
});

globalStyle(".question-rail::after", {
  bottom: "0",
  background:
    "linear-gradient(to top, var(--aui-background, var(--surface)) 18%, color-mix(in srgb, var(--aui-background, var(--surface)) 76%, transparent) 54%, transparent)",
});

globalStyle(".question-rail.can-scroll-up::before", {
  opacity: "1",
});

globalStyle(".question-rail.can-scroll-down::after", {
  opacity: "1",
});

globalStyle(".question-rail-track", {
  position: "relative",
  width: "100%",
  height: "100%",
  padding: "0",
  overflowY: "auto",
  overflowX: "hidden",
  overscrollBehaviorY: "contain",
  scrollbarWidth: "none",
  touchAction: "pan-y",
  userSelect: "none",
});

globalStyle(".question-rail-track::-webkit-scrollbar", {
  width: "0",
  height: "0",
});

globalStyle(".question-rail-list", {
  display: "flex",
  width: "100%",
  minHeight: "100%",
  boxSizing: "border-box",
  alignItems: "center",
  flexDirection: "column",
  justifyContent: "safe center",
  padding: "12px 0",
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
  position: "fixed",
  zIndex: "80",
  top: "var(--question-rail-tooltip-top, 50%)",
  left: "var(--question-rail-tooltip-left, 50px)",
  display: "grid",
  width: "min(328px, 36vw)",
  gap: "7px",
  padding: "11px 13px 12px",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: "13px",
  background: "rgb(255 255 255 / 97%)",
  backdropFilter: "blur(18px) saturate(115%)",
  boxShadow: "0 16px 40px rgb(30 35 40 / 13%)",
  opacity: "0",
  visibility: "hidden",
  pointerEvents: "none",
  transform: "translate(0, -50%)",
  transition: "none",
});

globalStyle(
  ".question-rail-item:hover .question-rail-tooltip,\n.question-rail-item:focus-visible .question-rail-tooltip",
  {
    opacity: "1",
    visibility: "visible",
  },
);

globalStyle(".question-rail-tooltip strong", {
  display: "-webkit-box",
  overflow: "hidden",
  color: "var(--ink)",
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
  color: "var(--muted)",
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

globalStyle(".conversation-plan-float", {
  position: "absolute",
  top: "14px",
  right: "clamp(16px, 2.5vw, 28px)",
  zIndex: "12",
  width: "min(320px, calc(100% - 32px))",
  maxHeight: "calc(100% - 28px)",
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "flex-start",
  overflow: "auto",
});

globalStyle(".conversation-scroll", {
  height: "100%",
  minHeight: "0",
  padding:
    "28px clamp(12px, 3vw, 28px) calc(var(--conversation-footer-height, 126px) + 18px)",
  overflow: "auto",
  scrollbarGutter: "stable",
});

globalStyle(
  '.conversation-scroll.is-restoring-position, [data-slot="aui_thread-viewport"].is-restoring-position',
  {
    opacity: "0",
    pointerEvents: "none",
  },
);

globalStyle(".history-hydration-status", {
  position: "absolute",
  top: "10px",
  left: "50%",
  zIndex: "8",
  display: "grid",
  width: "178px",
  gridTemplateColumns: "1fr",
  gap: "6px",
  padding: "8px 11px 7px",
  border: "1px solid color-mix(in srgb, var(--ink) 10%, transparent)",
  borderRadius: "11px",
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--surface) 97%, var(--ink) 3%), color-mix(in srgb, var(--surface) 91%, transparent))",
  color: "var(--muted)",
  boxShadow: "0 8px 26px rgb(15 23 42 / 9%), inset 0 1px rgb(255 255 255 / 28%)",
  backdropFilter: "blur(14px) saturate(1.08)",
  transform: "translateX(-50%)",
  pointerEvents: "none",
});

globalStyle(".history-hydration-status::before", {
  position: "absolute",
  top: "10px",
  left: "11px",
  width: "5px",
  height: "5px",
  borderRadius: "50%",
  background: "var(--accent)",
  boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 13%, transparent)",
  content: "\"\"",
});

globalStyle(".history-hydration-label", {
  paddingLeft: "14px",
  color: "color-mix(in srgb, var(--ink) 72%, var(--muted))",
  fontSize: "9.5px",
  fontWeight: "620",
  letterSpacing: "0.01em",
  lineHeight: "1",
  whiteSpace: "nowrap",
});

globalStyle(".history-hydration-track", {
  position: "relative",
  height: "2.5px",
  overflow: "hidden",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--muted) 16%, transparent)",
});

globalStyle(".history-hydration-track > i", {
  position: "absolute",
  inset: "0 auto 0 0",
  borderRadius: "inherit",
  background:
    "linear-gradient(90deg, color-mix(in srgb, var(--accent) 62%, var(--ink)), var(--accent))",
  transition: "width 90ms linear",
});

globalStyle(".history-hydration-status.is-indeterminate .history-hydration-track > i", {
  width: "28%",
  animation: `${historyHydrationSweep} 850ms linear infinite`,
});

globalStyle(".conversation-scroll::-webkit-scrollbar", {
  width: "10px",
});

globalStyle(".conversation-scroll::-webkit-scrollbar-track", {
  background: "transparent",
});

globalStyle(".conversation-content,\n.conversation-footer-inner", {
  width: "min(100%, 726px)",
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
  background: "var(--message-bubble)",
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
  minHeight: "24px",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "8px",
  padding: "3px 12px 0 0",
  color: "var(--subtle)",
  fontSize: "11px",
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
  fontSize: "11px",
  fontWeight: "450",
  fontVariantNumeric: "tabular-nums",
  lineHeight: "1.4",
});

globalStyle(".user-message-actions", {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
});

globalStyle(".user-message-actions button", {
  display: "grid",
  width: "22px",
  height: "22px",
  padding: "0",
  placeItems: "center",
  color: "var(--subtle)",
  border: "0",
  borderRadius: "6px",
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

globalStyle(".assistant-message-group", {
  maxWidth: "100%",
});

globalStyle(".assistant-message-meta", {
  display: "flex",
  minHeight: "26px",
  alignItems: "center",
  gap: "8px",
  paddingTop: "3px",
  color: "var(--subtle)",
  opacity: "0",
  transition: "opacity 120ms ease",
});

globalStyle(
  ".assistant-message-group:hover .assistant-message-meta, .assistant-message-group:focus-within .assistant-message-meta",
  {
    opacity: "1",
  },
);

globalStyle(".assistant-message-meta time", {
  color: "var(--subtle)",
  fontSize: "11px",
  fontWeight: "450",
  fontVariantNumeric: "tabular-nums",
  lineHeight: "1.4",
  whiteSpace: "nowrap",
});

globalStyle(".assistant-message-meta time:empty", {
  display: "none",
});

globalStyle(".assistant-message-actions", {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
});

globalStyle(".assistant-message-actions button", {
  display: "grid",
  width: "22px",
  height: "22px",
  padding: "0",
  placeItems: "center",
  color: "var(--subtle)",
  border: "0",
  borderRadius: "6px",
  background: "transparent",
  cursor: "pointer",
  transition: "color 120ms ease, background 120ms ease",
});

globalStyle(
  ".assistant-message-actions button:hover, .assistant-message-actions button.active",
  {
    color: "var(--ink)",
    background: "var(--surface-soft)",
  },
);

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
  color: "inherit",
  border: "1px solid #d0d7de",
  borderRadius: "5px",
  background: "rgb(175 184 193 / 20%)",
  fontFamily:
    'var(--code-font, "Cascadia Code", "SFMono-Regular", Consolas, monospace)',
  fontSize: "0.9em",
});

globalStyle(".markdown-body pre", {
  margin: "0",
  padding: "15px 16px 17px",
  overflow: "auto",
  color: "#1f2328",
  border: "0",
  borderRadius: "0",
  background: "var(--message-bubble)",
  boxShadow: "none",
  lineHeight: "1.6",
  tabSize: "2",
});

globalStyle(".markdown-code-block", {
  margin: "14px 0",
  overflow: "hidden",
  border: "1px solid #d0d7de",
  borderRadius: "11px",
  background: "var(--message-bubble)",
  boxShadow:
    "0 1px 2px rgb(31 35 40 / 8%), inset 0 1px 0 rgb(255 255 255 / 60%)",
});

globalStyle(".markdown-code-toolbar", {
  display: "flex",
  minHeight: "34px",
  padding: "0 9px 0 13px",
  alignItems: "center",
  justifyContent: "space-between",
  color: "#57606a",
  borderBottom: "1px solid #d8dee4",
  background: "var(--message-bubble)",
  fontFamily: "var(--ui-font)",
  fontSize: "10px",
  fontWeight: "500",
  lineHeight: "1",
});

globalStyle(".markdown-code-toolbar > span", {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".markdown-code-toolbar button", {
  display: "inline-flex",
  minHeight: "26px",
  padding: "0 6px",
  alignItems: "center",
  gap: "5px",
  color: "#57606a",
  border: "0",
  borderRadius: "6px",
  background: "transparent",
  cursor: "pointer",
  fontSize: "10px",
  fontWeight: "500",
  transition: "color 140ms ease, background-color 140ms ease",
});

globalStyle(".markdown-code-toolbar button:hover", {
  color: "#24292f",
  background: "rgb(175 184 193 / 24%)",
});

globalStyle(".markdown-code-toolbar button.is-copied", {
  color: "#1a7f37",
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
  color: "#81878d",
  fontStyle: "italic",
});

globalStyle(
  ".markdown-body .hljs-keyword,\n.markdown-body .hljs-selector-tag,\n.markdown-body .hljs-literal,\n.markdown-body .hljs-type,\n.markdown-body .hljs-name,\n.markdown-body .hljs-tag",
  { color: "#7d5964" },
);

globalStyle(
  ".markdown-body .hljs-string,\n.markdown-body .hljs-regexp,\n.markdown-body .hljs-addition,\n.markdown-body .hljs-attribute,\n.markdown-body .hljs-template-tag",
  { color: "#587064" },
);

globalStyle(
  ".markdown-body .hljs-number,\n.markdown-body .hljs-symbol,\n.markdown-body .hljs-bullet,\n.markdown-body .hljs-link",
  { color: "#5f7085" },
);

globalStyle(
  ".markdown-body .hljs-title,\n.markdown-body .hljs-section,\n.markdown-body .hljs-function,\n.markdown-body .hljs-selector-class,\n.markdown-body .hljs-selector-id",
  { color: "#69617c" },
);

globalStyle(
  ".markdown-body .hljs-variable,\n.markdown-body .hljs-template-variable,\n.markdown-body .hljs-params,\n.markdown-body .hljs-attr,\n.markdown-body .hljs-property",
  { color: "#786653" },
);

globalStyle(
  ".markdown-body .hljs-built_in,\n.markdown-body .hljs-meta,\n.markdown-body .hljs-class .hljs-title,\n.markdown-body .hljs-doctag",
  { color: "#577174" },
);

globalStyle(".markdown-body .hljs-deletion", {
  color: "#79595d",
  background: "#f1e9e8",
});

globalStyle(".markdown-body pre code.language-diff", {
  color: "#1f2328",
});

globalStyle(".aui-md .hljs", {
  color: "#34383d",
});

globalStyle(".aui-md .hljs-comment,\n.aui-md .hljs-quote", {
  color: "#81878d",
  fontStyle: "italic",
});

globalStyle(
  ".aui-md .hljs-keyword,\n.aui-md .hljs-selector-tag,\n.aui-md .hljs-literal,\n.aui-md .hljs-type,\n.aui-md .hljs-name,\n.aui-md .hljs-tag",
  { color: "#7d5964" },
);

globalStyle(
  ".aui-md .hljs-string,\n.aui-md .hljs-regexp,\n.aui-md .hljs-addition,\n.aui-md .hljs-attribute,\n.aui-md .hljs-template-tag",
  { color: "#587064" },
);

globalStyle(
  ".aui-md .hljs-number,\n.aui-md .hljs-symbol,\n.aui-md .hljs-bullet,\n.aui-md .hljs-link",
  { color: "#5f7085" },
);

globalStyle(
  ".aui-md .hljs-title,\n.aui-md .hljs-section,\n.aui-md .hljs-function,\n.aui-md .hljs-selector-class,\n.aui-md .hljs-selector-id",
  { color: "#69617c" },
);

globalStyle(
  ".aui-md .hljs-variable,\n.aui-md .hljs-template-variable,\n.aui-md .hljs-params,\n.aui-md .hljs-attr,\n.aui-md .hljs-property",
  { color: "#786653" },
);

globalStyle(
  ".aui-md .hljs-built_in,\n.aui-md .hljs-meta,\n.aui-md .hljs-class .hljs-title,\n.aui-md .hljs-doctag",
  { color: "#577174" },
);

globalStyle(".aui-md .hljs-deletion", {
  color: "#79595d",
  background: "#f1e9e8",
});

globalStyle(".markdown-table-scroll", {
  width: "100%",
  margin: "14px 0",
  overflowX: "auto",
  border: "1px solid #dfe3e8",
  borderRadius: "10px",
  background: "#ffffff",
  boxShadow: "0 1px 2px rgb(20 28 38 / 4%)",
});

globalStyle(".markdown-body table", {
  width: "max-content",
  minWidth: "100%",
  borderCollapse: "separate",
  borderSpacing: "0",
});

globalStyle(".markdown-body th,\n.markdown-body td", {
  minWidth: "96px",
  padding: "8px 11px",
  border: "0",
  borderBottom: "1px solid #e5e8ec",
  textAlign: "left",
  verticalAlign: "top",
});

globalStyle(".markdown-body th:not(:last-child),\n.markdown-body td:not(:last-child)", {
  borderRight: "1px solid #e9ebee",
});

globalStyle(".markdown-body th", {
  color: "#4e5560",
  background: "#f5f6f8",
  fontWeight: "600",
});

globalStyle(".markdown-body tr:nth-child(even) td", {
  background: "#fafafb",
});

globalStyle(".markdown-body tbody tr:last-child td", {
  borderBottom: "0",
});

globalStyle(".markdown-body tbody tr:hover td", {
  background: "#f5f7f9",
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
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "10px",
  borderBottom: "1px solid var(--line)",
});

const reviewFileExpand = keyframes({
  from: { opacity: 0, transform: "translateY(-2px)" },
  to: { opacity: 1, transform: "none" },
});

globalStyle(".agent-run-toggle", {
  display: "inline-flex",
  minHeight: "20px",
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

globalStyle(".agent-run-toggle .agent-run-chevron", {
  transition: "transform 150ms ease",
});

globalStyle(".agent-run.expanded .agent-run-toggle .agent-run-chevron", {
  transform: "rotate(90deg)",
});

globalStyle(".agent-run-toggle.is-static", {
  cursor: "default",
});

globalStyle(".agent-run-toggle.is-running", {
  cursor: "default",
});

globalStyle(
  ".agent-run-toggle.is-running > .lumora-processing-lattice",
  {
    position: "relative",
    flex: "0 0 auto",
  },
);

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
  ".agent-run-toggle.is-running > span:last-child,\n.work-phase-toggle.shimmer-text > span,\n.tool-call-item > button.shimmer-text > span,\n.work-log-placeholder.shimmer-text",
  {
    color: "transparent",
    backgroundImage:
      "linear-gradient(90deg, var(--muted) 0%, var(--muted) 36%, var(--ink) 50%, var(--muted) 64%, var(--muted) 100%)",
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
  display: "flex",
  width: "100%",
  maxWidth: "100%",
  minHeight: "24px",
  alignItems: "flex-start",
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

globalStyle(".work-phase-toggle.is-static", {
  cursor: "default",
});

globalStyle(".work-phase-toggle > span", {
  minWidth: "0",
  overflow: "visible",
  overflowWrap: "anywhere",
  textOverflow: "clip",
  whiteSpace: "normal",
  wordBreak: "break-word",
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

globalStyle('.tool-call-item[data-kind="approval"] > button', {
  color: "#c95110",
});

globalStyle('.tool-call-item[data-kind="approval"] > button:hover', {
  color: "#b9470b",
});

globalStyle(
  '.tool-call-item[data-kind="approval"] > button.shimmer-text > span',
  {
    color: "transparent",
    backgroundImage:
      "linear-gradient(90deg, #c95110 0%, #c95110 36%, #ed7a37 50%, #c95110 64%, #c95110 100%)",
    "@media": {
      "(prefers-reduced-motion: reduce)": {
        color: "#c95110",
        backgroundImage: "none",
      },
    },
  },
);

globalStyle(
  '[data-theme="dark"] .tool-call-item[data-kind="approval"] > button',
  {
    color: "#ff9a60",
  },
);

globalStyle(
  '[data-theme="dark"] .tool-call-item[data-kind="approval"] > button.shimmer-text > span',
  {
    backgroundImage:
      "linear-gradient(90deg, #ff9a60 0%, #ff9a60 36%, #ffd0b5 50%, #ff9a60 64%, #ff9a60 100%)",
    "@media": {
      "(prefers-reduced-motion: reduce)": {
        color: "#ff9a60",
        backgroundImage: "none",
      },
    },
  },
);

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

globalStyle(".artifact-open-button", {
  display: "inline-flex",
  width: "max-content",
  minHeight: "32px",
  alignItems: "center",
  gap: "7px",
  padding: "6px 10px",
  color: "var(--muted)",
  border: "1px solid var(--line)",
  borderRadius: "8px",
  background: "var(--surface-soft)",
  cursor: "pointer",
  font: "inherit",
});

globalStyle(".artifact-open-button:hover", {
  color: "var(--ink)",
  borderColor: "var(--line-strong)",
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
  position: "relative",
  width: "100%",
  minWidth: "0",
  padding: "10px 12px 8px",
  border: "1px solid color-mix(in srgb, var(--line) 58%, transparent)",
  borderRadius: "24px",
  background: "rgb(248 249 251 / 88%)",
  backdropFilter: "blur(12px)",
  boxShadow: "0 1px 4px rgb(28 35 45 / 8%)",
});

globalStyle(".task-layout.composer-enter-from-center .follow-up-composer", {
  animation: `${composerFromCenter} 520ms cubic-bezier(0.22, 1, 0.36, 1) both`,
  transformOrigin: "top center",
  willChange: "transform, opacity",
});

globalStyle(".follow-up-composer textarea", {
  minHeight: "42px",
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
  gap: "12px",
});

globalStyle(".composer-toolbar-left", {
  display: "flex",
  minWidth: "0",
  alignItems: "center",
  gap: "7px",
});

globalStyle(".composer-controls", {
  display: "flex",
  minWidth: "0",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "2px",
});

globalStyle(".composer-menu-anchor", {
  position: "relative",
  display: "inline-flex",
  minWidth: "0",
  alignItems: "center",
  background: "transparent",
});

globalStyle(
  ".follow-up-composer .composer-icon-button, .follow-up-composer .composer-permission-button, .follow-up-composer .composer-choice-button",
  {
    height: "30px",
    minHeight: "30px",
    padding: "0",
    color: "var(--muted)",
    border: "0",
    borderRadius: "999px",
    background: "transparent !important",
    boxShadow: "none",
    fontFamily: "inherit",
    fontSize: "12px",
    fontWeight: "520",
    lineHeight: "1",
  },
);

globalStyle(".follow-up-composer .composer-icon-button", {
  width: "30px",
  minWidth: "30px",
});

globalStyle(".follow-up-composer .composer-permission-button", {
  maxWidth: "126px",
  gap: "6px",
  padding: "0 5px",
  whiteSpace: "nowrap",
  transition: "color 120ms ease, background-color 120ms ease",
});

globalStyle(".follow-up-composer .composer-permission-button > svg", {
  flex: "0 0 auto",
});

globalStyle(".follow-up-composer .composer-permission-button.is-dangerous", {
  color: "#ff7a2f",
});

globalStyle(
  ".follow-up-composer .composer-permission-button.is-dangerous:hover:not(:disabled), .follow-up-composer .composer-permission-button.is-dangerous[aria-expanded='true']",
  {
    color: "#ff8a42",
    background: "rgb(255 122 47 / 9%) !important",
  },
);

globalStyle(
  ".follow-up-composer .composer-icon-button:hover:not(:disabled), .follow-up-composer .composer-permission-button:hover:not(:disabled), .follow-up-composer .composer-choice-button:hover:not(:disabled)",
  {
    color: "var(--ink)",
    borderColor: "transparent",
    background: "color-mix(in srgb, var(--ink) 13%, transparent) !important",
  },
);

globalStyle(
  ".follow-up-composer .composer-icon-button[aria-expanded='true']",
  {
    color: "var(--ink)",
    background: "color-mix(in srgb, var(--ink) 14%, transparent) !important",
  },
);

globalStyle(
  ".follow-up-composer .composer-permission-button[aria-expanded='true'], .follow-up-composer .composer-choice-button[aria-expanded='true']",
  {
    color: "var(--ink)",
    background: "color-mix(in srgb, var(--ink) 13%, transparent) !important",
  },
);

globalStyle(".follow-up-composer .model-choice-button", {
  maxWidth: "190px",
  padding: "0 6px",
  color: "var(--ink)",
  fontSize: "13px",
  fontWeight: "560",
});

globalStyle(".model-choice-button > span", {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".follow-up-composer .reasoning-choice-button", {
  minWidth: "45px",
  gap: "3px",
  padding: "0 4px",
});

globalStyle(".follow-up-composer .composer-mic-button", {
  marginLeft: "2px",
});

globalStyle(".composer-popover", {
  position: "absolute",
  zIndex: "55",
  bottom: "calc(100% + 9px)",
  left: "0",
  display: "grid",
  width: "210px",
  gap: "2px",
  padding: "6px",
  color: "var(--ink)",
  border: "1px solid var(--line-strong)",
  borderRadius: "12px",
  background: "rgb(248 249 251 / 96%)",
  backdropFilter: "blur(32px) saturate(125%)",
  boxShadow:
    "inset 0 1px 0 rgb(255 255 255 / 72%), 0 16px 44px rgb(0 0 0 / 24%)",
  animation: `${composerMenuIn} 120ms cubic-bezier(.2,.75,.25,1)`,
});

globalStyle(".composer-popover.align-right", {
  right: "0",
  left: "auto",
});

globalStyle(".composer-popover > b", {
  padding: "6px 8px 5px",
  color: "var(--subtle)",
  fontSize: "10px",
  fontWeight: "560",
});

globalStyle(".follow-up-composer .composer-popover > button, .aui-composer-root .composer-popover > button", {
  display: "grid",
  width: "100%",
  minHeight: "36px",
  gridTemplateColumns: "18px minmax(0, 1fr)",
  alignItems: "center",
  justifyContent: "stretch",
  gap: "7px",
  padding: "6px 8px",
  color: "var(--muted)",
  border: "0",
  borderRadius: "8px",
  background: "transparent !important",
  boxShadow: "none",
  textAlign: "left",
  fontSize: "12px",
});

globalStyle(
  ".follow-up-composer .reasoning-popover > button, .follow-up-composer .model-picker-popover > button",
  {
    gridTemplateColumns: "minmax(0, 1fr) 18px",
    gap: "7px",
  },
);

globalStyle(".follow-up-composer .composer-popover > button.is-selected, .aui-composer-root .composer-popover > button.is-selected", {
  color: "var(--ink)",
  background: "transparent !important",
});

globalStyle(".follow-up-composer .composer-popover > button:hover, .aui-composer-root .composer-popover > button:hover", {
  color: "var(--ink)",
  borderColor: "transparent !important",
  background: "color-mix(in srgb, var(--ink) 7%, transparent) !important",
});

globalStyle(".composer-popover button > span", {
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".composer-popover button > small", {
  color: "var(--subtle)",
  fontSize: "10px",
  lineHeight: "1.35",
});

globalStyle(".composer-option-copy", {
  display: "grid",
  minWidth: "0",
  gap: "2px",
  overflow: "visible !important",
  whiteSpace: "normal !important",
});

globalStyle(".composer-option-copy strong", {
  color: "var(--ink)",
  fontSize: "12px",
  fontWeight: "560",
  lineHeight: "1.25",
});

globalStyle(".composer-option-copy small", {
  color: "var(--subtle)",
  fontSize: "10px",
  lineHeight: "1.35",
});

globalStyle(".composer-option-check", {
  justifySelf: "end",
  color: "var(--ink)",
});

globalStyle(".model-picker-popover", {
  width: "260px",
  maxHeight: "280px",
  overflowY: "auto",
});

globalStyle(".model-reasoning-trigger", {
  letterSpacing: "-0.01em",
});

globalStyle(
  ".model-reasoning-trigger:hover, .model-reasoning-trigger[aria-expanded='true']",
  {
    color: "var(--ink)",
    borderRadius: "999px",
    background: "color-mix(in srgb, var(--ink) 13%, transparent) !important",
  },
);

globalStyle(
  ".composer-context-trigger:hover, .composer-context-trigger[aria-expanded='true'], .composer-permission-trigger:hover, .composer-permission-trigger[aria-expanded='true']",
  {
    color: "var(--ink)",
    background: "color-mix(in srgb, var(--ink) 13%, transparent) !important",
  },
);

globalStyle(
  ".composer-permission-trigger.is-dangerous:hover, .composer-permission-trigger.is-dangerous[aria-expanded='true']",
  {
    color: "#ff8a42",
    background: "rgb(255 122 47 / 15%) !important",
  },
);

globalStyle(".composer-fast-popover", {
  animation: "none !important",
  transitionDuration: "0ms !important",
});

globalStyle(".model-reasoning-trigger-effort", {
  flex: "0 0 auto",
  color: "var(--muted)",
  fontSize: "inherit",
  fontWeight: "inherit",
  letterSpacing: "inherit",
});

globalStyle(".model-reasoning-popover", {
  position: "relative",
  zIndex: "90",
  overflow: "visible",
  borderColor: "color-mix(in srgb, var(--ink) 11%, transparent)",
  background: "color-mix(in srgb, var(--surface) 99%, var(--ink) 1%)",
  boxShadow: "0 14px 38px rgb(15 23 42 / 14%)",
});

globalStyle(".model-reasoning-row", {
  display: "grid",
  width: "100%",
  height: "36px",
  gridTemplateColumns: "minmax(0, 1fr) auto 16px",
  alignItems: "center",
  gap: "8px",
  padding: "0 9px 0 11px",
  color: "var(--ink)",
  border: "0",
  borderRadius: "8px",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
});

globalStyle(".model-reasoning-row:hover,.model-reasoning-row.active", {
  background: "color-mix(in srgb, var(--ink) 11%, transparent)",
});

globalStyle(".model-reasoning-row > span", {
  overflow: "hidden",
  fontSize: "11px",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".model-reasoning-row > strong", {
  maxWidth: "118px",
  overflow: "hidden",
  color: "var(--muted)",
  fontSize: "10.5px",
  fontWeight: "500",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".model-reasoning-row > svg", {
  width: "15px",
  height: "15px",
  color: "var(--subtle)",
});

globalStyle(".model-reasoning-submenu", {
  position: "absolute",
  zIndex: "91",
  bottom: "0",
  display: "grid",
  width: "238px",
  maxHeight: "292px",
  gap: "2px",
  padding: "7px",
  overflowY: "auto",
  border: "1px solid color-mix(in srgb, var(--ink) 11%, transparent)",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--surface) 99%, var(--ink) 1%)",
  boxShadow: "0 14px 38px rgb(15 23 42 / 14%)",
});

globalStyle(".model-reasoning-submenu.opens-left", {
  right: "calc(100% + 7px)",
  left: "auto",
});

const agentAvatarPulse = keyframes({
  "0%": { opacity: "0.8", transform: "scale(0.86)" },
  "70%, 100%": { opacity: "0", transform: "scale(1.22)" },
});

const runningAgentAvatarHop = keyframes({
  "0%, 18%, 72%, 100%": { transform: "translateY(0) scale(1)" },
  "34%": { transform: "translateY(-2.5px) scale(1.025)" },
  "46%": { transform: "translateY(0) scale(0.985)" },
  "57%": { transform: "translateY(-1px) scale(1.01)" },
});

globalStyle(".agent-call-item", {
  minWidth: "0",
});

globalStyle(".agent-call-item > button", {
  display: "grid",
  width: "100%",
  minWidth: "0",
  gridTemplateColumns: "22px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "9px",
  padding: "4px 2px",
  color: "var(--muted)",
  border: "0",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  transition: "color 140ms ease, transform 140ms ease",
});

globalStyle(".agent-call-item > button:hover", {
  color: "var(--ink)",
  transform: "translateX(2px)",
});

globalStyle(".agent-call-item > button:disabled", {
  cursor: "default",
  transform: "none",
});

globalStyle(".agent-call-avatar, .subagent-pane-avatar", {
  display: "block",
  width: "26px",
  height: "26px",
  boxSizing: "border-box",
  border: "2px solid var(--surface)",
  borderRadius: "50%",
  background: "var(--agent-accent)",
  boxShadow: "0 0 0 1px color-mix(in srgb, var(--agent-accent) 52%, var(--line))",
});

globalStyle(".agent-call-avatar", {
  width: "22px",
  height: "22px",
});

globalStyle('.agent-call-item[data-status="running"] .agent-call-avatar', {
  animation: `${runningAgentAvatarHop} 1.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) infinite`,
  transformOrigin: "50% 100%",
  willChange: "transform",
  "@media": {
    "(prefers-reduced-motion: reduce)": {
      animation: "none",
      transform: "none",
    },
  },
});

globalStyle(".agent-call-item > button > span:nth-child(2)", {
  display: "flex",
  minWidth: "0",
  alignItems: "baseline",
  gap: "8px",
});

globalStyle(".agent-call-item strong", {
  overflow: "hidden",
  color: "currentColor",
  fontSize: "11.5px",
  fontWeight: "600",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".agent-call-item small", {
  flex: "0 0 auto",
  color: "var(--subtle)",
  fontSize: "9.5px",
  letterSpacing: "0.02em",
});

globalStyle(".model-reasoning-submenu.opens-right", {
  right: "auto",
  left: "calc(100% + 7px)",
});

globalStyle(".model-reasoning-option", {
  width: "100%",
  minHeight: "34px",
  justifyContent: "flex-start",
  gap: "7px",
  padding: "0 9px",
  borderRadius: "7px",
  fontSize: "11px",
  fontWeight: "480",
  transition: "background-color 70ms linear, box-shadow 70ms linear",
});

globalStyle(".model-reasoning-option > span", {
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".model-reasoning-option > small", {
  marginLeft: "auto",
  color: "var(--subtle)",
  fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
  fontSize: "8px",
});

globalStyle(".model-reasoning-option > svg", {
  width: "15px",
  height: "15px",
  flex: "0 0 auto",
  marginLeft: "auto",
});

globalStyle(".model-reasoning-option > small + svg", {
  marginLeft: "2px",
});

globalStyle(".model-reasoning-option[aria-checked='true']", {
  background: "color-mix(in srgb, var(--ink) 10%, transparent)",
});

globalStyle(".model-reasoning-option:hover", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--ink) 14%, transparent) !important",
  boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--ink) 7%, transparent)",
});

globalStyle(".follow-up-composer .model-picker-popover > button", {
  minHeight: "34px",
});

globalStyle(".reasoning-popover", {
  width: "180px",
});

globalStyle(".context-picker-popover", {
  right: "0",
  left: "0",
  width: "100%",
  maxHeight: "390px",
  gap: "3px",
  padding: "8px",
  overflowY: "auto",
  borderRadius: "18px",
  background: "rgb(248 249 251 / 96%)",
  backdropFilter: "blur(32px) saturate(125%)",
});

globalStyle(".context-picker-popover .context-compact-command", {
  marginBottom: "2px",
  border: "0",
  background: "transparent !important",
});

globalStyle(".command-picker-popover", {
  right: "0",
  left: "0",
  width: "100%",
  padding: "8px",
  borderRadius: "18px",
});

globalStyle(".follow-up-composer .command-picker-popover > button, .aui-composer-root .command-picker-popover > button", {
  minHeight: "52px",
  gridTemplateColumns: "22px minmax(0, 1fr)",
  padding: "8px 11px",
});

globalStyle(".command-picker-popover button > span", {
  display: "grid",
  gap: "2px",
  textAlign: "left",
});

globalStyle(".command-picker-popover button strong", {
  color: "var(--ink)",
  fontSize: "12.5px",
  fontWeight: "600",
});

globalStyle(".command-picker-popover button small", {
  color: "var(--subtle)",
  fontSize: "10.5px",
});

globalStyle(".artifact-viewer-backdrop", {
  position: "fixed",
  inset: "0",
  zIndex: "90",
  display: "grid",
  justifyItems: "end",
  background: "rgba(8, 8, 9, .42)",
  backdropFilter: "blur(3px)",
  animation: `${toolApprovalFadeIn} 160ms ease both`,
});

globalStyle(".artifact-viewer", {
  display: "grid",
  width: "min(720px, 72vw)",
  height: "100%",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  padding: "18px",
  color: "var(--ink)",
  borderLeft: "1px solid var(--line)",
  background: "var(--surface)",
  boxShadow: "-24px 0 64px rgba(0, 0, 0, .24)",
  animation: `${toolApprovalRiseIn} 190ms cubic-bezier(.2,.75,.25,1) both`,
});

globalStyle(".artifact-viewer > header", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  padding: "0 0 14px",
  borderBottom: "1px solid var(--line)",
});

globalStyle(".artifact-viewer > header > div", {
  display: "grid",
  gap: "4px",
});

globalStyle(".artifact-viewer > header strong", { fontSize: "14px" });
globalStyle(".artifact-viewer > header small", {
  color: "var(--subtle)",
  fontFamily: "var(--code-font, monospace)",
  fontSize: "10px",
});

globalStyle(".artifact-viewer > pre", {
  margin: "0",
  padding: "18px 2px",
  overflow: "auto",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});

globalStyle(".artifact-viewer > pre code", {
  fontFamily: "var(--code-font, monospace)",
  fontSize: "11px",
  lineHeight: "1.65",
});

globalStyle(".artifact-viewer > footer", {
  display: "flex",
  minHeight: "44px",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  paddingTop: "12px",
  color: "var(--subtle)",
  borderTop: "1px solid var(--line)",
  fontSize: "10.5px",
});

globalStyle(".artifact-viewer > footer button", {
  display: "inline-flex",
  minHeight: "34px",
  alignItems: "center",
  gap: "7px",
  padding: "6px 11px",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: "8px",
  background: "var(--surface-soft)",
  cursor: "pointer",
});

globalStyle(".artifact-viewer-error", {
  alignSelf: "start",
  margin: "18px 0",
  color: "var(--danger, #e16f6f)",
  fontSize: "12px",
});

globalStyle(".spin", { animation: `${artifactSpin} 800ms linear infinite` });


globalStyle(".follow-up-composer .context-picker-popover > button", {
  minHeight: "40px",
  gridTemplateColumns: "22px minmax(0, 1fr)",
  padding: "6px 10px",
});

globalStyle(".context-picker-popover button > span", {
  display: "flex",
  minWidth: "0",
  alignItems: "baseline",
  gap: "8px",
  overflow: "hidden",
  whiteSpace: "nowrap",
});

globalStyle(".context-picker-popover button strong", {
  flex: "0 0 auto",
  color: "var(--ink)",
  fontSize: "12.5px",
  fontWeight: "560",
  lineHeight: "1.25",
});

globalStyle(".context-picker-popover button small", {
  minWidth: "0",
  overflow: "hidden",
  color: "var(--subtle)",
  fontSize: "10.5px",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".context-picker-section", {
  margin: "4px -8px 0",
  padding: "9px 18px 5px",
  color: "var(--subtle)",
  borderTop: "1px solid var(--line)",
  fontSize: "10.5px",
  fontWeight: "560",
});

globalStyle(".permission-popover", {
  width: "330px",
  padding: "8px",
});

globalStyle(".permission-popover-header", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "2px 8px 7px",
  color: "var(--subtle)",
  fontSize: "10.5px",
});

globalStyle(".follow-up-composer .permission-popover-header > button", {
  minHeight: "auto",
  padding: "0",
  color: "var(--subtle)",
  border: "0",
  background: "transparent !important",
  textDecoration: "underline",
  textUnderlineOffset: "2px",
  fontSize: "10.5px",
});

globalStyle(".follow-up-composer .permission-popover > button", {
  minHeight: "56px",
  gridTemplateColumns: "24px minmax(0, 1fr) 18px",
  gap: "8px",
  padding: "8px 9px",
});

globalStyle(".permission-option-icon", {
  display: "grid",
  width: "24px",
  placeItems: "center",
  color: "var(--muted)",
});

globalStyle(".permission-option-icon > svg", {
  overflow: "visible",
});

globalStyle(
  ".permission-popover > button.is-selected:not(.is-dangerous) .permission-option-icon",
  {
    color: "var(--ink)",
  },
);

globalStyle(".permission-option-copy", {
  display: "grid",
  minWidth: "0",
  gap: "3px",
  overflow: "visible !important",
  whiteSpace: "normal !important",
});

globalStyle(".permission-option-copy strong", {
  color: "var(--ink)",
  fontSize: "12.5px",
  fontWeight: "580",
});

globalStyle(".permission-option-check", {
  color: "var(--ink)",
});

globalStyle(
  ".permission-popover > button.is-dangerous .permission-option-icon, .permission-popover > button.is-dangerous .permission-option-copy strong, .permission-popover > button.is-dangerous .permission-option-copy small, .permission-popover > button.is-dangerous .permission-option-check",
  {
    color: "#ff7a2f",
  },
);

globalStyle(".permission-popover > button.is-dangerous:hover", {
  background: "rgb(255 122 47 / 8%) !important",
});

globalStyle(".composer-permission-button > span", {
  "@media": {
    "(max-width: 720px)": {
      display: "none",
    },
  },
});

globalStyle(".follow-up-composer .model-choice-button", {
  "@media": {
    "(max-width: 620px)": {
      maxWidth: "92px",
    },
  },
});

globalStyle(".follow-up-composer .composer-mic-button", {
  "@media": {
    "(max-width: 520px)": {
      display: "none",
    },
  },
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
  cursor: "pointer",
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
  transition: "stroke-dasharray 180ms ease",
  "@media": {
    "(prefers-reduced-motion: reduce)": {
      transition: "none",
    },
  },
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
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: "14px",
  background: "rgb(255 255 255 / 97%)",
  backdropFilter: "blur(32px) saturate(125%)",
  boxShadow:
    "inset 0 1px 0 rgb(255 255 255 / 80%), 0 12px 30px rgb(30 35 40 / 14%)",
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
  color: "var(--muted)",
  fontSize: "12.5px",
  fontWeight: "520",
  lineHeight: "1.2",
});

globalStyle(".context-usage-tooltip strong", {
  marginTop: "2px",
  color: "var(--muted)",
  fontSize: "12.5px",
  fontWeight: "520",
  lineHeight: "1.2",
});

globalStyle(".context-usage-tooltip b", {
  marginTop: "7px",
  color: "var(--ink)",
  fontSize: "12.5px",
  fontWeight: "620",
  lineHeight: "1.24",
});

globalStyle(
  ".context-usage-control:hover .context-usage-ring[aria-expanded='false'] + .context-usage-tooltip, .context-usage-control:focus-within .context-usage-ring[aria-expanded='false'] + .context-usage-tooltip",
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

globalStyle(".follow-up-composer .send-follow-up .stop-glyph", {
  display: "block",
  width: "13px",
  height: "13px",
  borderRadius: "3.5px",
  background: "currentColor",
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

globalStyle(".review-pane-content", {
  display: "flex",
  width: "100%",
  height: "100%",
  minHeight: "0",
  flexDirection: "column",
  background: "var(--surface)",
  fontFamily:
    'var(--ui-font, "Segoe UI Variable Text", "Segoe UI", sans-serif)',
  textRendering: "optimizeLegibility",
});

globalStyle(".conversation-usage-pane", {
  position: "absolute",
  zIndex: "20",
  top: "0",
  right: "0",
  bottom: "0",
  display: "grid",
  flex: "0 0 auto",
  width: "var(--context-pane-width)",
  minWidth: "0",
  minHeight: "0",
  gridTemplateRows: "44px minmax(0, 1fr)",
  overflow: "visible",
  borderLeft: "1px solid var(--line)",
  background: "var(--surface)",
  containerName: "contextPane",
  containerType: "inline-size",
  transform: "translate3d(100%, 0, 0)",
  transition: "transform 220ms cubic-bezier(0.22, 0.82, 0.24, 1)",
});

globalStyle(".right-sidebar-toolbar", {
  display: "block",
  minWidth: "0",
  paddingRight: "42px",
  boxSizing: "border-box",
  borderBottom: "1px solid var(--line)",
  background: "var(--surface)",
});

globalStyle(".right-sidebar-tabs-shell", {
  position: "relative",
  minWidth: "0",
  overflow: "hidden",
});

globalStyle(".right-sidebar-tabbar", {
  display: "flex",
  height: "43px",
  minWidth: "0",
  alignItems: "stretch",
  padding: "0 3px",
  overflowX: "auto",
  overflowY: "hidden",
  background: "var(--surface)",
  overscrollBehaviorX: "contain",
  scrollbarWidth: "none",
});

globalStyle(".right-sidebar-tabbar::-webkit-scrollbar", {
  display: "none",
});

globalStyle(".right-sidebar-tab", {
  position: "relative",
  display: "flex",
  width: "max-content",
  minWidth: "92px",
  maxWidth: "190px",
  height: "34px",
  flex: "0 0 auto",
  alignSelf: "center",
  alignItems: "stretch",
  margin: "0 2px",
  color: "var(--muted)",
  border: "1px solid transparent",
  borderRadius: "9px",
  background: "transparent",
  overflow: "hidden",
  transition: "color 140ms ease, border-color 140ms ease, background-color 140ms ease",
});

globalStyle(".right-sidebar-tab.is-active", {
  color: "var(--ink)",
  borderColor: "color-mix(in srgb, var(--line) 74%, transparent)",
  background: "color-mix(in srgb, var(--surface-soft) 55%, transparent)",
});

globalStyle(".right-sidebar-tab:not(.is-active):hover", {
  color: "var(--ink)",
  borderColor: "color-mix(in srgb, var(--line) 72%, transparent)",
  background: "color-mix(in srgb, var(--muted) 9%, transparent)",
});

globalStyle(".right-sidebar-tab-select", {
  display: "flex",
  minWidth: "0",
  flex: "1 1 auto",
  alignItems: "center",
  gap: "6px",
  padding: "0 3px 0 10px",
  color: "inherit",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "11px",
  fontWeight: "520",
});

globalStyle(".right-sidebar-tab-select > span:last-child", {
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".right-sidebar-tab.has-long-label .right-sidebar-tab-select > span:last-child", {
  paddingRight: "12px",
  textOverflow: "clip",
  WebkitMaskImage: "linear-gradient(to right, #000 0, #000 calc(100% - 16px), transparent 100%)",
  maskImage: "linear-gradient(to right, #000 0, #000 calc(100% - 16px), transparent 100%)",
});

globalStyle(".right-sidebar-tab-select > svg", {
  flex: "0 0 auto",
});

globalStyle(".right-sidebar-tab .context-pane-mini-ring", {
  width: "15px",
  height: "15px",
  flex: "0 0 auto",
});

globalStyle(".right-sidebar-tab .subagent-pane-avatar", {
  width: "17px",
  height: "17px",
  flex: "0 0 auto",
  borderWidth: "1.5px",
});

globalStyle(".right-sidebar-tab-close", {
  display: "grid",
  width: "24px",
  minWidth: "24px",
  padding: "0",
  placeItems: "center",
  color: "var(--subtle)",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  opacity: "0.58",
});

globalStyle(".right-sidebar-tab-close:hover", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--muted) 9%, transparent)",
  opacity: "1",
});

globalStyle(".task-sidebar-visibility-toggle", {
  position: "absolute",
  zIndex: "30",
  top: "0",
  right: "0",
  display: "grid",
  width: "42px",
  height: "43px",
  padding: "0",
  placeItems: "center",
  color: "var(--subtle)",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  transition: "color 120ms ease",
});

globalStyle(".task-sidebar-visibility-toggle svg", {
  opacity: "0.72",
  filter: "brightness(0.96)",
  transition: "opacity 120ms ease, filter 120ms ease",
});

globalStyle(".task-sidebar-visibility-toggle:hover", {
  color: "var(--ink)",
  background: "transparent",
});

globalStyle(".task-sidebar-visibility-toggle:hover svg", {
  opacity: "1",
  filter: "brightness(1.18)",
});

globalStyle(".right-sidebar-content, .right-sidebar-tab-panel", {
  width: "100%",
  height: "100%",
  minHeight: "0",
  overflow: "hidden",
});

globalStyle(".right-sidebar-scroll-content", {
  width: "100%",
  height: "100%",
  minHeight: "0",
  overscrollBehavior: "contain",
  scrollbarGutter: "stable",
  scrollbarWidth: "thin",
  scrollbarColor:
    "color-mix(in srgb, var(--muted) 34%, transparent) transparent",
});

globalStyle(
  ".right-sidebar-scroll-content::-webkit-scrollbar,\n.review-diff::-webkit-scrollbar",
  {
    width: "10px",
    height: "10px",
  },
);

globalStyle(
  ".right-sidebar-scroll-content::-webkit-scrollbar-track,\n.review-diff::-webkit-scrollbar-track",
  { background: "transparent" },
);

globalStyle(
  ".right-sidebar-scroll-content::-webkit-scrollbar-thumb,\n.review-diff::-webkit-scrollbar-thumb",
  {
    minHeight: "44px",
    border: "3px solid transparent",
    borderRadius: "999px",
    background:
      "color-mix(in srgb, var(--muted) 38%, transparent) padding-box",
  },
);

globalStyle(
  ".right-sidebar-scroll-content::-webkit-scrollbar-thumb:hover,\n.review-diff::-webkit-scrollbar-thumb:hover",
  {
    background:
      "color-mix(in srgb, var(--muted) 58%, transparent) padding-box",
  },
);

globalStyle(
  ".right-sidebar-scroll-content::-webkit-scrollbar-thumb:active,\n.review-diff::-webkit-scrollbar-thumb:active",
  {
    background:
      "color-mix(in srgb, var(--blue) 62%, var(--muted)) padding-box",
  },
);

globalStyle(
  ".right-sidebar-scroll-content::-webkit-scrollbar-corner,\n.review-diff::-webkit-scrollbar-corner",
  { background: "transparent" },
);

globalStyle(".conversation-usage-scroll.subagent-session-scroll", {
  display: "flex",
  minHeight: "0",
  flexDirection: "column",
  gap: "0",
  overflowY: "auto",
  overflowX: "hidden",
  padding: "20px 24px 36px",
});

globalStyle(".subagent-parent-link", {
  display: "inline-flex",
  width: "fit-content",
  alignItems: "center",
  gap: "6px",
  margin: "0 0 12px",
  padding: "0",
  color: "var(--subtle)",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "10.5px",
});

globalStyle(".subagent-parent-link:hover", {
  color: "var(--ink)",
});

globalStyle(".subagent-session-summary", {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "5px 8px",
  padding: "0 0 16px",
  color: "var(--subtle)",
  borderBottom: "1px solid var(--line)",
  fontSize: "10.5px",
  fontVariantNumeric: "tabular-nums",
  lineHeight: "1.45",
});

globalStyle(".subagent-session-summary > span + span::before", {
  marginRight: "8px",
  color: "color-mix(in srgb, var(--subtle) 55%, transparent)",
  content: '"·"',
});

globalStyle(".subagent-session-status", {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  color: "var(--muted)",
  fontWeight: "540",
});

globalStyle(".subagent-session-status > i", {
  display: "block",
  width: "6px",
  height: "6px",
  borderRadius: "50%",
  background: "#2c9a72",
});

globalStyle('.subagent-session-status[data-status="running"] > i', {
  animation: `${agentAvatarPulse} 1.8s ease-out infinite`,
});

globalStyle('.subagent-session-status[data-status="failed"]', {
  color: "#a9502f",
});

globalStyle('.subagent-session-status[data-status="failed"] > i', {
  background: "#c45f3a",
});

globalStyle(".subagent-trace, .subagent-children", {
  display: "flex",
  minWidth: "0",
  flexDirection: "column",
  padding: "12px 0",
  borderBottom: "1px solid var(--line)",
});

globalStyle(".subagent-section-toggle", {
  display: "flex",
  width: "100%",
  minHeight: "28px",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0",
  color: "var(--muted)",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "11.5px",
  fontWeight: "540",
});

globalStyle(".subagent-section-toggle > span", {
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
});

globalStyle(".subagent-section-toggle small", {
  color: "var(--subtle)",
  fontSize: "10px",
  fontWeight: "450",
});

globalStyle(".subagent-section-chevron", {
  color: "var(--subtle)",
  transition: "transform 160ms cubic-bezier(0.2, 0.75, 0.25, 1)",
});

globalStyle('.subagent-section-toggle[aria-expanded="true"] .subagent-section-chevron', {
  transform: "rotate(90deg)",
});

globalStyle(".subagent-trace-collapse", {
  display: "grid",
  gridTemplateRows: "0fr",
  overflow: "hidden",
  opacity: "0",
  transition:
    "grid-template-rows 180ms cubic-bezier(0.2, 0.75, 0.25, 1), opacity 130ms ease",
});

globalStyle('.subagent-section-toggle[aria-expanded="true"] + .subagent-trace-collapse', {
  gridTemplateRows: "1fr",
  opacity: "1",
});

globalStyle(".subagent-trace-list", {
  display: "flex",
  minHeight: "0",
  flexDirection: "column",
  gap: "1px",
  overflow: "hidden",
  paddingTop: "5px",
});

globalStyle(".subagent-trace-item", {
  minWidth: "0",
  margin: "0",
});

globalStyle(".subagent-trace-item > summary, .subagent-trace-row", {
  display: "grid",
  width: "100%",
  minWidth: "0",
  gridTemplateColumns: "19px minmax(0, 1fr) auto 13px",
  alignItems: "center",
  gap: "7px",
  padding: "6px 0",
  color: "var(--muted)",
  listStyle: "none",
  cursor: "pointer",
});

globalStyle(".subagent-trace-row", {
  cursor: "default",
});

globalStyle(".subagent-trace-item > summary::-webkit-details-marker", {
  display: "none",
});

globalStyle(".subagent-trace-icon", {
  display: "grid",
  width: "18px",
  height: "18px",
  placeItems: "center",
  color: "var(--subtle)",
});

globalStyle('.subagent-trace-item[data-status="running"] .subagent-trace-icon', {
  color: "#248d69",
});

globalStyle('.subagent-trace-item[data-status="failed"] .subagent-trace-icon', {
  color: "#b65a37",
});

globalStyle(".subagent-trace-title", {
  overflow: "hidden",
  color: "var(--muted)",
  fontSize: "11px",
  fontWeight: "500",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".subagent-trace-item small", {
  color: "var(--subtle)",
  fontSize: "9.5px",
  fontVariantNumeric: "tabular-nums",
});

globalStyle(".subagent-trace-chevron", {
  color: "var(--subtle)",
  transition: "transform 150ms ease",
});

globalStyle(".subagent-trace-item[open] .subagent-trace-chevron", {
  transform: "rotate(90deg)",
});

globalStyle(".subagent-trace-detail", {
  maxHeight: "min(360px, 48vh)",
  margin: "1px 0 5px 26px",
  overflow: "auto",
  padding: "8px 10px",
  borderRadius: "8px",
  background: "var(--surface-soft)",
});

globalStyle(".subagent-trace-detail p, .subagent-trace-empty", {
  margin: "0",
  color: "var(--subtle)",
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  lineHeight: "1.6",
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
});

globalStyle(".subagent-trace-empty", {
  padding: "7px 0 5px 26px",
  fontFamily: "inherit",
});

globalStyle(".subagent-children-list", {
  display: "flex",
  flexDirection: "column",
  gap: "5px",
});

globalStyle(".subagent-children-list > button", {
  display: "grid",
  width: "100%",
  minWidth: "0",
  gridTemplateColumns: "24px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "8px",
  padding: "7px 0",
  color: "var(--muted)",
  border: "0",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  transition: "color 120ms ease, transform 120ms ease",
});

globalStyle(".subagent-children-list > button:hover", {
  color: "var(--ink)",
  transform: "translateX(2px)",
});

globalStyle(".subagent-children-list > button > span:nth-child(2)", {
  display: "flex",
  minWidth: "0",
  flexDirection: "column",
  gap: "3px",
});

globalStyle(".subagent-children-list strong", {
  overflow: "hidden",
  color: "var(--ink)",
  fontSize: "11px",
  fontWeight: "540",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".subagent-children-list small", {
  overflow: "hidden",
  color: "var(--subtle)",
  fontSize: "9px",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".subagent-pane-back", {
  flex: "0 0 auto",
  marginRight: "-2px",
});

globalStyle(".subagent-answer", {
  padding: "22px 0 0",
  borderBottom: "0",
});

globalStyle(".subagent-answer .markdown-body, .subagent-answer > p", {
  margin: "0",
  color: "var(--ink)",
  fontSize: "12.5px",
  lineHeight: "1.78",
});

globalStyle(".subagent-answer-meta", {
  display: "flex",
  minHeight: "26px",
  alignItems: "center",
  gap: "8px",
  paddingTop: "6px",
  color: "var(--subtle)",
});

globalStyle(".subagent-answer-meta button", {
  display: "grid",
  width: "22px",
  height: "22px",
  padding: "0",
  placeItems: "center",
  color: "var(--subtle)",
  border: "0",
  borderRadius: "6px",
  background: "transparent",
  cursor: "pointer",
  transition: "color 120ms ease, background 120ms ease",
});

globalStyle(".subagent-answer-meta button:hover:not(:disabled)", {
  color: "var(--ink)",
  background: "var(--surface-soft)",
});

globalStyle(".subagent-answer-meta button.is-copied", {
  color: "#248d69",
});

globalStyle(".subagent-answer-meta button:disabled", {
  cursor: "default",
  opacity: "0.35",
});

globalStyle(".subagent-answer-meta time", {
  color: "var(--subtle)",
  fontSize: "11px",
  fontWeight: "450",
  fontVariantNumeric: "tabular-nums",
  lineHeight: "1.4",
  whiteSpace: "nowrap",
});

globalStyle(".subagent-answer-meta time:empty", {
  display: "none",
});

globalStyle(".subagent-children > header", {
  display: "flex",
  minHeight: "28px",
  alignItems: "center",
  justifyContent: "space-between",
  color: "var(--muted)",
  fontSize: "11.5px",
  fontWeight: "540",
});

globalStyle(".subagent-children > header small", {
  color: "var(--subtle)",
  fontSize: "9.5px",
  fontWeight: "450",
});

globalStyle(".aui-composer-root .composer-add-panel", {
  maxHeight: "min(390px, calc(100vh - 220px))",
  gap: "3px",
  overflowY: "auto",
  borderColor: "color-mix(in oklab, var(--color-border) 60%, transparent)",
  borderRadius: "var(--composer-radius)",
  background: "var(--composer-bg) !important",
  backdropFilter: "none !important",
  boxShadow: "none !important",
});

globalStyle(".aui-composer-root .composer-add-panel > b", {
  position: "sticky",
  top: "0",
  zIndex: "1",
  margin: "-8px -8px 0",
  padding: "12px 16px 8px",
  background: "inherit",
  fontSize: "12px",
});

globalStyle(".aui-composer-root .composer-add-panel > button", {
  minHeight: "36px",
  gridTemplateColumns: "22px minmax(0, 1fr)",
  padding: "5px 11px",
});

globalStyle(".aui-composer-root .composer-add-panel button > span", {
  display: "flex",
  minWidth: "0",
  alignItems: "baseline",
  gap: "8px",
  overflow: "hidden",
  textAlign: "left",
  whiteSpace: "nowrap",
});

globalStyle(".aui-composer-root .composer-add-panel button strong", {
  flex: "0 0 auto",
  color: "var(--ink)",
  fontSize: "12.5px",
  fontWeight: "600",
});

globalStyle(".aui-composer-root .composer-add-panel button small", {
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".conversation-usage-pane.is-open", {
  overflow: "visible",
  transform: "none",
});

globalStyle(".conversation-usage-pane:not(.is-open) > :not(.context-pane-resize-handle)", {
  visibility: "hidden",
  pointerEvents: "none",
  transition: "visibility 0s linear 220ms",
});

globalStyle(".conversation-usage-pane.is-open > :not(.context-pane-resize-handle)", {
  visibility: "visible",
  transition: "none",
});

globalStyle(".context-pane-resize-handle", {
  position: "absolute",
  zIndex: "4",
  top: "0",
  bottom: "0",
  left: "-4px",
  width: "8px",
  cursor: "col-resize",
  touchAction: "none",
  outline: "none",
});

globalStyle(".conversation-usage-pane:not(.is-open) .context-pane-resize-handle", {
  left: "-8px",
  cursor: "w-resize",
  pointerEvents: "auto",
});

globalStyle(".context-pane-resize-handle::after", {
  position: "absolute",
  top: "50%",
  left: "3px",
  width: "1px",
  height: "min(62%, 520px)",
  background:
    "linear-gradient(to bottom, transparent, color-mix(in srgb, var(--muted) 70%, transparent) 48%, color-mix(in srgb, var(--muted) 70%, transparent) 52%, transparent)",
  content: "\"\"",
  opacity: "0",
  transform: "translateY(-50%)",
  transition: "opacity 120ms ease",
});

globalStyle(
  ".context-pane-resize-handle:hover::after,\n.context-pane-resize-handle:focus-visible::after,\n.resizing-context-pane .context-pane-resize-handle::after",
  { opacity: "1" },
);

globalStyle("body.resizing-context-pane", {
  cursor: "col-resize",
  userSelect: "none",
});

globalStyle("body.resizing-context-pane .conversation-usage-pane", {
  transition: "none",
});

globalStyle(
  "body.resizing-context-pane .task-header,\nbody.resizing-context-pane .task-stage",
  { transition: "none" },
);

globalStyle(
  "body.opening-context-pane-by-drag .conversation-usage-pane.is-open > .right-sidebar-content",
  {
    visibility: "hidden",
    contentVisibility: "hidden",
    opacity: "0",
    pointerEvents: "none",
    transition: "none",
  },
);

globalStyle(".context-pane-header", {
  display: "flex",
  alignItems: "center",
  padding: "0 16px",
  borderBottom: "1px solid var(--line)",
});

globalStyle(".context-pane-tab", {
  display: "flex",
  minWidth: "0",
  height: "34px",
  alignItems: "center",
  gap: "9px",
  padding: "0 6px 0 12px",
  color: "var(--ink)",
  borderRadius: "9px",
  background: "var(--surface-soft)",
});

globalStyle(".context-pane-tab strong", {
  fontSize: "12px",
  fontWeight: "600",
});

globalStyle(".context-pane-tab button", {
  display: "grid",
  width: "23px",
  height: "23px",
  padding: "0",
  placeItems: "center",
  color: "var(--muted)",
  border: "0",
  borderRadius: "6px",
  background: "transparent",
  cursor: "pointer",
});

globalStyle(".context-pane-tab button:hover", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--muted) 10%, transparent)",
});

globalStyle(".context-pane-tab button svg", {
  width: "14px",
  height: "14px",
});

globalStyle(".context-pane-mini-ring", {
  display: "block",
  width: "21px",
  height: "21px",
  borderRadius: "50%",
  background:
    "radial-gradient(circle, var(--surface-soft) 56%, transparent 59%), conic-gradient(var(--subtle) calc(var(--usage) * 1%), color-mix(in srgb, var(--subtle) 20%, transparent) 0)",
});

globalStyle(".conversation-usage-scroll", {
  minHeight: "0",
  overflow: "auto",
  padding: "32px 36px 44px",
  contentVisibility: "auto",
  containIntrinsicSize: "auto 900px",
});

globalStyle(".context-stat-grid", {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  columnGap: "clamp(28px, 8cqw, 72px)",
  rowGap: "25px",
});

globalStyle(".context-stat-grid > div", {
  display: "grid",
  minWidth: "0",
  gap: "7px",
});

globalStyle(".context-stat-grid span", {
  color: "var(--subtle)",
  fontSize: "11px",
});

globalStyle(".context-stat-grid strong", {
  overflow: "hidden",
  fontSize: "12px",
  fontWeight: "520",
  fontVariantNumeric: "tabular-nums",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".context-breakdown", {
  marginTop: "42px",
});

globalStyle(".context-breakdown > header", {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "14px",
});

globalStyle(".context-breakdown > header svg", {
  display: "none",
  width: "14px",
});

globalStyle(".context-breakdown > header strong", {
  fontSize: "12px",
  fontWeight: "540",
});

globalStyle(".context-breakdown > header span", {
  marginLeft: "auto",
  color: "var(--subtle)",
  fontSize: "9px",
});

globalStyle(".context-breakdown-bar", {
  display: "flex",
  width: "100%",
  height: "8px",
  overflow: "hidden",
  borderRadius: "999px",
  background: "var(--surface-soft)",
});

globalStyle(".context-segment", { display: "block", minWidth: "0" });
globalStyle(".context-segment.user, .context-legend-dot.user", { background: "#23963b" });
globalStyle(".context-segment.assistant, .context-legend-dot.assistant", { background: "#d66c27" });
globalStyle(".context-segment.tools, .context-legend-dot.tools", { background: "#8b6612" });
globalStyle(".context-segment.other, .context-legend-dot.other", { background: "#66686b" });

globalStyle(".context-breakdown-legend", {
  display: "grid",
  gridTemplateColumns: "repeat(4, max-content)",
  gap: "9px 16px",
  marginTop: "13px",
  color: "var(--subtle)",
  fontSize: "9px",
});

globalStyle(".context-breakdown-legend span", {
  display: "flex",
  alignItems: "center",
  gap: "6px",
});

globalStyle(".context-legend-dot", {
  display: "block",
  width: "7px",
  height: "7px",
  borderRadius: "50%",
});

globalStyle(".context-raw-messages", {
  marginTop: "42px",
});

globalStyle(".context-raw-messages > header", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  marginBottom: "13px",
});

globalStyle(".context-raw-messages > header > div", {
  display: "flex",
  alignItems: "center",
  gap: "8px",
});

globalStyle(".context-raw-messages > header svg", { width: "14px", height: "14px" });
globalStyle(".context-raw-messages > header strong", { fontSize: "12px", fontWeight: "540" });
globalStyle(".context-raw-messages > header button", {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  padding: "5px 0",
  color: "var(--muted)",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  fontSize: "10px",
});

globalStyle(".context-message-list", {
  overflow: "hidden",
  border: "1px solid var(--line)",
  borderRadius: "10px",
  background: "var(--surface)",
});

globalStyle(".context-message-list details + details", { borderTop: "1px solid var(--line)" });
globalStyle(".context-message-list summary", {
  display: "grid",
  minHeight: "41px",
  gridTemplateColumns: "16px max-content minmax(0, 1fr) max-content",
  alignItems: "center",
  gap: "5px",
  padding: "0 12px",
  cursor: "pointer",
  listStyle: "none",
});
globalStyle(".context-message-list summary::-webkit-details-marker", { display: "none" });
globalStyle(".context-message-list summary > svg", { width: "13px", color: "var(--subtle)" });
globalStyle(".context-message-list summary strong", { fontSize: "10px", fontWeight: "560" });
globalStyle(".context-message-list summary span", {
  overflow: "hidden",
  color: "var(--muted)",
  fontSize: "9px",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
globalStyle(".context-message-list summary time", { color: "var(--subtle)", fontSize: "9px" });
globalStyle(".context-message-list details > div", {
  padding: "0 33px 13px",
  color: "var(--muted)",
  fontSize: "10px",
  lineHeight: "1.55",
});
globalStyle(".context-message-list details p", { margin: "0 0 6px", whiteSpace: "pre-wrap" });
globalStyle(".context-message-list details small", { color: "var(--subtle)", fontSize: "9px" });

globalStyle(".context-stat-grid", {
  "@container": {
    "contextPane (max-width: 455px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
      rowGap: "21px",
    },
  },
});

globalStyle(".conversation-usage-scroll", {
  "@container": {
    "contextPane (max-width: 455px)": { padding: "26px 25px 38px" },
  },
});

globalStyle(".context-breakdown-legend", {
  "@container": {
    "contextPane (max-width: 455px)": {
      gridTemplateColumns: "repeat(2, max-content)",
    },
  },
});

globalStyle(".context-message-list summary", {
  "@container": {
    "contextPane (max-width: 455px)": {
      gridTemplateColumns: "16px max-content minmax(0, 1fr)",
    },
  },
});

globalStyle(".context-message-list summary time", {
  "@container": {
    "contextPane (max-width: 455px)": { display: "none" },
  },
});

globalStyle(".tool-approval-backdrop", {
  position: "fixed",
  inset: "0",
  zIndex: "80",
  display: "grid",
  placeItems: "center",
  padding: "24px",
  background: "rgb(0 0 0 / 42%)",
  backdropFilter: "blur(2px)",
  animation: `${toolApprovalFadeIn} 140ms ease-out`,
});

globalStyle(".tool-approval-dialog", {
  width: "min(468px, calc(100vw - 48px))",
  padding: "20px",
  color: "var(--ink)",
  border: "1px solid var(--line-strong)",
  borderRadius: "14px",
  background: "var(--surface)",
  boxShadow: "0 24px 70px rgb(0 0 0 / 32%)",
  animation: `${toolApprovalRiseIn} 160ms cubic-bezier(.2,.8,.2,1)`,
});

globalStyle(".tool-approval-heading", {
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
});

globalStyle(".tool-approval-icon", {
  display: "grid",
  width: "34px",
  height: "34px",
  flex: "0 0 auto",
  placeItems: "center",
  color: "#d28a22",
  borderRadius: "9px",
  background: "rgb(210 138 34 / 12%)",
});

globalStyle(".tool-approval-heading h2", {
  margin: "0",
  fontSize: "15px",
  fontWeight: "600",
  lineHeight: "1.4",
});

globalStyle(".tool-approval-heading p", {
  margin: "3px 0 0",
  color: "var(--muted)",
  fontSize: "13px",
});

globalStyle(".tool-approval-command", {
  maxHeight: "180px",
  margin: "16px 0 0",
  padding: "11px 12px",
  overflow: "auto",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: "9px",
  background: "var(--message-bubble)",
  fontFamily: "var(--font-code)",
  fontSize: "12px",
  lineHeight: "1.55",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});

globalStyle(".tool-approval-reason", {
  margin: "13px 0 0",
  color: "var(--muted)",
  fontSize: "12px",
  lineHeight: "1.55",
});

globalStyle(".tool-approval-risk", {
  display: "flex",
  gap: "8px",
  marginTop: "9px",
  color: "var(--muted)",
  fontSize: "11px",
});

globalStyle(".tool-approval-risk span + span::before", {
  marginRight: "8px",
  content: "·",
});

globalStyle(".tool-approval-actions", {
  display: "flex",
  justifyContent: "flex-end",
  gap: "8px",
  marginTop: "18px",
});

globalStyle(".tool-approval-actions button", {
  minHeight: "34px",
  padding: "0 13px",
  color: "var(--ink)",
  border: "1px solid var(--line-strong)",
  borderRadius: "8px",
  background: "transparent",
  cursor: "pointer",
});

globalStyle(".tool-approval-actions button.primary", {
  color: "var(--surface)",
  borderColor: "var(--ink)",
  background: "var(--ink)",
});

globalStyle(".tool-approval-actions button:disabled", {
  cursor: "wait",
  opacity: "0.52",
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
  minHeight: "48px",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 15px",
  borderBottom: "1px solid var(--line)",
});

globalStyle(".review-toolbar-copy", {
  display: "inline-flex",
  minWidth: "0",
  alignItems: "baseline",
  gap: "7px",
});

globalStyle(".review-toolbar-copy strong", {
  color: "var(--ink)",
  fontSize: "13px",
  fontWeight: "600",
});

globalStyle(".review-toolbar-copy svg", {
  color: "var(--muted)",
});

globalStyle(".review-toolbar button", {
  padding: "0",
  color: "var(--muted)",
  border: "0",
  background: "transparent",
  fontSize: "11px",
});

globalStyle(".review-toolbar button.active", {
  color: "var(--ink)",
  fontWeight: "600",
});

globalStyle(".review-toolbar span", {
  color: "var(--subtle)",
  fontSize: "12px",
});

globalStyle(".review-toolbar .review-total-add", { color: "#159467" });
globalStyle(".review-toolbar .review-total-del", { color: "#d24848" });

globalStyle(".review-toolbar .review-revert-button", {
  display: "inline-flex",
  minHeight: "26px",
  alignItems: "center",
  gap: "5px",
  padding: "0 8px",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: "7px",
  background: "var(--surface-soft)",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "12px",
  fontWeight: "520",
});

globalStyle(".review-toolbar .review-revert-button:hover:not(:disabled)", {
  borderColor: "color-mix(in srgb, #d24848 40%, var(--line))",
  color: "#d24848",
});

globalStyle(".review-toolbar .review-revert-button:disabled", {
  opacity: "0.42",
  cursor: "not-allowed",
});

globalStyle(".review-state", {
  display: "flex",
  minHeight: "0",
  flex: "1 1 auto",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  gap: "10px",
  padding: "28px",
  color: "var(--muted)",
  fontSize: "12px",
  textAlign: "center",
});

globalStyle(".review-state.is-error", { color: "#d24848" });

globalStyle(".review-notice", {
  display: "flex",
  alignItems: "flex-start",
  gap: "7px",
  padding: "9px 12px",
  color: "color-mix(in srgb, #c87b22 78%, var(--ink))",
  borderBottom: "1px solid var(--line)",
  background: "color-mix(in srgb, #c87b22 7%, var(--surface))",
  fontSize: "11px",
  lineHeight: "1.5",
});

globalStyle(".review-notice svg", { flex: "0 0 auto", marginTop: "1px" });

globalStyle(".review-worktree", {
  display: "grid",
  gap: "8px",
  padding: "11px 13px 12px",
  borderBottom: "1px solid var(--line)",
  background:
    "color-mix(in srgb, var(--surface-soft) 72%, var(--surface))",
});

globalStyle(".review-worktree-status", {
  display: "flex",
  minWidth: "0",
  alignItems: "center",
  gap: "7px",
});

globalStyle(".review-worktree-status > span", {
  width: "7px",
  height: "7px",
  flex: "0 0 auto",
  borderRadius: "999px",
  background: "#c8872e",
  boxShadow: "0 0 0 3px color-mix(in srgb, #c8872e 13%, transparent)",
});

globalStyle(".review-worktree.is-conflicted .review-worktree-status > span", {
  background: "#d24848",
  boxShadow: "0 0 0 3px color-mix(in srgb, #d24848 13%, transparent)",
});

globalStyle(".review-worktree.is-branched .review-worktree-status > span", {
  background: "#159467",
  boxShadow: "0 0 0 3px color-mix(in srgb, #159467 13%, transparent)",
});

globalStyle(".review-worktree-status strong", {
  minWidth: "0",
  overflow: "hidden",
  color: "var(--ink)",
  fontSize: "12px",
  fontWeight: "600",
  lineHeight: "1.3",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".review-worktree > p", {
  display: "-webkit-box",
  margin: "0",
  overflow: "hidden",
  color: "var(--muted)",
  fontSize: "12px",
  lineHeight: "1.45",
  overflowWrap: "anywhere",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: "3",
});

globalStyle(".review-worktree-actions", {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
});

globalStyle(".review-worktree-actions button", {
  display: "inline-flex",
  minHeight: "28px",
  alignItems: "center",
  justifyContent: "center",
  gap: "5px",
  padding: "0 9px",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: "7px",
  background: "var(--surface)",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "12px",
  fontWeight: "520",
  transition: "border-color 120ms ease, background 120ms ease",
});

globalStyle(".review-worktree-actions button:hover:not(:disabled)", {
  borderColor: "color-mix(in srgb, var(--ink) 25%, var(--line))",
  background: "color-mix(in srgb, var(--ink) 4%, var(--surface))",
});

globalStyle(".review-worktree-actions button.is-primary", {
  color: "color-mix(in srgb, #159467 82%, var(--ink))",
  borderColor: "color-mix(in srgb, #159467 34%, var(--line))",
});

globalStyle(".review-worktree-actions button.is-danger", {
  color: "color-mix(in srgb, #d24848 82%, var(--ink))",
});

globalStyle(".review-worktree-actions button:disabled", {
  opacity: "0.42",
  cursor: "not-allowed",
});

globalStyle(".review-worktree-branch-form", {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "6px",
});

globalStyle(".review-worktree-branch-form input", {
  width: "100%",
  minWidth: "0",
  height: "30px",
  padding: "0 9px",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: "7px",
  outline: "none",
  background: "var(--surface)",
  fontFamily: "inherit",
  fontSize: "12px",
});

globalStyle(".review-worktree-branch-form input:focus", {
  borderColor: "color-mix(in srgb, var(--blue) 56%, var(--line))",
  boxShadow: "0 0 0 2px color-mix(in srgb, var(--blue) 10%, transparent)",
});

globalStyle(".review-worktree-branch-form button", {
  display: "inline-grid",
  minWidth: "48px",
  height: "30px",
  placeItems: "center",
  padding: "0 10px",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: "7px",
  background: "var(--surface)",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "12px",
  fontWeight: "520",
});

globalStyle(".review-worktree-branch-form button:disabled", {
  opacity: "0.42",
  cursor: "not-allowed",
});

globalStyle(".review-file-accordion", {
  minHeight: "0",
  flex: "1 1 auto",
  overflowX: "hidden",
  overflowY: "auto",
  overscrollBehaviorY: "contain",
  scrollbarGutter: "stable",
});

globalStyle(".review-file-item", {
  width: "100%",
  minWidth: "0",
  overflow: "hidden",
  borderBottom: "1px solid color-mix(in srgb, var(--line) 78%, transparent)",
  background: "color-mix(in srgb, var(--surface) 97%, var(--ink) 3%)",
});

globalStyle(".review-file-trigger", {
  display: "grid",
  width: "100%",
  minHeight: "41px",
  gridTemplateColumns: "14px 26px minmax(0, 1fr) auto auto",
  alignItems: "center",
  gap: "7px",
  padding: "0 13px 0 10px",
  color: "var(--ink)",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
  transition: "background 120ms ease",
});

globalStyle(".review-file-trigger:hover", {
  background: "color-mix(in srgb, var(--ink) 4.5%, transparent)",
});

globalStyle(".review-file-trigger:focus-visible", {
  outline: "2px solid color-mix(in srgb, var(--blue) 64%, transparent)",
  outlineOffset: "-2px",
});

globalStyle(".review-file-conflict", {
  minWidth: "0",
  color: "#d24848",
  fontSize: "10px",
  fontWeight: "600",
});

globalStyle(".review-file-chevron", {
  color: "var(--subtle)",
  transition: "transform 150ms cubic-bezier(0.2, 0.72, 0.22, 1)",
});

globalStyle(".review-file-item.is-expanded .review-file-chevron", {
  transform: "rotate(90deg)",
});

globalStyle(".review-file-type", {
  display: "inline-grid",
  width: "25px",
  height: "19px",
  placeItems: "center",
  borderRadius: "5px",
  background: "color-mix(in srgb, var(--blue) 16%, var(--surface-soft))",
  color: "color-mix(in srgb, var(--blue) 80%, var(--ink))",
  fontSize: "9px",
  fontWeight: "700",
  letterSpacing: "-0.02em",
});

globalStyle(".review-file-path", {
  display: "inline-flex",
  minWidth: "0",
  overflow: "hidden",
  alignItems: "baseline",
  fontSize: "13px",
  lineHeight: "1.25",
  whiteSpace: "nowrap",
});

globalStyle(".review-file-path .review-file-directory", {
  minWidth: "18px",
  flex: "1 1 auto",
});

globalStyle(".review-file-path .review-file-name", {
  flex: "0 1 auto",
});

globalStyle(".review-file-stats", {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "5px",
  fontSize: "12px",
  fontVariantNumeric: "tabular-nums",
  fontWeight: "600",
});

globalStyle(".review-file-stats span:first-child", { color: "#159467" });
globalStyle(".review-file-stats span:last-child", { color: "#d24848" });

globalStyle(".review-file-panel", {
  overflow: "hidden",
  borderTop: "1px solid color-mix(in srgb, var(--line) 68%, transparent)",
  background: "color-mix(in srgb, var(--canvas) 76%, var(--surface-soft))",
  animation: `${reviewFileExpand} 150ms cubic-bezier(0.2, 0.72, 0.22, 1)`,
  "@media": {
    "(prefers-reduced-motion: reduce)": { animation: "none" },
  },
});

globalStyle(".review-file-list", {
  display: "flex",
  minWidth: "0",
  gap: "3px",
  padding: "7px 10px",
  overflowX: "auto",
  borderBottom: "1px solid var(--line)",
  scrollbarWidth: "none",
  transition: "opacity 90ms cubic-bezier(0.2, 0.75, 0.25, 1)",
  "@media": {
    "(prefers-reduced-motion: reduce)": {
      transition: "none",
    },
  },
});

globalStyle('[data-slot="aui_thread-viewport"]', {
  overscrollBehaviorY: "contain",
  scrollbarGutter: "stable",
  scrollbarWidth: "thin",
  scrollbarColor:
    "color-mix(in srgb, var(--muted) 34%, transparent) transparent",
  transition: "opacity 90ms cubic-bezier(0.2, 0.75, 0.25, 1)",
  "@media": {
    "(prefers-reduced-motion: reduce)": {
      transition: "none",
    },
  },
});

globalStyle('[data-slot="aui_thread-viewport"]::-webkit-scrollbar', {
  width: "12px",
  height: "12px",
});

globalStyle('[data-slot="aui_thread-viewport"]::-webkit-scrollbar-track', {
  background: "transparent",
});

globalStyle('[data-slot="aui_thread-viewport"]::-webkit-scrollbar-thumb', {
  minHeight: "52px",
  border: "4px solid transparent",
  borderRadius: "999px",
  background:
    "color-mix(in srgb, var(--muted) 38%, transparent) padding-box",
});

globalStyle('[data-slot="aui_thread-viewport"]::-webkit-scrollbar-thumb:hover', {
  background:
    "color-mix(in srgb, var(--muted) 58%, transparent) padding-box",
});

globalStyle('[data-slot="aui_thread-viewport"]::-webkit-scrollbar-thumb:active', {
  background:
    "color-mix(in srgb, var(--blue) 62%, var(--muted)) padding-box",
});

globalStyle('[data-slot="aui_thread-viewport"]::-webkit-scrollbar-corner', {
  background: "transparent",
});

globalStyle(".review-file-list::-webkit-scrollbar", {
  display: "none",
});

globalStyle(".review-file-list button", {
  display: "inline-flex",
  maxWidth: "320px",
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

globalStyle(".review-file-list button > span", {
  display: "inline-flex",
  minWidth: "0",
  overflow: "hidden",
  whiteSpace: "nowrap",
});

globalStyle(".review-file-directory", {
  overflow: "hidden",
  color: "var(--muted)",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".review-file-name", {
  minWidth: "0",
  overflow: "hidden",
  flex: "0 1 auto",
  color: "var(--ink)",
  fontWeight: "560",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".review-file-list button small", {
  color: "var(--subtle)",
  fontSize: "8px",
});

globalStyle(".review-file-list button.active", {
  color: "var(--ink)",
  background: "var(--surface-soft)",
});

globalStyle(".review-change-preview", {
  display: "grid",
  minHeight: "0",
  flex: "1 1 auto",
  gridTemplateRows: "55px minmax(0, 1fr)",
});

globalStyle(".review-change-preview > header", {
  display: "flex",
  minWidth: "0",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  padding: "0 15px",
  borderBottom: "1px solid var(--line)",
});

globalStyle(".review-change-preview > header > div", {
  display: "flex",
  minWidth: "0",
  flexDirection: "column",
  gap: "3px",
});

globalStyle(".review-change-preview > header em", {
  flex: "0 0 auto",
  color: "var(--subtle)",
  fontSize: "8px",
  fontStyle: "normal",
});

globalStyle(".review-file-diff-shell", {
  minHeight: "0",
  padding: "12px 10px 26px",
  overflow: "auto",
  overscrollBehavior: "contain",
  background: "color-mix(in srgb, var(--surface-soft) 28%, transparent)",
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
  overscrollBehavior: "contain",
  scrollbarGutter: "stable",
  scrollbarWidth: "thin",
  scrollbarColor:
    "color-mix(in srgb, var(--muted) 34%, transparent) transparent",
  background: "color-mix(in srgb, var(--surface-soft) 28%, transparent)",
});

globalStyle(".review-selected-file-path", {
  display: "inline-flex",
  minWidth: "0",
  alignItems: "baseline",
  fontFamily:
    'var(--ui-font, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)',
});

globalStyle(".review-selected-file-path .review-file-directory", {
  color: "var(--subtle)",
  fontWeight: "400",
});

globalStyle(".review-selected-file-path .review-file-name", {
  color: "var(--ink)",
  fontWeight: "600",
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
  flex: "1 1 auto",
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
