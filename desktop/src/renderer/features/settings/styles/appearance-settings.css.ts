import { globalStyle } from "@vanilla-extract/css";

globalStyle(".appearance-settings", {
  padding: "0 48px 64px",
});

globalStyle(".appearance-content", {
  width: "min(900px, 100%)",
  margin: "0 auto",
  paddingTop: "32px",
});

globalStyle(".appearance-header h1", {
  margin: "5px 0 0",
  fontSize: "26px",
  letterSpacing: "-0.035em",
});

globalStyle(".appearance-header p", {
  margin: "7px 0 0",
  color: "var(--muted)",
  fontSize: "10px",
});

globalStyle(".appearance-section", {
  marginTop: "28px",
});

globalStyle(".appearance-section-heading", {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  marginBottom: "12px",
});

globalStyle(".appearance-section-heading h2", {
  margin: "0",
  fontSize: "12px",
});

globalStyle(".appearance-section-heading p", {
  margin: "4px 0 0",
  color: "var(--muted)",
  fontSize: "9px",
});

globalStyle(".theme-options", {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "12px",
});

globalStyle(".theme-option", {
  position: "relative",
  display: "grid",
  gap: "9px",
  padding: "5px",
  color: "var(--muted)",
  border: "1px solid transparent",
  borderRadius: "13px",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
});

globalStyle(".theme-option:hover", {
  color: "var(--ink)",
  background: "var(--surface-soft)",
});

globalStyle(".theme-option.selected", {
  color: "var(--ink)",
  borderColor: "color-mix(in srgb, var(--blue) 68%, var(--line))",
  background: "var(--blue-soft)",
});

globalStyle(".theme-preview", {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "29% 1fr",
  height: "112px",
  overflow: "hidden",
  border: "1px solid var(--line-strong)",
  borderRadius: "9px",
  background: "#f5f6f7",
});

globalStyle(".theme-option.dark .theme-preview", {
  borderColor: "#5a6069",
  background: "#17191c",
});

globalStyle(".theme-option.system .theme-preview", {
  background: "linear-gradient(90deg, #f5f6f7 0 50%, #17191c 50%)",
});

globalStyle(".theme-preview-sidebar", {
  background: "#e7e9ec",
});

globalStyle(".theme-option.dark .theme-preview-sidebar", {
  background: "#272a2f",
});

globalStyle(".theme-option.system .theme-preview-sidebar", {
  background: "linear-gradient(90deg, #e7e9ec 0 50%, #24262a 50%)",
});

globalStyle(".theme-preview-surface", {
  display: "flex",
  flexDirection: "column",
  gap: "7px",
  margin: "19px 13px",
  padding: "12px",
  borderRadius: "8px",
  background: "#fff",
  boxShadow: "0 4px 14px rgb(26 32 40 / 8%)",
});

globalStyle(".theme-option.dark .theme-preview-surface", {
  background: "#303339",
  boxShadow: "none",
});

globalStyle(".theme-option.system .theme-preview-surface", {
  background: "linear-gradient(90deg, #fff 0 38%, #26282c 62%)",
});

globalStyle(".theme-preview-surface i", {
  display: "block",
  width: "66%",
  height: "5px",
  borderRadius: "4px",
  background: "#d4d8dd",
});

globalStyle(".theme-preview-surface i:nth-child(2)", {
  width: "88%",
});

globalStyle(".theme-preview-surface b", {
  display: "block",
  width: "54%",
  height: "18px",
  marginTop: "auto",
  borderRadius: "5px",
  background: "var(--blue)",
});

globalStyle(".theme-option-label", {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "0 4px 3px",
  fontSize: "10px",
  fontWeight: "650",
});

globalStyle(".theme-option-check", {
  position: "absolute",
  right: "11px",
  bottom: "11px",
  display: "grid",
  width: "18px",
  height: "18px",
  placeItems: "center",
  color: "#fff",
  borderRadius: "50%",
  background: "var(--blue)",
});

globalStyle(".appearance-card", {
  marginTop: "22px",
  overflow: "hidden",
  border: "1px solid var(--line-strong)",
  borderRadius: "13px",
  background: "var(--surface)",
  boxShadow: "0 12px 34px rgb(47 58 73 / 6%)",
});

globalStyle(".appearance-row", {
  display: "flex",
  minHeight: "67px",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "24px",
  padding: "12px 17px",
  borderBottom: "1px solid var(--appearance-line, var(--line))",
});

globalStyle(".appearance-row:last-child", {
  borderBottom: "0",
});

globalStyle(".appearance-row > div:first-child", {
  display: "grid",
  gap: "4px",
});

globalStyle(".appearance-row strong", {
  fontSize: "10px",
});

globalStyle(".appearance-row small", {
  color: "var(--muted)",
  fontSize: "8px",
});

globalStyle(".appearance-switch", {
  position: "relative",
  width: "38px",
  height: "22px",
  padding: "0",
  border: "0",
  borderRadius: "12px",
  background: "#cbd1d8",
  cursor: "pointer",
});

globalStyle(".appearance-switch span", {
  position: "absolute",
  top: "3px",
  left: "3px",
  width: "16px",
  height: "16px",
  borderRadius: "50%",
  background: "#fff",
  boxShadow: "0 1px 3px rgb(0 0 0 / 24%)",
  transition: "transform 140ms ease",
});

globalStyle(".appearance-switch.enabled", {
  background: "var(--blue)",
});

globalStyle(".appearance-switch.enabled span", {
  transform: "translateX(16px)",
});

globalStyle(".contrast-control", {
  display: "grid",
  gridTemplateColumns: "180px 28px",
  alignItems: "center",
  gap: "10px",
});

globalStyle(".contrast-control input", {
  width: "100%",
  accentColor: "var(--blue)",
});

globalStyle(".contrast-control output", {
  color: "var(--muted)",
  fontSize: "9px",
  textAlign: "right",
});

globalStyle(".appearance-footnote", {
  margin: "12px 2px 0",
  color: "var(--subtle)",
  fontSize: "8px",
});

globalStyle('[data-theme="dark"] .appearance-card', {
  boxShadow: "none",
});
