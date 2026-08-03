import { globalStyle } from "@vanilla-extract/css";

globalStyle(".settings-shell", {
  display: "grid",
  gridTemplateColumns: "var(--sidebar-width) minmax(0, 1fr)",
  width: "100%",
  height: "100%",
  minWidth: "980px",
  paddingTop: "32px",
  overflow: "hidden",
  background: "var(--canvas)",
  transition: "grid-template-columns 220ms cubic-bezier(0.2, 0.75, 0.25, 1)",
});

globalStyle(".sidebar-collapsed .settings-shell", {
  gridTemplateColumns: "0 minmax(0, 1fr)",
});

globalStyle(".settings-sidebar", {
  display: "flex",
  minHeight: "0",
  flexDirection: "column",
  padding: "4px 12px 12px",
  background: "var(--canvas)",
  opacity: "1",
  transform: "translateX(0)",
  transition:
    "opacity 170ms ease, transform 220ms cubic-bezier(0.2, 0.75, 0.25, 1), visibility 220ms",
});

globalStyle(".settings-surface", {
  display: "grid",
  minWidth: "0",
  minHeight: "0",
  gridTemplateRows: "44px minmax(0, 1fr)",
  overflow: "hidden",
  border: "1px solid #d9dce1",
  borderRight: "0",
  borderBottom: "0",
  borderRadius: "14px 0 0 0",
  background: "var(--surface)",
  gridColumn: "2",
});

globalStyle(".settings-topbar", {
  minHeight: "44px",
  borderBottom: "1px solid var(--line)",
  background: "var(--surface)",
});

globalStyle(".settings-back", {
  display: "inline-flex",
  width: "fit-content",
  minHeight: "34px",
  alignItems: "center",
  gap: "7px",
  padding: "0 9px",
  color: "#5d6570",
  border: "0",
  borderRadius: "8px",
  background: "transparent",
  cursor: "pointer",
  fontSize: "11px",
});

globalStyle(".settings-back:hover", {
  color: "#171a1f",
  background: "#edf0f3",
});

globalStyle(".settings-sidebar-title", {
  display: "flex",
  flexDirection: "column",
  margin: "17px 9px 14px",
});

globalStyle(".settings-sidebar-title strong", {
  fontSize: "18px",
  letterSpacing: "-0.025em",
});

globalStyle(".settings-sidebar-title small", {
  marginTop: "4px",
  color: "var(--muted)",
  fontSize: "9px",
});

globalStyle(".settings-search", {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  minHeight: "36px",
  alignItems: "center",
  gap: "7px",
  marginBottom: "13px",
  padding: "0 10px",
  color: "#89919c",
  border: "1px solid #dde2e8",
  borderRadius: "9px",
  background: "#fff",
});

globalStyle(".settings-search:focus-within", {
  color: "var(--blue)",
  borderColor: "#a9c4ee",
  boxShadow: "0 0 0 3px #eaf2ff",
});

globalStyle(".settings-search input", {
  width: "100%",
  minWidth: "0",
  height: "34px",
  padding: "0",
  color: "var(--ink)",
  border: "0",
  outline: "0",
  background: "transparent",
  font: "inherit",
  fontSize: "10px",
});

globalStyle(".settings-sidebar nav", {
  display: "grid",
  gap: "3px",
});

globalStyle(".settings-nav-item", {
  display: "grid",
  gridTemplateColumns: "auto 1fr auto",
  minHeight: "38px",
  alignItems: "center",
  gap: "9px",
  padding: "0 10px",
  color: "#4d5560",
  border: "0",
  borderRadius: "8px",
  background: "transparent",
  cursor: "pointer",
  fontSize: "11px",
  textAlign: "left",
});

globalStyle(".settings-nav-item:hover,\n.settings-nav-item.active", {
  color: "#171a1f",
  background: "#e9edf1",
});

globalStyle(".settings-nav-item.active", {
  fontWeight: "650",
});

globalStyle(".settings-nav-item small", {
  minWidth: "20px",
  padding: "2px 5px",
  color: "#747c87",
  borderRadius: "8px",
  background: "#dfe4e9",
  fontSize: "8px",
  textAlign: "center",
});

globalStyle(".settings-search-empty", {
  margin: "8px 10px",
  color: "var(--subtle)",
  fontSize: "10px",
});

