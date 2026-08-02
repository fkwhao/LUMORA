import { globalStyle } from "@vanilla-extract/css";

globalStyle(".home-layout,\n.task-layout,\n.prototype-layout", {
  minWidth: "0",
  minHeight: "0",
  height: "calc(100% - 8px)",
  margin: "0 8px 8px 0",
  overflow: "hidden",
  border: "1px solid #d9dce1",
  borderRadius: "14px",
  background: "var(--surface)",
  boxShadow: "0 1px 2px rgb(25 30 38 / 3%)",
});

globalStyle(".eyebrow", {
  color: "#8a929e",
  fontSize: "10px",
  fontWeight: "650",
  letterSpacing: "0.07em",
  textTransform: "uppercase",
});

globalStyle(".page-toolbar", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: "92px",
  padding: "20px 38px 16px",
});

globalStyle(".page-toolbar h1", {
  margin: "5px 0 0",
  fontSize: "24px",
  lineHeight: "1.25",
  letterSpacing: "-0.025em",
});

globalStyle(".local-status", {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  color: "var(--muted)",
  fontSize: "11px",
});

globalStyle(".local-status span", {
  width: "7px",
  height: "7px",
  borderRadius: "50%",
  background: "var(--green)",
  boxShadow: "0 0 0 4px #dff4e9",
});
