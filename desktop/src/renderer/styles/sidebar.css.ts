import { globalStyle, keyframes } from "@vanilla-extract/css";

const historyTitleMarquee = keyframes({
  from: { transform: "translateX(0)" },
  to: {
    transform: "translateX(calc(-1 * var(--history-title-overflow, 0px)))",
  },
});

const historyProcessingSpin = keyframes({
  to: { transform: "translateY(-50%) rotate(360deg)" },
});

globalStyle(".sidebar", {
  display: "flex",
  flexDirection: "column",
  minHeight: "0",
  padding: "4px 12px 12px",
  overflow: "hidden",
  background: "var(--canvas)",
  opacity: "1",
  transform: "translateX(0)",
  transition:
    "opacity 170ms ease, transform 220ms cubic-bezier(0.2, 0.75, 0.25, 1), visibility 220ms",
});

globalStyle(".brand", {
  display: "flex",
  alignItems: "center",
  gap: "9px",
  minHeight: "42px",
  padding: "0 8px",
});

globalStyle(".brand-logo", {
  position: "relative",
  width: "30px",
  height: "30px",
  flex: "0 0 auto",
});

globalStyle(".brand-mark", {
  position: "absolute",
  inset: "0",
  display: "block",
  width: "100%",
  height: "100%",
  objectFit: "contain",
  imageRendering: "auto",
  transition: "opacity 140ms ease",
});

globalStyle(".brand-mark-dark", {
  opacity: "0",
});

globalStyle('[data-theme="dark"] .brand-mark-light', {
  opacity: "0",
});

globalStyle('[data-theme="dark"] .brand-mark-dark', {
  opacity: "1",
});

globalStyle(".brand-wordmark", {
  minWidth: "0",
  marginRight: "-0.1em",
  color: "transparent",
  backgroundImage:
    "linear-gradient(105deg, var(--ink) 0%, var(--ink) 58%, var(--muted) 100%)",
  backgroundClip: "text",
  WebkitBackgroundClip: "text",
  fontFamily:
    '"Segoe UI Variable Display", "SF Pro Display", var(--ui-font)',
  fontSize: "22px",
  fontWeight: "740",
  fontOpticalSizing: "auto",
  letterSpacing: "0.1em",
  lineHeight: "30px",
  whiteSpace: "nowrap",
});

globalStyle(".brand-search", {
  display: "grid",
  width: "30px",
  height: "30px",
  marginLeft: "auto",
  padding: "0",
  placeItems: "center",
  color: "var(--muted)",
  border: "0",
  borderRadius: "7px",
  background: "transparent",
  cursor: "pointer",
});

globalStyle(".brand-search:hover", {
  color: "var(--ink)",
  background: "transparent",
});

globalStyle(".new-task-button,\n.nav-item,\n.history-item,\n.settings-link", {
  display: "flex",
  alignItems: "center",
  width: "100%",
  gap: "10px",
  color: "#343942",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  transition:
    "color 140ms ease, background-color 140ms ease, transform 140ms ease",
});

globalStyle(".new-task-button", {
  minHeight: "41px",
  padding: "0 10px",
  color: "#30343a",
  borderRadius: "8px",
  background: "transparent",
  boxShadow: "none",
  fontSize: "12px",
  fontWeight: "500",
});

globalStyle(".new-task-button:hover", {
  background: "#e5e7ea",
});

globalStyle(".sidebar-scroll", {
  position: "relative",
  flex: "1 1 auto",
  minHeight: "0",
  marginTop: "10px",
  overflowX: "hidden",
  overflowY: "auto",
  overscrollBehavior: "contain",
  scrollbarGutter: "auto",
});

globalStyle(".sidebar-scroll::-webkit-scrollbar", {
  width: "6px",
});

globalStyle(".sidebar-scroll::-webkit-scrollbar-track", {
  background: "transparent",
});

