import { globalStyle } from "@vanilla-extract/css";

globalStyle(".plugins-settings-layout", {
  color: "var(--ink)",
});

globalStyle(".plugins-settings-content", {
  width: "min(960px, calc(100% - 96px))",
  margin: "0 auto",
  padding: "42px 0 72px",
});

globalStyle(".plugins-settings-header", {
  display: "grid",
  gridTemplateColumns: "42px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "14px",
});

globalStyle(".plugins-settings-actions", { display: "flex", alignItems: "center", gap: "8px" });
globalStyle(".plugins-settings-actions button", { display: "inline-flex", minHeight: "34px", alignItems: "center", justifyContent: "center", gap: "6px", padding: "0 11px", color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "9px", background: "var(--surface)", cursor: "pointer", font: "inherit", fontSize: "9px", fontWeight: "620" });
globalStyle(".plugins-settings-actions button:hover", { background: "color-mix(in srgb, var(--ink) 5%, var(--surface))" });
globalStyle(".plugins-settings-actions button:disabled", { cursor: "default", opacity: "0.45" });
globalStyle(".plugins-add-menu", { position: "relative" });
globalStyle(".plugins-settings-actions .plugins-add-trigger", { color: "#fff", borderColor: "#17191d", background: "#17191d" });
globalStyle(".plugins-settings-actions .plugins-add-trigger:hover", { background: "#25282d" });
globalStyle(".plugins-add-dropdown", { position: "absolute", zIndex: 20, top: "calc(100% + 6px)", right: 0, display: "grid", width: "218px", padding: "5px", border: "1px solid var(--line-strong)", borderRadius: "11px", background: "var(--surface)" });
globalStyle(".plugins-settings-actions .plugins-add-dropdown button", { display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", minHeight: "50px", justifyContent: "stretch", gap: "8px", padding: "7px 9px", border: 0, background: "transparent", textAlign: "left" });
globalStyle(".plugins-add-dropdown button > svg", { marginTop: "2px", color: "var(--muted)" });
globalStyle(".plugins-add-dropdown button span", { display: "grid", minWidth: 0, gap: "3px" });
globalStyle(".plugins-add-dropdown button strong", { fontSize: "9px", fontWeight: "650" });
globalStyle(".plugins-add-dropdown button small", { color: "var(--muted)", fontSize: "8px", fontWeight: "400" });

globalStyle(".plugins-settings-mark", {
  display: "grid",
  width: "42px",
  height: "42px",
  placeItems: "center",
  color: "var(--ink)",
  border: "1px solid var(--line-strong)",
  borderRadius: "13px",
  background: "color-mix(in srgb, var(--ink) 4%, transparent)",
});

globalStyle(".plugins-settings-header h1", {
  margin: "0",
  fontSize: "27px",
  fontWeight: "680",
  letterSpacing: "-0.035em",
});

globalStyle(".plugins-settings-header p", {
  margin: "7px 0 0",
  color: "var(--muted)",
  fontSize: "10px",
});

globalStyle(".plugins-settings-tabs", {
  display: "flex",
  alignItems: "center",
  gap: "5px",
  marginTop: "30px",
  paddingBottom: "12px",
  borderBottom: "1px solid var(--line)",
});

globalStyle(".plugins-settings-tabs button", {
  display: "inline-flex",
  minHeight: "34px",
  alignItems: "center",
  gap: "7px",
  padding: "0 12px",
  color: "var(--muted)",
  border: "0",
  borderRadius: "9px",
  background: "transparent",
  cursor: "pointer",
  font: "inherit",
  fontSize: "10px",
  fontWeight: "620",
});

globalStyle(".plugins-settings-tabs button:hover", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--ink) 5%, transparent)",
});

globalStyle(".plugins-settings-tabs button.active", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--ink) 8%, transparent)",
});

globalStyle(".skills-settings-placeholder", {
  display: "grid",
  minHeight: "330px",
  placeContent: "center",
  justifyItems: "center",
  marginTop: "24px",
  color: "var(--muted)",
  border: "1px dashed var(--line-strong)",
  borderRadius: "15px",
  background: "color-mix(in srgb, var(--surface) 98%, var(--ink) 2%)",
  textAlign: "center",
});

globalStyle(".skills-settings-placeholder > span", {
  display: "grid",
  width: "48px",
  height: "48px",
  placeItems: "center",
  border: "1px solid var(--line-strong)",
  borderRadius: "14px",
  background: "var(--surface)",
});

globalStyle(".skills-settings-placeholder strong", {
  marginTop: "13px",
  color: "var(--ink)",
  fontSize: "12px",
});

globalStyle(".skills-settings-placeholder p", {
  maxWidth: "380px",
  margin: "7px 0 0",
  fontSize: "9px",
  lineHeight: "1.6",
});

