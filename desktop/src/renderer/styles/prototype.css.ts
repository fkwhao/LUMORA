import { globalStyle, keyframes } from "@vanilla-extract/css";

const toastIn = keyframes({
  from: { opacity: 0, transform: "translateY(8px) scale(0.98)" },
  to: { opacity: 1, transform: "translateY(0) scale(1)" },
});

globalStyle(".prototype-layout", {
  overflow: "auto",
});

globalStyle(".prototype-toolbar p", {
  margin: "6px 0 0",
  color: "var(--muted)",
  fontSize: "10px",
});

globalStyle(".prototype-badge", {
  padding: "6px 9px",
  color: "#576171",
  border: "1px solid #dbe0e6",
  borderRadius: "7px",
  background: "#fff",
  fontSize: "9px",
});

globalStyle(".prototype-content", {
  width: "min(940px, calc(100% - 72px))",
  margin: "10px auto 50px",
});

globalStyle(".prototype-section-heading", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "14px",
});

globalStyle(".prototype-section-heading h2", {
  margin: "0",
  fontSize: "15px",
});

globalStyle(".prototype-section-heading p", {
  margin: "5px 0 0",
  color: "var(--muted)",
  fontSize: "9px",
});

globalStyle(".prototype-section-heading > button", {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "34px",
  gap: "6px",
  padding: "0 11px",
  color: "#fff",
  border: "0",
  borderRadius: "9px",
  background: "#1a1d22",
  cursor: "pointer",
  fontSize: "10px",
});

globalStyle(".skill-grid", {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "10px",
});

globalStyle(".skill-grid article > span,\n.automation-list article > span", {
  display: "grid",
  width: "38px",
  height: "38px",
  placeItems: "center",
  color: "#3266ae",
  borderRadius: "10px",
  background: "#edf4ff",
});

globalStyle(".automation-list", {
  overflow: "hidden",
  border: "1px solid var(--line)",
  borderRadius: "13px",
  background: "#fff",
});

globalStyle(".automation-list article", {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  alignItems: "center",
  minHeight: "72px",
  gap: "12px",
  padding: "11px 14px",
  borderBottom: "1px solid #edf0f3",
});

globalStyle(".automation-list article:last-child", {
  borderBottom: "0",
});

globalStyle(".automation-list article > div", {
  display: "grid",
  gap: "5px",
});

globalStyle(".automation-list strong,\n.skill-grid strong", {
  fontSize: "11px",
});

globalStyle(".automation-list small", {
  color: "var(--muted)",
  fontSize: "9px",
});

globalStyle(".prototype-switch", {
  width: "34px",
  height: "19px",
  padding: "2px",
  border: "0",
  borderRadius: "99px",
  background: "#d9dee5",
  cursor: "pointer",
});

globalStyle(".prototype-switch span", {
  display: "block",
  width: "15px",
  height: "15px",
  borderRadius: "50%",
  background: "#fff",
  boxShadow: "0 1px 4px rgb(20 26 35 / 20%)",
  transition: "transform 160ms ease",
});

globalStyle(".prototype-switch.active", {
  background: "var(--blue)",
});

globalStyle(".prototype-switch.active span", {
  transform: "translateX(15px)",
});

globalStyle(".skill-grid article", {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  gap: "12px",
  padding: "14px",
  border: "1px solid var(--line)",
  borderRadius: "12px",
  background: "#fff",
});

globalStyle(".skill-grid article > div", {
  minWidth: "0",
});

globalStyle(".skill-grid p", {
  minHeight: "30px",
  margin: "6px 0 12px",
  color: "var(--muted)",
  fontSize: "9px",
  lineHeight: "1.55",
});

globalStyle(".skill-grid button", {
  display: "inline-flex",
  minHeight: "29px",
  alignItems: "center",
  gap: "5px",
  padding: "0 8px",
  color: "#56606e",
  border: "1px solid #dce1e7",
  borderRadius: "7px",
  background: "#fff",
  cursor: "pointer",
  fontSize: "9px",
});

globalStyle(".skill-grid button.active", {
  color: "#0d704b",
  borderColor: "#bce0cd",
  background: "var(--green-soft)",
});

globalStyle(".toast-viewport", {
  position: "fixed",
  zIndex: "100",
  right: "22px",
  bottom: "22px",
  pointerEvents: "none",
});

globalStyle(".toast-card", {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  alignItems: "center",
  minWidth: "280px",
  maxWidth: "390px",
  minHeight: "46px",
  gap: "9px",
  padding: "0 9px 0 13px",
  color: "#f8f9fb",
  border: "1px solid rgb(255 255 255 / 9%)",
  borderRadius: "11px",
  background: "#202329",
  boxShadow: "0 16px 42px rgb(20 25 34 / 24%)",
  pointerEvents: "auto",
  animation: `${toastIn} 180ms ease-out`,
  fontSize: "10px",
});

globalStyle(".toast-card.success > svg", {
  color: "#69d39f",
});

globalStyle(".toast-card button", {
  display: "grid",
  width: "29px",
  height: "29px",
  padding: "0",
  placeItems: "center",
  color: "#aeb5c0",
  border: "0",
  borderRadius: "7px",
  background: "transparent",
  cursor: "pointer",
});