globalStyle(".settings-layout", {
  minWidth: "0",
  minHeight: "0",
  height: "100%",
  overflow: "auto",
  background: "var(--surface)",
});

globalStyle(".settings-unavailable", {
  display: "grid",
  minHeight: "100%",
  placeContent: "center",
  justifyItems: "center",
  color: "#68717d",
  textAlign: "center",
});

globalStyle(".settings-unavailable strong", {
  marginTop: "11px",
  color: "#30353c",
  fontSize: "13px",
});

globalStyle(".settings-unavailable p", {
  margin: "6px 0 0",
  fontSize: "10px",
});

globalStyle(".settings-toolbar", {
  alignItems: "flex-end",
});

globalStyle(".settings-toolbar p", {
  margin: "7px 0 0",
  color: "var(--muted)",
  fontSize: "10px",
});

globalStyle(".settings-security-note", {
  display: "inline-flex",
  minHeight: "31px",
  alignItems: "center",
  gap: "7px",
  padding: "0 10px",
  color: "#3d6757",
  border: "1px solid #cce2d8",
  borderRadius: "9px",
  background: "#f1f8f5",
  fontSize: "9px",
});

globalStyle(".settings-content", {
  width: "min(1040px, calc(100% - 96px))",
  margin: "0 auto",
  padding: "34px 0 70px",
});

globalStyle(".settings-intro", {
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
  marginBottom: "14px",
  padding: "15px 17px",
  border: "1px solid #dce5f3",
  borderRadius: "13px",
  background: "linear-gradient(135deg, #f4f8ff, #fbfdff)",
});

globalStyle(".settings-intro > span,\n.settings-icon", {
  display: "grid",
  width: "34px",
  height: "34px",
  flex: "0 0 auto",
  placeItems: "center",
  color: "var(--blue)",
  borderRadius: "10px",
  background: "#e5efff",
});

globalStyle(".settings-intro strong,\n.settings-card-heading strong", {
  fontSize: "11px",
});

globalStyle(".settings-intro p,\n.settings-card-heading p", {
  margin: "5px 0 0",
  color: "var(--muted)",
  fontSize: "9px",
  lineHeight: "1.55",
});

globalStyle(".model-settings-card", {
  overflow: "hidden",
  border: "1px solid var(--line-strong)",
  borderRadius: "15px",
  background: "#fff",
  boxShadow: "0 16px 42px rgb(47 58 73 / 7%)",
});

globalStyle(".settings-card-heading", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "20px",
  padding: "18px 20px",
  borderBottom: "1px solid var(--line)",
  background: "#fbfcfd",
});

globalStyle(".settings-card-heading > div", {
  display: "flex",
  alignItems: "center",
  gap: "11px",
});

globalStyle(".key-state", {
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
  padding: "5px 8px",
  color: "#8a641e",
  borderRadius: "7px",
  background: "#fff4dc",
  fontSize: "8px",
  fontWeight: "650",
});

globalStyle(".key-state.ready", {
  color: "#18704f",
  background: "#e6f5ee",
});

globalStyle(".settings-form-grid", {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "17px",
  padding: "22px 20px 24px",
});

globalStyle(".settings-form-grid label", {
  display: "grid",
  gap: "7px",
});

globalStyle(".settings-form-grid label > span", {
  color: "#414750",
  fontSize: "9px",
  fontWeight: "650",
});

globalStyle(".settings-form-grid input,\n.settings-form-grid select", {
  width: "100%",
  height: "39px",
  padding: "0 11px",
  color: "var(--ink)",
  border: "1px solid #dce1e7",
  borderRadius: "9px",
  outline: "none",
  background: "#fafbfc",
  font: "inherit",
  fontSize: "10px",
});

globalStyle(".settings-form-grid input:focus,\n.settings-form-grid select:focus", {
  borderColor: "#8bb6f8",
  background: "#fff",
  boxShadow: "0 0 0 3px #e7f0ff",
});

globalStyle(".field-wide", {
  gridColumn: "1 / -1",
});

globalStyle(".model-discovery-control", {
  display: "flex",
  minWidth: "0",
  alignItems: "center",
  gap: "8px",
});

globalStyle(".model-discovery-control input", {
  minWidth: "0",
  flex: "1 1 auto",
});