globalStyle(".skills-settings-panel", { marginTop: "24px" });
globalStyle(".skills-settings-panel > header", { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "18px", marginBottom: "12px" });
globalStyle(".skills-settings-panel > header div", { display: "grid", gap: "5px" });
globalStyle(".skills-settings-panel > header strong", { fontSize: "13px" });
globalStyle(".skills-settings-panel > header small", { color: "var(--muted)", fontSize: "9px" });
globalStyle(".skills-settings-panel > header button", { display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "32px", padding: "0 11px", color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "9px", background: "var(--surface)", cursor: "pointer", font: "inherit", fontSize: "9px" });
globalStyle(".skills-settings-list", { overflow: "hidden", border: "1px solid var(--line-strong)", borderRadius: "13px", background: "var(--surface)" });
globalStyle(".skills-settings-list article", { display: "grid", gridTemplateColumns: "38px minmax(0, 1fr) auto", alignItems: "center", gap: "12px", minHeight: "76px", padding: "12px 15px", borderBottom: "1px solid var(--line)" });
globalStyle(".skills-settings-list article:last-child", { borderBottom: "0" });
globalStyle(".skill-cube", { display: "grid", width: "36px", height: "36px", placeItems: "center", color: "var(--muted)", border: "1px solid var(--line-strong)", borderRadius: "11px" });
globalStyle(".skills-settings-list article > div", { minWidth: 0 });
globalStyle(".skills-settings-list article strong", { fontSize: "10px" });
globalStyle(".skills-settings-list article p", { overflow: "hidden", margin: "4px 0 0", color: "var(--muted)", fontSize: "9px", textOverflow: "ellipsis", whiteSpace: "nowrap" });
globalStyle(".skills-settings-list article small", { display: "block", marginTop: "5px", color: "color-mix(in srgb, var(--muted) 76%, transparent)", fontSize: "8px" });
globalStyle(".skills-settings-empty", { display: "grid", minHeight: "260px", placeContent: "center", justifyItems: "center", gap: "8px", color: "var(--muted)", border: "1px dashed var(--line-strong)", borderRadius: "13px", textAlign: "center" });
globalStyle(".skills-settings-empty strong", { color: "var(--ink)", fontSize: "11px" });
globalStyle(".skills-settings-empty p", { margin: 0, fontSize: "9px" });

globalStyle(".mcp-settings-content", {
  width: "min(920px, calc(100% - 96px))",
  margin: "0 auto",
  padding: "38px 0 70px",
});

globalStyle(".mcp-settings-layout.is-embedded .mcp-settings-content", {
  width: "100%",
  padding: "24px 0 0",
});

globalStyle(".mcp-settings-header", {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "28px",
  marginBottom: "22px",
});

globalStyle(".mcp-settings-header h1", { margin: "5px 0 0", fontSize: "27px", letterSpacing: "-0.035em" });
globalStyle(".mcp-settings-header p", { margin: "8px 0 0", color: "var(--muted)", fontSize: "10px" });

globalStyle(".mcp-settings-header > button", {
  display: "inline-flex",
  minHeight: "35px",
  alignItems: "center",
  gap: "7px",
  padding: "0 12px",
  color: "#fff",
  border: "0",
  borderRadius: "9px",
  background: "#17191d",
  cursor: "pointer",
  fontSize: "9px",
  fontWeight: "650",
});
globalStyle(".mcp-settings-header > button:disabled", { cursor: "default", opacity: "0.45" });

globalStyle(".mcp-editor, .mcp-server-list", {
  overflow: "hidden",
  border: "1px solid var(--line-strong)",
  borderRadius: "13px",
  background: "var(--surface)",
  boxShadow: "0 12px 34px rgb(47 58 73 / 6%)",
});
globalStyle(".mcp-editor", { marginBottom: "18px" });

globalStyle(".mcp-editor-heading, .mcp-list-heading", {
  display: "flex",
  minHeight: "44px",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 15px",
  borderBottom: "1px solid var(--line)",
  background: "var(--surface-soft)",
});
globalStyle(".mcp-editor-heading > div", { display: "flex", alignItems: "center", gap: "8px", fontSize: "10px" });
globalStyle(".mcp-editor-heading > button", { display: "grid", width: "28px", height: "28px", padding: "0", placeItems: "center", color: "var(--muted)", border: "0", borderRadius: "7px", background: "transparent", cursor: "pointer" });
globalStyle(".mcp-list-heading strong", { fontSize: "10px" });
globalStyle(".mcp-list-heading small", { color: "var(--muted)", fontSize: "9px" });