globalStyle(".sidebar-scroll::-webkit-scrollbar-thumb", {
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--muted) 30%, transparent)",
});

globalStyle(".new-task-sticky", {
  position: "sticky",
  top: "0",
  zIndex: "4",
  paddingBottom: "6px",
  background: "var(--canvas)",
  transform: "translateZ(0)",
});

globalStyle(".new-task-sticky::after", {
  position: "absolute",
  right: "0",
  bottom: "-10px",
  left: "0",
  height: "10px",
  background:
    "linear-gradient(to bottom, color-mix(in srgb, var(--canvas) 82%, transparent), transparent)",
  content: '""',
  pointerEvents: "none",
});

globalStyle(".primary-nav", {
  display: "grid",
  gap: "2px",
  marginTop: "8px",
  paddingBottom: "14px",
});

globalStyle(".nav-item,\n.settings-link", {
  minHeight: "37px",
  padding: "0 11px",
  borderRadius: "8px",
  fontSize: "12px",
});

globalStyle(".nav-item:hover,\n.nav-item.active,\n.settings-link:hover,\n.settings-link.active", {
  color: "#111318",
  background: "#e5e7ea",
});

globalStyle(".nav-item.active", {
  fontWeight: "650",
});

globalStyle(".task-history", {
  display: "flex",
  flexDirection: "column",
  marginTop: "12px",
  paddingBottom: "14px",
});

globalStyle(".sidebar-section-heading", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: "30px",
  padding: "0 8px",
  color: "#858d99",
  fontSize: "14px",
  fontWeight: "500",
  letterSpacing: "0",
});

globalStyle(".sidebar-section-heading button", {
  display: "grid",
  width: "27px",
  height: "27px",
  padding: "0",
  placeItems: "center",
  color: "var(--muted)",
  border: "0",
  borderRadius: "7px",
  background: "transparent",
  cursor: "pointer",
});

globalStyle(".sidebar-section-heading button:hover", {
  background: "transparent",
});

globalStyle(".collapsible-heading", {
  paddingRight: "0",
});

globalStyle(".section-toggle", {
  display: "flex !important",
  width: "auto !important",
  minWidth: "0",
  height: "30px !important",
  padding: "0 !important",
  alignItems: "center",
  gap: "3px",
  color: "inherit",
  background: "transparent !important",
});

globalStyle(".section-toggle:hover", {
  color: "var(--ink)",
});

globalStyle(".section-toggle svg", {
  flex: "0 0 auto",
  opacity: "0",
});

globalStyle(".section-hover-actions", {
  display: "flex",
  marginLeft: "auto",
  marginRight: "-4px",
  opacity: "0",
  pointerEvents: "none",
});

globalStyle(
  ".collapsible-heading:hover .section-toggle svg,\n.collapsible-heading:focus-within .section-toggle svg,\n.collapsible-heading:hover .section-hover-actions,\n.collapsible-heading:focus-within .section-hover-actions",
  {
    opacity: "1",
    pointerEvents: "auto",
  },
);

globalStyle(".section-hover-actions button", {
  color: "var(--muted)",
});

globalStyle(".section-hover-actions button:hover", {
  color: "var(--ink)",
  background: "transparent",
});

globalStyle(".history-label", {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  minHeight: "30px",
  margin: "11px 8px 4px",
  color: "#555c66",
  fontSize: "14px",
  fontWeight: "500",
});

