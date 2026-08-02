import { globalStyle } from "@vanilla-extract/css";

globalStyle(".home-layout", {
  display: "grid",
  overflow: "hidden",
});

globalStyle(".home-content", {
  display: "flex",
  width: "min(calc(100% - 64px), 920px)",
  height: "100%",
  margin: "0 auto",
  padding: "clamp(72px, 14vh, 148px) 0 42px",
  flexDirection: "column",
  alignItems: "stretch",
  overflow: "auto",
});

globalStyle(".home-hero", {
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
});

globalStyle(".home-hero-mark", {
  display: "grid",
  width: "50px",
  height: "50px",
  marginBottom: "22px",
  placeItems: "center",
  color: "var(--muted)",
  border: "1px solid var(--line)",
  borderRadius: "18px",
  background: "var(--surface-soft)",
});

globalStyle(".home-hero h1", {
  margin: "0",
  color: "var(--ink)",
  fontSize: "clamp(25px, 3vw, 34px)",
  fontWeight: "520",
  letterSpacing: "-0.035em",
});

globalStyle(".home-hero h1 strong", {
  fontWeight: "680",
});

globalStyle(".home-hero p", {
  margin: "11px 0 0",
  color: "var(--muted)",
  fontSize: "11px",
});

globalStyle(".home-composer-stack", {
  position: "relative",
  marginTop: "clamp(54px, 10vh, 92px)",
});

globalStyle(".goal-composer", {
  position: "relative",
  zIndex: "2",
  padding: "0 16px 13px",
  border: "1px solid var(--line-strong)",
  borderRadius: "22px",
  background: "var(--surface-soft)",
  boxShadow: "0 18px 50px rgb(20 25 32 / 8%)",
});

globalStyle(".visually-hidden", {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
});

globalStyle(".project-context-bar", {
  display: "flex",
  width: "calc(100% - 34px)",
  minHeight: "64px",
  alignItems: "center",
  gap: "17px",
  margin: "0 auto -17px",
  padding: "0 18px 17px",
  border: "1px solid var(--line)",
  borderRadius: "22px 22px 12px 12px",
  background: "var(--surface)",
  boxShadow: "0 8px 26px rgb(20 25 32 / 5%)",
});

globalStyle(".project-picker", {
  display: "inline-flex",
  minWidth: "0",
  alignItems: "center",
  gap: "7px",
  padding: "5px 2px",
  color: "var(--ink)",
  border: "0",
  borderRadius: "7px",
  background: "transparent",
  cursor: "pointer",
  fontSize: "10px",
  fontWeight: "620",
});

globalStyle(".project-picker:hover", {
  color: "var(--ink)",
  background: "transparent",
});

globalStyle(".project-picker span", {
  maxWidth: "260px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".project-mode,\n.project-branch", {
  display: "inline-flex",
  minWidth: "0",
  alignItems: "center",
  gap: "6px",
  color: "var(--muted)",
  fontSize: "10px",
});

globalStyle(".project-branch", {
  maxWidth: "260px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".clear-project", {
  display: "grid",
  width: "26px",
  height: "26px",
  marginLeft: "auto",
  padding: "0",
  placeItems: "center",
  color: "var(--muted)",
  border: "0",
  borderRadius: "7px",
  background: "transparent",
  cursor: "pointer",
});

globalStyle(".clear-project:hover", {
  color: "var(--ink)",
  background: "var(--surface)",
});

globalStyle(".goal-composer textarea,\n.follow-up-composer textarea", {
  width: "100%",
  resize: "none",
  color: "var(--ink)",
  border: "0",
  outline: "0",
  background: "transparent",
  lineHeight: "1.65",
});

globalStyle(".goal-composer textarea", {
  minHeight: "92px",
  padding: "15px 2px 8px",
  fontSize: "13px",
});

globalStyle("textarea::placeholder", {
  color: "var(--subtle)",
});

globalStyle(".composer-footer", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
});

globalStyle(".context-actions", {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "6px",
});

globalStyle(".context-actions button,\n.follow-up-composer button", {
  display: "inline-flex",
  minHeight: "30px",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  padding: "0 9px",
  color: "var(--muted)",
  border: "1px solid var(--line)",
  borderRadius: "8px",
  background: "transparent",
  cursor: "pointer",
  fontSize: "9px",
});

globalStyle(
  ".context-actions button:hover,\n.follow-up-composer button:hover:not(:disabled)",
  {
    color: "var(--ink)",
    borderColor: "var(--line-strong)",
    background: "var(--surface)",
  },
);

globalStyle(".context-actions button:first-child", {
  width: "30px",
  padding: "0",
});

globalStyle(".submit-task,\n.send-follow-up", {
  display: "grid",
  width: "36px",
  height: "36px",
  flex: "0 0 auto",
  padding: "0",
  placeItems: "center",
  color: "#fff",
  border: "0",
  borderRadius: "50%",
  background: "var(--blue)",
  boxShadow: "0 5px 14px rgb(23 104 239 / 22%)",
  cursor: "pointer",
});

globalStyle(".submit-task:hover", {
  background: "#075bd9",
  transform: "translateY(-1px)",
});

globalStyle(".form-error", {
  margin: "10px 4px 0",
  color: "var(--danger)",
  fontSize: "10px",
});

globalStyle(".selected-contexts", {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  paddingTop: "10px",
});

globalStyle(".selected-contexts > span", {
  display: "inline-flex",
  minHeight: "26px",
  alignItems: "center",
  gap: "5px",
  padding: "0 5px 0 8px",
  color: "var(--muted)",
  border: "1px solid var(--line)",
  borderRadius: "7px",
  background: "var(--surface)",
  fontSize: "9px",
});

globalStyle(".selected-contexts button", {
  display: "grid",
  width: "19px",
  height: "19px",
  padding: "0",
  placeItems: "center",
  color: "var(--muted)",
  border: "0",
  borderRadius: "5px",
  background: "transparent",
  cursor: "pointer",
});

globalStyle(".home-privacy-note", {
  margin: "14px 0 0",
  color: "var(--subtle)",
  fontSize: "9px",
  textAlign: "center",
});