globalStyle(".mcp-editor-grid", { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", padding: "18px" });
globalStyle(".mcp-editor-grid label", { display: "grid", gap: "7px" });
globalStyle(".mcp-editor-grid label.mcp-field-wide", { gridColumn: "1 / -1" });
globalStyle(".mcp-editor-grid label > span", { color: "#414750", fontSize: "9px", fontWeight: "650" });
globalStyle(".mcp-editor-grid label > small", { color: "var(--muted)", fontSize: "8px", lineHeight: "1.45" });
globalStyle(".mcp-editor-grid input, .mcp-editor-grid select, .mcp-editor-grid textarea", { width: "100%", padding: "0 11px", color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "9px", outline: "none", background: "var(--surface-soft)", font: "inherit", fontSize: "10px" });
globalStyle(".mcp-editor-grid input, .mcp-editor-grid select", { height: "38px" });
globalStyle(".mcp-editor-grid textarea", { minHeight: "86px", paddingTop: "10px", resize: "vertical", lineHeight: "1.5" });
globalStyle(".mcp-editor-grid input:focus, .mcp-editor-grid select:focus, .mcp-editor-grid textarea:focus", { borderColor: "#8bb6f8", background: "var(--surface)", boxShadow: "0 0 0 3px #e7f0ff" });
globalStyle(".mcp-secret-input", { display: "grid", gridTemplateColumns: "30px minmax(0, 1fr)", alignItems: "center", overflow: "hidden", border: "1px solid var(--line-strong)", borderRadius: "9px", background: "var(--surface-soft)" });
globalStyle(".mcp-secret-input > svg", { justifySelf: "center", color: "#747d88" });
globalStyle(".mcp-secret-input > input", { height: "36px", paddingLeft: "0", border: "0", borderRadius: "0", background: "transparent" });
globalStyle(".mcp-secret-input:focus-within", { borderColor: "#8bb6f8", background: "var(--surface)", boxShadow: "0 0 0 3px #e7f0ff" });
globalStyle(".mcp-secret-input > input:focus", { boxShadow: "none" });

globalStyle(".mcp-editor-actions", { display: "flex", minHeight: "54px", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "9px 18px", borderTop: "1px solid var(--line)", background: "var(--surface-soft)" });
globalStyle(".mcp-editor-actions small", { color: "var(--muted)", fontSize: "8px" });
globalStyle(".mcp-editor-actions button", { minHeight: "34px", padding: "0 15px", color: "#fff", border: "0", borderRadius: "8px", background: "#17191d", cursor: "pointer", fontSize: "9px", fontWeight: "650" });

globalStyle(".mcp-server-row", { display: "grid", gridTemplateColumns: "10px minmax(0, 1fr) auto auto auto auto", minHeight: "69px", alignItems: "center", gap: "10px", padding: "11px 14px", borderBottom: "1px solid var(--line)" });
globalStyle(".mcp-server-row:last-child", { borderBottom: "0" });
globalStyle(".mcp-server-row > div", { minWidth: "0" });
globalStyle(".mcp-server-row strong", { display: "block", overflow: "hidden", fontSize: "10px", textOverflow: "ellipsis", whiteSpace: "nowrap" });
globalStyle(".mcp-server-row small", { display: "block", overflow: "hidden", marginTop: "5px", color: "var(--muted)", fontSize: "8px", textOverflow: "ellipsis", whiteSpace: "nowrap" });
globalStyle(".mcp-status-dot", { width: "7px", height: "7px", borderRadius: "50%", background: "#c5cbd2" });
globalStyle(".mcp-status-dot.enabled", { background: "#46a078", boxShadow: "0 0 0 3px #e8f5ef" });

globalStyle(".mcp-server-row > button", { display: "inline-flex", minHeight: "31px", alignItems: "center", gap: "6px", padding: "0 9px", color: "#505863", border: "1px solid var(--line-strong)", borderRadius: "8px", background: "var(--surface-soft)", cursor: "pointer", fontSize: "9px" });
globalStyle(".mcp-server-row > button.icon-only", { width: "31px", padding: "0", justifyContent: "center" });
globalStyle(".mcp-server-row > button.danger:hover", { color: "#b33f3b", borderColor: "#efd5d3", background: "#fff0ef" });
globalStyle(".mcp-server-row > button:disabled", { cursor: "wait", opacity: "0.5" });

globalStyle(".mcp-empty", { display: "grid", minHeight: "190px", placeContent: "center", justifyItems: "center", color: "var(--muted)" });
globalStyle(".mcp-empty strong", { marginTop: "9px", color: "var(--ink)", fontSize: "10px" });
globalStyle(".mcp-empty span", { marginTop: "5px", fontSize: "8px" });
globalStyle(".mcp-test-result", { display: "flex", alignItems: "center", gap: "7px", margin: "13px 2px 0", color: "#287052", fontSize: "9px" });
globalStyle(".mcp-settings-error", { margin: "13px 0 0", padding: "9px 10px", color: "var(--danger)", borderRadius: "8px", background: "#fff1f1", fontSize: "9px" });
globalStyle(".mcp-settings-note", { margin: "13px 2px 0", color: "var(--subtle)", fontSize: "8px" });