globalStyle(".model-discovery-control button", {
  display: "inline-flex",
  height: "39px",
  flex: "0 0 auto",
  alignItems: "center",
  gap: "6px",
  padding: "0 12px",
  color: "var(--muted)",
  border: "1px solid #dce1e7",
  borderRadius: "9px",
  background: "#fafbfc",
  cursor: "pointer",
  font: "inherit",
  fontSize: "10px",
});

globalStyle(".model-discovery-control button:hover:not(:disabled)", {
  color: "var(--ink)",
  borderColor: "#c8ced7",
  background: "#fff",
});

globalStyle(".model-discovery-control button:disabled", {
  cursor: "wait",
  opacity: "0.55",
});

globalStyle(".settings-form-grid label > small", {
  color: "var(--muted)",
  fontSize: "9px",
});

globalStyle(".settings-error", {
  margin: "-7px 20px 16px",
  padding: "9px 10px",
  color: "var(--danger)",
  borderRadius: "8px",
  background: "#fff1f1",
  fontSize: "9px",
});

globalStyle(".settings-actions", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "18px",
  padding: "14px 20px",
  borderTop: "1px solid var(--line)",
  background: "#fbfcfd",
});

globalStyle(".settings-actions p", {
  margin: "0",
  color: "var(--muted)",
  fontSize: "8px",
});

globalStyle(".settings-actions button", {
  minHeight: "35px",
  padding: "0 14px",
  color: "#fff",
  border: "0",
  borderRadius: "9px",
  background: "#17191d",
  cursor: "pointer",
  fontSize: "9px",
  fontWeight: "650",
});

globalStyle(".settings-actions button:hover:not(:disabled)", {
  background: "#2a2d32",
});

globalStyle(".settings-actions button:disabled", {
  cursor: "wait",
  opacity: "0.65",
});

globalStyle(".archived-settings", {
  padding: "0 56px 70px",
});

globalStyle(".archived-header", {
  display: "flex",
  width: "min(920px, 100%)",
  minHeight: "150px",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "24px",
  margin: "0 auto",
  padding: "35px 0 24px",
});

globalStyle(".archived-header h1", {
  margin: "6px 0 0",
  fontSize: "27px",
  letterSpacing: "-0.035em",
});

globalStyle(".archived-header p", {
  margin: "8px 0 0",
  color: "var(--muted)",
  fontSize: "10px",
});

globalStyle(".delete-all-button", {
  display: "inline-flex",
  minHeight: "34px",
  alignItems: "center",
  gap: "7px",
  padding: "0 11px",
  color: "#b04440",
  border: "1px solid #efd5d3",
  borderRadius: "9px",
  background: "#fff5f4",
  cursor: "pointer",
  fontSize: "10px",
});

globalStyle(".delete-all-button:hover:not(:disabled)", {
  borderColor: "#e4b9b6",
  background: "#ffebe9",
});

globalStyle(".archive-manager", {
  width: "min(920px, 100%)",
  margin: "0 auto",
});

globalStyle(".archive-search", {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  height: "39px",
  alignItems: "center",
  gap: "8px",
  padding: "0 12px",
  color: "#89919c",
  border: "1px solid #dce1e7",
  borderRadius: "10px",
  background: "#fff",
});

globalStyle(".archive-search:focus-within", {
  color: "var(--blue)",
  borderColor: "#9cbbea",
  boxShadow: "0 0 0 3px #eaf2ff",
});

globalStyle(".archive-search input", {
  width: "100%",
  height: "37px",
  padding: "0",
  border: "0",
  outline: "0",
  background: "transparent",
  font: "inherit",
  fontSize: "11px",
});

globalStyle(".archive-list", {
  marginTop: "18px",
  overflow: "hidden",
  border: "1px solid #dfe3e8",
  borderRadius: "13px",
  background: "#fff",
  boxShadow: "0 12px 34px rgb(47 58 73 / 6%)",
});

globalStyle(".archive-list-heading", {
  display: "flex",
  minHeight: "42px",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 15px",
  color: "#656d78",
  borderBottom: "1px solid #e5e8ec",
  background: "#f8f9fb",
  fontSize: "10px",
  fontWeight: "650",
});

