import { globalStyle } from "@vanilla-extract/css";

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
  gap: "10px",
  minHeight: "38px",
  padding: "0 8px",
});

globalStyle(".brand-logo", {
  position: "relative",
  width: "34px",
  height: "34px",
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

globalStyle(".brand > div", {
  display: "flex",
  minWidth: "0",
  flexDirection: "column",
});

globalStyle(".brand strong", {
  fontSize: "16px",
  lineHeight: "1.1",
  letterSpacing: "-0.03em",
});

globalStyle(".brand small", {
  marginTop: "4px",
  color: "var(--muted)",
  fontSize: "10px",
});

globalStyle(".new-task-button,\n.nav-item,\n.history-item,\n.workspace-link,\n.settings-link", {
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

globalStyle(".new-task-button:active,\n.nav-item:active,\n.history-item:active,\n.workspace-link:active,\n.settings-link:active", {
  transform: "scale(0.985)",
});

globalStyle(".new-task-button", {
  minHeight: "41px",
  marginTop: "14px",
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

globalStyle(".primary-nav", {
  display: "grid",
  gap: "2px",
  marginTop: "12px",
  paddingBottom: "14px",
  borderBottom: "1px solid #e6e9ed",
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
  minHeight: "0",
  marginTop: "15px",
  overflowX: "hidden",
  overflowY: "auto",
});

globalStyle(".sidebar-section-heading", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: "30px",
  padding: "0 8px",
  color: "#858d99",
  fontSize: "10px",
  fontWeight: "650",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
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
  background: "#eceff3",
});

globalStyle(".history-label", {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  margin: "10px 8px 6px",
  color: "#a0a6af",
  fontSize: "9px",
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
  borderRadius: "8px",
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
  paddingRight: "34px",
});

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
  background: "transparent",
  cursor: "pointer",
  opacity: "0",
  pointerEvents: "none",
  transform: "translateY(-50%)",
  transition: "opacity 120ms ease, background 120ms ease, color 120ms ease",
});

globalStyle(".history-row:hover .history-archive-action,\n.history-row:focus-within .history-archive-action", {
  opacity: "1",
  pointerEvents: "auto",
});

globalStyle(".history-archive-action:hover", {
  color: "#313740",
  background: "#dde2e8",
});

globalStyle(".history-item > span:last-child", {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".history-empty", {
  padding: "10px 9px",
  color: "var(--subtle)",
  fontSize: "10px",
});

globalStyle(".sidebar-spacer", {
  flex: "1",
});

globalStyle(".workspace-shortcut", {
  padding: "12px 0",
  borderTop: "1px solid #e6e9ed",
});

globalStyle(".workspace-link,\n.settings-link", {
  minHeight: "36px",
  padding: "0 10px",
  borderRadius: "8px",
  fontSize: "11px",
});

globalStyle(".workspace-link:hover", {
  background: "#eef1f5",
});

globalStyle(".settings-link", {
  flex: "0 0 auto",
});