globalStyle(".history-label span", {
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".history-search", {
  width: "calc(100% - 12px)",
  minHeight: "32px",
  margin: "4px 6px 2px",
  padding: "0 9px",
  color: "var(--ink)",
  border: "1px solid #dce1e7",
  borderRadius: "8px",
  outline: "0",
  background: "#fff",
  fontSize: "10px",
});

globalStyle(".history-search:focus", {
  borderColor: "#a9c4ee",
  boxShadow: "0 0 0 3px #eaf2ff",
});

globalStyle(".history-item", {
  flex: "0 0 auto",
  minHeight: "34px",
  padding: "0 9px",
  borderRadius: "8px",
  fontSize: "11px",
});

globalStyle(".task-history > .history-item", {
  overflow: "hidden",
});

globalStyle(".history-row", {
  position: "relative",
  flex: "0 0 auto",
  margin: "2px 1px",
  borderRadius: "8px",
  contain: "layout paint",
});

globalStyle(".project-task-group .history-row", {
  marginLeft: "1px",
});

globalStyle(".project-task-group .history-row .history-item", {
  paddingLeft: "33px",
});

globalStyle(".recent-task-group", {
  marginTop: "16px",
});

globalStyle(".history-row:hover,\n.history-row.current", {
  background: "#e2e4e7",
});

globalStyle(".history-row.current .history-item", {
  color: "#22262b",
  fontWeight: "500",
});

globalStyle(".history-row .history-item", {
  gap: "0",
  paddingLeft: "11px",
  paddingRight: "11px",
});

globalStyle(
  ".history-row.processing .history-item",
  {
    paddingRight: "34px",
  },
);

globalStyle(".history-archive-action", {
  position: "absolute",
  top: "50%",
  right: "5px",
  display: "grid",
  width: "25px",
  height: "25px",
  padding: "0",
  placeItems: "center",
  color: "#7b838e",
  border: "0",
  borderRadius: "6px",
  background: "var(--history-row-action-bg, #e2e4e7)",
  cursor: "pointer",
  opacity: "0",
  pointerEvents: "none",
  transform: "translateY(-50%)",
  transition: "opacity 120ms ease, background 120ms ease, color 120ms ease",
});

globalStyle(".history-archive-action::before", {
  position: "absolute",
  top: "0",
  right: "calc(100% - 1px)",
  width: "18px",
  height: "100%",
  background:
    "linear-gradient(90deg, transparent, var(--history-row-action-bg, #e2e4e7) 78%)",
  content: '""',
  pointerEvents: "none",
});

globalStyle(".history-row:hover .history-archive-action,\n.history-row:focus-within .history-archive-action", {
  opacity: "1",
  pointerEvents: "auto",
});

globalStyle(".history-archive-action:hover", {
  color: "#313740",
  background: "#dde2e8",
});

globalStyle(".history-title-viewport", {
  display: "block",
  width: "100%",
  overflow: "hidden",
  whiteSpace: "nowrap",
});

globalStyle(".history-processing-indicator", {
  position: "absolute",
  top: "50%",
  right: "11px",
  width: "14px",
  height: "14px",
  border: "2px solid color-mix(in srgb, var(--subtle) 38%, transparent)",
  borderTopColor: "var(--muted)",
  borderRadius: "50%",
  animation: `${historyProcessingSpin} 850ms linear infinite`,
  pointerEvents: "none",
  transform: "translateY(-50%)",
});

globalStyle(
  ".history-row:hover .history-processing-indicator,\n.history-row:focus-within .history-processing-indicator",
  {
    opacity: "0",
  },
);

globalStyle(".history-title-text", {
  display: "inline-block",
  minWidth: "max-content",
  whiteSpace: "nowrap",
});

globalStyle(".history-row:hover .history-title-viewport.is-overflowing", {
  WebkitMaskImage:
    "linear-gradient(90deg, transparent 0, #000 9px, #000 calc(100% - 9px), transparent 100%)",
  maskImage:
    "linear-gradient(90deg, transparent 0, #000 9px, #000 calc(100% - 9px), transparent 100%)",
});

globalStyle(
  ".history-row:hover .history-title-viewport.is-overflowing .history-title-text",
  {
    animation: `${historyTitleMarquee} 18s 700ms linear infinite alternate`,
    willChange: "transform",
  },
);

globalStyle(".history-empty", {
  padding: "10px 9px",
  color: "var(--subtle)",
  fontSize: "10px",
});

globalStyle(".settings-link", {
  minHeight: "36px",
  padding: "0 10px",
  borderRadius: "8px",
  fontSize: "11px",
});

globalStyle(".settings-link", {
  flex: "0 0 auto",
});

globalStyle(".project-dialog-backdrop", {
  position: "fixed",
  inset: "0",
  zIndex: "100",
  display: "grid",
  padding: "24px",
  placeItems: "center",
  background: "rgb(0 0 0 / 34%)",
  backdropFilter: "blur(2px)",
});

globalStyle(".project-dialog", {
  width: "min(560px, calc(100vw - 48px))",
  padding: "24px",
  color: "var(--ink)",
  border: "1px solid color-mix(in srgb, var(--line) 62%, transparent)",
  borderRadius: "24px",
  background: "var(--surface-soft)",
  boxShadow: "0 28px 90px rgb(0 0 0 / 32%)",
});

globalStyle(".project-dialog header", {
  display: "flex",
  minHeight: "36px",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "14px",
});

globalStyle(".project-dialog h2", {
  margin: "0",
  fontSize: "22px",
  fontWeight: "680",
  letterSpacing: "-0.025em",
});

globalStyle(".project-dialog header button", {
  display: "grid",
  width: "30px",
  height: "30px",
  padding: "0",
  placeItems: "center",
  color: "var(--muted)",
  border: "0",
  borderRadius: "8px",
  background: "transparent",
  cursor: "pointer",
});

globalStyle(".project-dialog header button:hover", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--ink) 7%, transparent)",
});