globalStyle(".archive-list-heading small", {
  color: "#9299a3",
  fontSize: "9px",
  fontWeight: "500",
});

globalStyle(".archive-task-row", {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto auto",
  minHeight: "68px",
  alignItems: "center",
  gap: "9px",
  padding: "11px 14px 11px 17px",
  borderBottom: "1px solid #eceef1",
});

globalStyle(".archive-task-row:last-child", {
  borderBottom: "0",
});

globalStyle(".archive-task-row:hover", {
  background: "#fafbfc",
});

globalStyle(".archive-task-row > div", {
  minWidth: "0",
});

globalStyle(".archive-task-row strong", {
  display: "block",
  overflow: "hidden",
  color: "#282d34",
  fontSize: "11px",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".archive-task-row small", {
  display: "block",
  marginTop: "5px",
  color: "#89919c",
  fontSize: "9px",
});

globalStyle(".archive-delete", {
  display: "grid",
  width: "31px",
  height: "31px",
  padding: "0",
  placeItems: "center",
  color: "#9097a1",
  border: "0",
  borderRadius: "8px",
  background: "transparent",
  cursor: "pointer",
});

globalStyle(".archive-delete:hover", {
  color: "#b33f3b",
  background: "#fff0ef",
});

globalStyle(".archive-restore", {
  display: "inline-flex",
  minHeight: "33px",
  alignItems: "center",
  gap: "6px",
  padding: "0 10px",
  color: "#404750",
  border: "1px solid #d9dee4",
  borderRadius: "8px",
  background: "#f7f8fa",
  cursor: "pointer",
  fontSize: "9px",
  fontWeight: "650",
});

globalStyle(".archive-restore:hover", {
  borderColor: "#bcc5d0",
  background: "#eef1f4",
});

globalStyle(".archive-empty", {
  display: "grid",
  minHeight: "300px",
  placeContent: "center",
  justifyItems: "center",
  marginTop: "18px",
  color: "#7c8590",
  border: "1px dashed #d7dce2",
  borderRadius: "13px",
  background: "rgb(255 255 255 / 58%)",
  textAlign: "center",
});

globalStyle(".archive-empty > span", {
  display: "grid",
  width: "48px",
  height: "48px",
  placeItems: "center",
  borderRadius: "14px",
  background: "#edf1f5",
});

globalStyle(".archive-empty strong", {
  marginTop: "13px",
  color: "#3b424b",
  fontSize: "12px",
});

globalStyle(".archive-empty p", {
  maxWidth: "320px",
  margin: "7px 0 0",
  fontSize: "9px",
  lineHeight: "1.55",
});

globalStyle(".archive-empty.compact", {
  minHeight: "150px",
});

globalStyle(".settings-dialog-backdrop", {
  position: "fixed",
  zIndex: "100",
  inset: "0",
  display: "grid",
  placeItems: "center",
  padding: "24px",
  background: "rgb(18 22 28 / 32%)",
  backdropFilter: "blur(3px)",
});

globalStyle(".settings-dialog", {
  width: "min(390px, 100%)",
  padding: "21px",
  border: "1px solid #dfe3e8",
  borderRadius: "15px",
  background: "#fff",
  boxShadow: "0 24px 70px rgb(22 29 38 / 24%)",
});

globalStyle(".settings-dialog > span", {
  display: "grid",
  width: "36px",
  height: "36px",
  placeItems: "center",
  color: "#ad403c",
  borderRadius: "10px",
  background: "#fff0ef",
});

globalStyle(".settings-dialog h2", {
  margin: "14px 0 0",
  fontSize: "15px",
});

globalStyle(".settings-dialog p", {
  margin: "7px 0 0",
  color: "var(--muted)",
  fontSize: "10px",
  lineHeight: "1.55",
});

globalStyle(".settings-dialog > div", {
  display: "flex",
  justifyContent: "flex-end",
  gap: "7px",
  marginTop: "20px",
});

globalStyle(".settings-dialog button", {
  minHeight: "34px",
  padding: "0 12px",
  border: "1px solid #dce1e7",
  borderRadius: "8px",
  background: "#fff",
  cursor: "pointer",
  fontSize: "10px",
});

globalStyle(".settings-dialog button.danger", {
  color: "#fff",
  borderColor: "#b7433f",
  background: "#b7433f",
});
