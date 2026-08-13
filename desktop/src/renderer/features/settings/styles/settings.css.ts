import { globalStyle, keyframes } from "@vanilla-extract/css";

const providerModelPulse = keyframes({
  "0%, 100%": { opacity: 0.35 },
  "50%": { opacity: 1 },
});

globalStyle(".settings-shell", {
  display: "grid",
  gridTemplateColumns: "var(--sidebar-width) minmax(0, 1fr)",
  width: "100%",
  height: "100%",
  minWidth: "980px",
  paddingTop: "33px",
  overflow: "hidden",
  background: "var(--canvas)",
});

globalStyle(".sidebar-collapsed .settings-shell", {
  gridTemplateColumns: "var(--sidebar-width) minmax(0, 1fr)",
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

globalStyle('[data-slot="dialog-overlay"].settings-dialog-overlay', {
  zIndex: "100",
  background: "rgb(18 22 28 / 32%)",
  backdropFilter: "blur(3px)",
});

globalStyle('[data-slot="dialog-content"].settings-dialog-frame', {
  zIndex: "101",
  display: "block",
  width: "min(390px, calc(100vw - 48px))",
  maxWidth: "none",
  padding: "0",
  gap: "0",
  border: "0",
  borderRadius: "15px",
  outline: "0",
  background: "transparent",
  boxShadow: "none",
});

globalStyle(".settings-dialog", {
  width: "100%",
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

globalStyle(".model-settings-layout", {
  padding: "34px 36px 52px",
  color: "var(--ink)",
});

globalStyle(".model-settings-page-header", {
  display: "flex",
  maxWidth: "1120px",
  alignItems: "flex-end",
  justifyContent: "space-between",
  margin: "0 auto 20px",
});

globalStyle(".model-settings-page-header h1", {
  margin: "0",
  fontSize: "30px",
  letterSpacing: "-0.04em",
});

globalStyle(".model-settings-page-header p", {
  margin: "18px 0 0",
  color: "var(--muted)",
  fontSize: "11px",
});

globalStyle(".model-settings-refresh", {
  display: "grid",
  width: "32px",
  height: "32px",
  placeItems: "center",
  color: "var(--muted)",
  border: "0",
  borderRadius: "50%",
  background: "transparent",
  cursor: "pointer",
});

globalStyle(".model-settings-refresh:hover:not(:disabled)", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--ink) 7%, transparent)",
});

globalStyle(".model-provider-workspace", {
  display: "grid",
  maxWidth: "1120px",
  minHeight: "610px",
  gridTemplateColumns: "280px minmax(0, 1fr)",
  margin: "0 auto",
  overflow: "hidden",
  border: "1px solid var(--line-strong)",
  borderRadius: "15px",
  background: "color-mix(in srgb, var(--surface) 92%, var(--ink) 8%)",
});

globalStyle(".model-provider-sidebar", {
  padding: "22px 14px",
  borderRight: "1px solid var(--line-strong)",
});

globalStyle(".model-provider-section-label", {
  display: "block",
  margin: "0 8px 10px",
  color: "var(--subtle)",
  fontSize: "10px",
  fontWeight: "650",
});

globalStyle(".model-provider-section-label.custom", { marginTop: "24px" });

globalStyle(".model-provider-item,.model-provider-add", {
  display: "grid",
  width: "100%",
  minHeight: "42px",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "9px",
  padding: "0 11px",
  color: "var(--muted)",
  border: "1px solid transparent",
  borderRadius: "10px",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
});

globalStyle(".model-provider-item:hover,.model-provider-item.active,.model-provider-add:hover,.model-provider-add.active", {
  color: "var(--ink)",
  borderColor: "var(--line-strong)",
  background: "color-mix(in srgb, var(--ink) 5%, transparent)",
});
globalStyle(".model-provider-item:disabled", { cursor: "default", opacity: "0.72" });

globalStyle(".model-provider-item strong,.model-provider-add", { fontSize: "11px", fontWeight: "600" });
globalStyle(".model-provider-item i", { width: "7px", height: "7px", borderRadius: "50%", background: "var(--subtle)" });
globalStyle(".model-provider-item i.ready", { background: "#40c977", boxShadow: "0 0 0 3px rgb(64 201 119 / 10%)" });
globalStyle(".provider-logo.bigmodel", { color: "#339cff", fontSize: "16px" });

globalStyle(".model-provider-detail", {
  display: "grid",
  minWidth: "0",
  gridTemplateRows: "auto 1fr auto",
  padding: "28px 32px 24px",
});

globalStyle(".model-provider-detail-header,.model-provider-title,.provider-header-actions", {
  display: "flex",
  alignItems: "center",
});
globalStyle(".model-provider-detail-header", { justifyContent: "space-between", gap: "16px", marginBottom: "22px" });
globalStyle(".model-provider-title", { gap: "9px", minWidth: "0" });
globalStyle(".model-provider-title strong,.model-provider-title input", { fontSize: "15px", fontWeight: "680" });
globalStyle(".model-provider-title input", { width: "220px", color: "var(--ink)", border: "0", borderBottom: "1px solid var(--line-strong)", outline: "0", background: "transparent" });
globalStyle(".model-provider-title button,.provider-secret-input button", { display: "grid", width: "30px", height: "30px", padding: "0", placeItems: "center", color: "var(--muted)", border: "0", borderRadius: "8px", background: "transparent", cursor: "pointer" });
globalStyle(".provider-enabled-state", { padding: "5px 9px", color: "var(--muted)", border: "1px solid transparent", borderRadius: "999px", background: "color-mix(in srgb, var(--ink) 6%, transparent)", fontSize: "10px", fontWeight: "650" });
globalStyle(".provider-enabled-state.ready", { color: "#126c3a", borderColor: "rgb(39 148 89 / 32%)", background: "rgb(64 201 119 / 18%)" });
globalStyle('[data-theme="dark"] .provider-enabled-state.ready', { color: "#76d6aa", borderColor: "#265d45", background: "#1b342a" });
globalStyle(".provider-header-actions", { gap: "7px" });
globalStyle(".provider-header-actions button", { minHeight: "31px", padding: "0 11px", color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "8px", background: "transparent", cursor: "pointer", fontSize: "10px" });
globalStyle(".provider-header-actions button.danger", { display: "grid", width: "32px", padding: "0", placeItems: "center", color: "var(--muted)" });
globalStyle(".provider-header-actions button.danger:hover", { color: "#fa423e" });

globalStyle(".model-provider-fields", { display: "grid", alignContent: "start", gap: "17px" });
globalStyle(".provider-field", { display: "grid", gap: "7px", color: "var(--muted)", fontSize: "10px" });
globalStyle(".provider-field > input,.provider-secret-input", { minHeight: "43px", border: "1px solid var(--line-strong)", borderRadius: "10px", background: "transparent" });
globalStyle(".provider-field > input,.provider-secret-input input", { width: "100%", padding: "0 13px", color: "var(--ink)", outline: "0", font: "inherit", fontSize: "11px" });
globalStyle(".provider-secret-input", { display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center" });
globalStyle(".provider-secret-input input", { height: "41px", border: "0", background: "transparent" });
globalStyle(".provider-field small", { color: "var(--subtle)", fontSize: "9px" });

globalStyle('.provider-field [data-slot="select-trigger"].api-format-trigger', { display: "flex", width: "100%", minHeight: "43px", height: "43px", alignItems: "center", justifyContent: "space-between", padding: "0 13px", color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "10px", outline: "0", background: "transparent", boxShadow: "none", cursor: "pointer", fontSize: "11px" });
globalStyle('.provider-field [data-slot="select-trigger"].api-format-trigger:focus-visible', { borderColor: "color-mix(in srgb, var(--accent) 46%, var(--line-strong))", boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent)" });
globalStyle('[data-slot="select-content"].api-format-content', { minWidth: "var(--anchor-width)", padding: "5px", border: "1px solid var(--line-strong)", borderRadius: "11px", background: "var(--surface)", boxShadow: "0 18px 48px rgb(0 0 0 / 18%)" });
globalStyle('[data-slot="select-item"].api-format-option', { minHeight: "36px", padding: "0 30px 0 10px", color: "var(--muted)", borderRadius: "7px", fontSize: "10px" });
globalStyle('[data-slot="select-item"].api-format-option:hover, [data-slot="select-item"].api-format-option[data-highlighted]', { color: "var(--ink)", background: "color-mix(in srgb, var(--ink) 9%, transparent)" });

globalStyle(".provider-models-section", { marginTop: "3px" });
globalStyle(".provider-models-section > header,.provider-model-controls,.model-provider-actions", { display: "flex", alignItems: "center", justifyContent: "space-between" });
globalStyle(".provider-models-section > header span", { color: "var(--muted)", fontSize: "10px" });
globalStyle(".provider-models-section > header button,.provider-model-controls button", { display: "inline-flex", minHeight: "31px", alignItems: "center", gap: "6px", padding: "0 10px", color: "var(--muted)", border: "0", borderRadius: "8px", background: "color-mix(in srgb, var(--ink) 5%, transparent)", cursor: "pointer", fontSize: "9px" });
globalStyle(".provider-model-list", { maxHeight: "280px", marginTop: "8px", overflowX: "hidden", overflowY: "auto", border: "1px solid var(--line-strong)", borderRadius: "10px" });
globalStyle(".provider-model-row", { display: "grid", width: "100%", minHeight: "56px", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: "12px", padding: "7px 10px 7px 13px", color: "var(--ink)", border: "0", borderBottom: "1px solid var(--line)", background: "transparent", textAlign: "left" });
globalStyle(".provider-model-row:last-child", { borderBottom: "0" });
globalStyle("button.provider-model-row", { cursor: "pointer" });
globalStyle(".provider-model-row input", { minWidth: "0", height: "36px", color: "var(--ink)", border: "0", outline: "0", background: "transparent", font: "inherit", fontSize: "11px" });
globalStyle(".provider-model-row span", { color: "var(--subtle)", fontSize: "9px" });
globalStyle(".provider-model-row.selected", { background: "color-mix(in srgb, var(--ink) 3%, transparent)" });
globalStyle("button.provider-model-row.selected", { boxShadow: "inset 2px 0 0 var(--accent)" });
globalStyle(".provider-model-manual-row", { position: "sticky", zIndex: "1", top: "0", background: "var(--surface)" });
globalStyle(".provider-model-selected-icon", { color: "var(--accent)" });
globalStyle(".provider-model-identity", { display: "grid", minWidth: "0", gap: "4px" });
globalStyle(".provider-model-identity strong", { overflow: "hidden", fontSize: "10px", fontWeight: "620", textOverflow: "ellipsis", whiteSpace: "nowrap" });
globalStyle(".provider-model-identity small", { color: "var(--subtle)", fontSize: "8px" });
globalStyle(".provider-model-actions", { display: "flex", alignItems: "center", gap: "2px" });
globalStyle(".provider-model-actions button", { display: "grid", width: "30px", height: "30px", padding: "0", placeItems: "center", color: "var(--subtle)", border: "0", borderRadius: "8px", background: "transparent", cursor: "pointer" });
globalStyle(".provider-model-actions button:hover", { color: "var(--ink)", background: "color-mix(in srgb, var(--ink) 7%, transparent)" });
globalStyle(".provider-model-actions button.is-connected", { display: "inline-flex", width: "auto", gap: "5px", padding: "0 9px", color: "#22c55e", background: "color-mix(in srgb, #22c55e 14%, transparent)", fontSize: "9px", fontWeight: "650", whiteSpace: "nowrap" });
globalStyle(".provider-model-actions button.is-connected:hover", { color: "#22c55e", background: "color-mix(in srgb, #22c55e 20%, transparent)" });
globalStyle(".provider-model-actions button:last-child:hover", { color: "#fa423e" });
globalStyle(".provider-model-actions .is-pulsing", { animation: `${providerModelPulse} 900ms ease-in-out infinite` });
globalStyle(".provider-model-empty", { display: "grid", minHeight: "74px", placeItems: "center", color: "var(--subtle)", fontSize: "9px" });
globalStyle(".provider-model-controls", { marginTop: "8px" });
globalStyle(".provider-model-controls label", { display: "flex", alignItems: "center", gap: "7px", color: "var(--muted)", fontSize: "9px" });
globalStyle(".provider-model-controls input", { width: "88px", height: "30px", padding: "0 7px", color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "7px", outline: "0", background: "transparent", font: "inherit", fontSize: "9px" });

globalStyle(".model-provider-actions", { gap: "16px", marginTop: "22px", paddingTop: "18px", borderTop: "1px solid var(--line)" });
globalStyle(".model-provider-actions p", { display: "flex", alignItems: "center", gap: "6px", margin: "0", color: "var(--subtle)", fontSize: "9px" });
globalStyle(".model-provider-actions > button", { minHeight: "35px", padding: "0 15px", color: "var(--surface)", border: "0", borderRadius: "9px", background: "var(--ink)", cursor: "pointer", fontSize: "10px", fontWeight: "650" });
globalStyle(".provider-error", { margin: "0", color: "#fa423e", fontSize: "9px" });

globalStyle('[data-slot="dialog-overlay"].model-config-dialog-overlay', { zIndex: "120", background: "rgb(0 0 0 / 48%)", backdropFilter: "blur(5px)" });
globalStyle('[data-slot="dialog-content"].model-config-dialog-frame', { zIndex: "121", display: "block", width: "min(680px, calc(100vw - 48px))", maxWidth: "none", maxHeight: "calc(100vh - 48px)", padding: "0", gap: "0", overflow: "hidden", border: "0", borderRadius: "15px", outline: "0", background: "transparent", boxShadow: "none" });
globalStyle(".model-config-dialog", { width: "100%", maxHeight: "calc(100vh - 48px)", overflowY: "auto", padding: "22px 24px 20px", color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "15px", background: "color-mix(in srgb, var(--surface) 94%, var(--ink) 6%)", boxShadow: "0 28px 90px rgb(0 0 0 / 35%)" });
globalStyle(".model-config-dialog > header", { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "22px" });
globalStyle(".model-config-dialog h2", { margin: "0", fontSize: "14px", fontWeight: "620", letterSpacing: "-0.02em" });
globalStyle(".model-config-dialog > header button", { display: "grid", width: "30px", height: "30px", padding: "0", placeItems: "center", color: "var(--muted)", border: "0", borderRadius: "8px", background: "transparent", cursor: "pointer" });
globalStyle(".model-config-dialog > header button:hover", { color: "var(--ink)", background: "color-mix(in srgb, var(--ink) 7%, transparent)" });
globalStyle(".model-config-dialog > label", { display: "grid", gap: "8px", marginTop: "17px", color: "var(--muted)", fontSize: "10px" });
globalStyle(".model-config-dialog > label input", { width: "100%", height: "43px", padding: "0 13px", color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "9px", outline: "0", background: "transparent", font: "inherit", fontSize: "11px" });
globalStyle(".model-config-dialog > label input:focus", { borderColor: "color-mix(in srgb, var(--ink) 28%, var(--line-strong))" });
globalStyle(".model-config-advanced-toggle", { display: "inline-flex", alignItems: "center", gap: "7px", marginTop: "17px", padding: "0", color: "var(--muted)", border: "0", background: "transparent", cursor: "pointer", fontSize: "10px" });
globalStyle(".model-config-advanced-toggle svg", { transform: "rotate(-90deg)", transition: "transform 160ms ease" });
globalStyle(".model-config-advanced-toggle.open svg", { transform: "rotate(0deg)" });
globalStyle(".model-config-advanced-fields", { display: "grid", gap: "18px", marginTop: "17px" });
globalStyle(".model-config-advanced-fields > label", { display: "grid", gap: "8px", color: "var(--muted)", fontSize: "10px" });
globalStyle(".model-config-advanced-fields > label input", { width: "100%", height: "43px", padding: "0 13px", color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "9px", outline: "0", background: "transparent", font: "inherit", fontSize: "11px" });
globalStyle(".reasoning-capability-editor", { overflow: "hidden", border: "1px solid var(--line-strong)", borderRadius: "12px", background: "color-mix(in srgb, var(--surface) 78%, transparent)" });
globalStyle(".reasoning-capability-editor > header", { display: "flex", minHeight: "64px", alignItems: "center", justifyContent: "space-between", gap: "20px", padding: "13px 15px" });
globalStyle(".reasoning-capability-editor > header > div", { display: "grid", gap: "4px" });
globalStyle(".reasoning-capability-editor strong", { color: "var(--ink)", fontSize: "10px", fontWeight: "670" });
globalStyle(".reasoning-capability-editor small", { color: "var(--subtle)", fontSize: "8.5px", lineHeight: "1.45" });
globalStyle(".settings-switch-control", { position: "relative", display: "inline-flex", width: "44px", height: "25px", flex: "0 0 auto", alignItems: "center", padding: "0", border: "0", borderRadius: "999px", outline: "0", background: "color-mix(in srgb, var(--ink) 18%, transparent)", cursor: "pointer", transition: "background 150ms ease, opacity 150ms ease" });
globalStyle(".settings-switch-thumb", { display: "block", width: "19px", height: "19px", marginLeft: "3px", borderRadius: "50%", background: "#f7f8fa", boxShadow: "0 2px 7px rgb(0 0 0 / 25%)", transition: "transform 180ms cubic-bezier(.2,.8,.2,1)" });
globalStyle(".settings-switch-control[data-checked]", { background: "#2f7dd1" });
globalStyle(".settings-switch-control[data-checked] .settings-switch-thumb", { transform: "translateX(19px)" });
globalStyle(".settings-switch-control:focus-visible", { outline: "2px solid color-mix(in srgb, #2f7dd1 72%, transparent)", outlineOffset: "3px" });
globalStyle(".settings-switch-control[data-disabled]", { cursor: "not-allowed", opacity: ".48" });
globalStyle(".settings-switch-control.model-capability-switch", { width: "38px", height: "22px", background: "color-mix(in srgb, var(--ink) 16%, transparent)" });
globalStyle(".settings-switch-control.model-capability-switch .settings-switch-thumb", { width: "16px", height: "16px", marginLeft: "3px", background: "var(--surface)", boxShadow: "0 1px 4px rgb(0 0 0 / 24%)" });
globalStyle(".settings-switch-control.model-capability-switch[data-checked]", { background: "var(--accent)" });
globalStyle(".settings-switch-control.model-capability-switch[data-checked] .settings-switch-thumb", { transform: "translateX(16px)" });
globalStyle(".reasoning-effort-table", { borderTop: "1px solid var(--line)", background: "color-mix(in srgb, var(--ink) 1.5%, transparent)" });
globalStyle(".reasoning-effort-table-head,.reasoning-effort-row", { display: "grid", gridTemplateColumns: "48px minmax(0, 1fr) 44px", alignItems: "center" });
globalStyle(".reasoning-effort-table-head", { minHeight: "30px", padding: "0 9px", color: "var(--subtle)", borderBottom: "1px solid var(--line)", fontSize: "8px", textTransform: "uppercase", letterSpacing: ".08em" });
globalStyle(".reasoning-effort-table-head span:last-child", { textAlign: "center" });
globalStyle(".reasoning-effort-row", { minHeight: "42px", padding: "0 9px", borderBottom: "1px solid var(--line)" });
globalStyle(".reasoning-effort-row > span", { color: "var(--subtle)", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: "8px" });
globalStyle(".reasoning-effort-row input", { width: "100%", height: "29px", padding: "0 9px", color: "var(--ink)", border: "1px solid transparent", borderRadius: "6px", outline: "0", background: "transparent", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: "10px" });
globalStyle(".reasoning-effort-row input:focus", { borderColor: "color-mix(in srgb, var(--accent) 42%, var(--line-strong))", background: "var(--surface)" });
globalStyle(".reasoning-effort-row > button", { display: "grid", width: "28px", height: "28px", justifySelf: "center", padding: "0", placeItems: "center", color: "var(--subtle)", border: "0", borderRadius: "7px", background: "transparent", cursor: "pointer" });
globalStyle(".reasoning-effort-row > button:hover", { color: "#d84945", background: "color-mix(in srgb, #d84945 9%, transparent)" });
globalStyle(".reasoning-effort-add", { display: "inline-flex", minHeight: "34px", alignItems: "center", gap: "6px", margin: "8px 10px", padding: "0 9px", color: "var(--muted)", border: "1px dashed var(--line-strong)", borderRadius: "7px", background: "transparent", cursor: "pointer", fontSize: "9px" });
globalStyle(".reasoning-effort-add:disabled", { cursor: "not-allowed", opacity: ".42" });
globalStyle(".model-config-dialog > p", { margin: "14px 0 0", color: "#fa423e", fontSize: "9px" });
globalStyle(".model-config-dialog > footer", { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "23px", paddingTop: "18px", borderTop: "1px solid var(--line)" });
globalStyle(".model-config-dialog > footer button", { minHeight: "34px", padding: "0 13px", color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "8px", background: "transparent", cursor: "pointer", fontSize: "10px" });
globalStyle(".model-config-dialog > footer button.primary", { color: "var(--surface)", borderColor: "var(--ink)", background: "var(--ink)" });

globalStyle(".personalization-settings", {
  display: "grid",
  gridAutoRows: "max-content",
  width: "min(900px, 100%)",
  alignContent: "start",
  rowGap: "42px",
  padding: "46px clamp(28px, 5vw, 64px) 64px",
  boxSizing: "border-box",
});

globalStyle(".personalization-header", {
  display: "grid",
  minWidth: "0",
  gap: "8px",
});

globalStyle(".personalization-header h1", {
  margin: "0",
  color: "var(--ink)",
  fontSize: "24px",
  fontWeight: "680",
  letterSpacing: "-0.035em",
});

globalStyle(".personalization-header p", {
  maxWidth: "620px",
  margin: "0",
  color: "var(--muted)",
  fontSize: "11px",
  lineHeight: "1.65",
});

globalStyle(".memory-settings-section", {
  display: "grid",
  minWidth: "0",
  gap: "16px",
});

globalStyle(".memory-settings-heading", {
  display: "flex",
  minWidth: "0",
  alignItems: "center",
  gap: "11px",
});

globalStyle(".memory-settings-heading > span", {
  display: "grid",
  width: "34px",
  height: "34px",
  placeItems: "center",
  color: "var(--ink)",
  border: "1px solid var(--line-strong)",
  borderRadius: "10px",
  background: "color-mix(in srgb, var(--ink) 4%, transparent)",
});

globalStyle(".memory-settings-heading h2", {
  margin: "0",
  color: "var(--ink)",
  fontSize: "15px",
  fontWeight: "670",
  letterSpacing: "-0.02em",
});

globalStyle(".memory-settings-heading p", {
  margin: "4px 0 0",
  color: "var(--muted)",
  fontSize: "10px",
  lineHeight: "1.5",
});

globalStyle(".memory-settings-card", {
  overflow: "hidden",
  border: "1px solid var(--line-strong)",
  borderRadius: "15px",
  background: "color-mix(in srgb, var(--surface) 96%, var(--ink) 4%)",
  boxShadow: "0 14px 38px rgb(0 0 0 / 5%)",
});

globalStyle(".memory-settings-row", {
  display: "flex",
  minHeight: "82px",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "28px",
  padding: "18px 24px",
  borderBottom: "1px solid var(--line)",
});

globalStyle(".memory-settings-row:last-child", {
  borderBottom: "0",
});

globalStyle(".memory-settings-row > div", {
  display: "grid",
  minWidth: "0",
  gap: "5px",
});

globalStyle(".memory-settings-row strong", {
  color: "var(--ink)",
  fontSize: "12px",
  fontWeight: "650",
});

globalStyle(".memory-settings-row small", {
  color: "var(--muted)",
  fontSize: "10px",
  lineHeight: "1.5",
});

globalStyle(".memory-reset-button", {
  display: "inline-flex",
  minHeight: "31px",
  flex: "0 0 auto",
  alignItems: "center",
  gap: "6px",
  padding: "0 11px",
  color: "#d84945",
  border: "1px solid color-mix(in srgb, #d84945 18%, transparent)",
  borderRadius: "999px",
  background: "color-mix(in srgb, #d84945 9%, transparent)",
  cursor: "pointer",
  fontSize: "10px",
  fontWeight: "650",
});

globalStyle(".memory-reset-button:hover", {
  borderColor: "color-mix(in srgb, #d84945 34%, transparent)",
  background: "color-mix(in srgb, #d84945 14%, transparent)",
});

globalStyle(".memory-reset-button:disabled", {
  cursor: "not-allowed",
  opacity: "0.45",
});

globalStyle(".memory-settings-note,.memory-settings-error", {
  margin: "0 3px",
  fontSize: "9px",
  lineHeight: "1.55",
});

globalStyle(".memory-settings-note", { color: "var(--subtle)" });
globalStyle(".memory-settings-error", { color: "#d84945" });

globalStyle(".memory-reset-dialog > span", {
  color: "#d84945",
  background: "color-mix(in srgb, #d84945 10%, transparent)",
});

globalStyle(".profile-page", {
  overflow: "auto",
});

globalStyle(".profile-content", {
  width: "min(1040px, calc(100% - 96px))",
  margin: "0 auto",
  padding: "46px 0 72px",
});

globalStyle(".profile-identity", {
  display: "grid",
  gridTemplateColumns: "56px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "17px",
  marginBottom: "34px",
});

globalStyle(".profile-avatar", {
  display: "grid",
  width: "56px",
  height: "56px",
  placeItems: "center",
  color: "#53606e",
  border: "1px solid #dce1e7",
  borderRadius: "18px",
  background: "linear-gradient(145deg, #f8f9fa, #e9edf1)",
});

globalStyle(".profile-avatar svg", { width: "27px", height: "27px" });
globalStyle(".profile-identity h1", {
  margin: "4px 0 3px",
  fontSize: "23px",
  fontWeight: "620",
  letterSpacing: "-0.035em",
});
globalStyle(".profile-identity p", {
  margin: 0,
  color: "var(--muted)",
  fontSize: "11px",
});
globalStyle(".profile-identity > button", {
  display: "inline-flex",
  height: "32px",
  alignItems: "center",
  gap: "7px",
  padding: "0 11px",
  color: "#606873",
  border: "1px solid var(--line)",
  borderRadius: "9px",
  background: "var(--surface)",
  cursor: "pointer",
  fontSize: "10px",
});
globalStyle(".profile-identity > button svg", { width: "14px" });

globalStyle(".profile-metrics", {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  marginBottom: "38px",
  border: "1px solid var(--line)",
  borderRadius: "16px",
  background: "color-mix(in srgb, var(--surface) 98%, var(--ink) 2%)",
});
globalStyle(".profile-metrics > div", {
  display: "grid",
  minHeight: "82px",
  alignContent: "center",
  justifyItems: "center",
  gap: "6px",
  borderRight: "1px solid var(--line)",
});
globalStyle(".profile-metrics > div:last-child", { borderRight: 0 });
globalStyle(".profile-metrics strong", {
  color: "var(--ink)",
  fontSize: "17px",
  fontWeight: "580",
  fontVariantNumeric: "tabular-nums",
});
globalStyle(".profile-metrics span", { color: "var(--muted)", fontSize: "10px" });

globalStyle(".profile-activity-card", { marginBottom: "34px" });
globalStyle(".profile-activity-card > header", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "12px",
});
globalStyle(".profile-activity-card > header div", {
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
});
globalStyle(".profile-activity-card > header svg", { width: "15px", color: "var(--muted)" });
globalStyle(".profile-activity-card > header strong", { fontSize: "13px", fontWeight: "640" });
globalStyle(".profile-activity-card > header span", { color: "var(--muted)", fontSize: "10px" });
globalStyle(".token-heatmap", {
  display: "grid",
  gridAutoFlow: "column",
  gridTemplateRows: "repeat(7, 11px)",
  gridAutoColumns: "11px",
  gap: "4px",
  width: "100%",
  overflow: "hidden",
});
globalStyle(".token-heatmap-day", {
  display: "block",
  width: "11px",
  height: "11px",
  borderRadius: "3px",
  background: "#eef0f2",
});
globalStyle(".token-heatmap-day.level-1", { background: "#d8eafb" });
globalStyle(".token-heatmap-day.level-2", { background: "#a9d4f8" });
globalStyle(".token-heatmap-day.level-3", { background: "#68b5f2" });
globalStyle(".token-heatmap-day.level-4", { background: "#2f95e5" });
globalStyle(".profile-activity-card > footer", {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: "5px",
  marginTop: "10px",
  color: "var(--subtle)",
  fontSize: "9px",
});
globalStyle(".profile-activity-card > footer i", { width: "9px", height: "9px" });

globalStyle(".profile-usage-grid", {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "1px",
  overflow: "hidden",
  border: "1px solid var(--line)",
  borderRadius: "14px",
  background: "var(--line)",
});
globalStyle(".profile-usage-grid > div", {
  display: "grid",
  gap: "7px",
  minHeight: "76px",
  alignContent: "center",
  padding: "0 18px",
  background: "var(--surface)",
});
globalStyle(".profile-usage-grid span", { color: "var(--muted)", fontSize: "10px" });
globalStyle(".profile-usage-grid strong", { fontSize: "13px", fontWeight: "590", fontVariantNumeric: "tabular-nums" });
globalStyle(".profile-error", { color: "#c84640", fontSize: "11px" });

globalStyle(".profile-content", {
  "@media": {
    "(max-width: 1120px)": {
      width: "calc(100% - 48px)",
    },
  },
});

globalStyle(".profile-metrics", {
  "@media": {
    "(max-width: 1120px)": {
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    },
  },
});

globalStyle(".profile-metrics > div", {
  "@media": {
    "(max-width: 1120px)": {
      borderBottom: "1px solid var(--line)",
    },
  },
});

globalStyle(".profile-usage-grid", {
  "@media": {
    "(max-width: 1120px)": {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    },
  },
});