globalStyle(".project-name-field", {
  display: "flex",
  minHeight: "49px",
  padding: "0 14px",
  alignItems: "center",
  gap: "10px",
  color: "var(--muted)",
  border: "1px solid color-mix(in srgb, #6ba7f4 72%, var(--line))",
  borderRadius: "14px",
  background: "color-mix(in srgb, var(--surface) 72%, transparent)",
  boxShadow: "0 0 0 1px rgb(74 145 235 / 8%)",
});

globalStyle(".project-name-field input", {
  width: "100%",
  minWidth: "0",
  padding: "0",
  color: "var(--ink)",
  border: "0",
  outline: "0",
  background: "transparent",
  fontSize: "14px",
});

globalStyle(".project-source-label", {
  display: "block",
  margin: "17px 0 9px",
  fontSize: "14px",
  fontWeight: "650",
});

globalStyle(".project-source-picker", {
  display: "flex",
  width: "100%",
  minHeight: "120px",
  padding: "18px",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  gap: "10px",
  color: "var(--muted)",
  border: "1px solid var(--line)",
  borderRadius: "14px",
  background: "color-mix(in srgb, var(--surface) 50%, transparent)",
  cursor: "pointer",
});

globalStyle(".project-source-picker:hover", {
  color: "var(--ink)",
  borderColor: "var(--line-strong)",
  background: "var(--surface)",
});

globalStyle(".project-source-picker span", {
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".project-dialog footer", {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  marginTop: "20px",
});

globalStyle(".project-dialog footer button", {
  minHeight: "40px",
  padding: "0 18px",
  color: "var(--muted)",
  border: "0",
  borderRadius: "11px",
  background: "transparent",
  cursor: "pointer",
  fontSize: "14px",
});

globalStyle(".project-dialog footer button:hover:not(:disabled)", {
  color: "var(--ink)",
});

globalStyle(".project-dialog footer .create-project-confirm", {
  color: "var(--surface)",
  background: "var(--ink)",
});

globalStyle(".project-dialog footer .create-project-confirm:hover:not(:disabled)", {
  color: "var(--surface)",
  background: "color-mix(in srgb, var(--ink) 90%, var(--muted))",
});

globalStyle(".project-dialog footer button:disabled", {
  cursor: "not-allowed",
  opacity: "0.38",
});
