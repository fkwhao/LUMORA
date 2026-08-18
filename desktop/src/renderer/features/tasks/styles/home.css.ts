import { globalStyle, keyframes } from "@vanilla-extract/css";

const composerFromBottom = keyframes({
  from: {
    opacity: "0.82",
    transform: "translateY(32vh) scaleX(0.94) scaleY(0.82)",
  },
  to: { opacity: "1", transform: "translateY(0) scale(1)" },
});

globalStyle(".home-layout", {
  display: "grid",
  overflowX: "hidden",
  overflowY: "auto",
});

globalStyle(".home-content", {
  display: "flex",
  width: "min(calc(100% - 64px), 860px)",
  minHeight: "100%",
  margin: "0 auto",
  padding: "clamp(34px, 7vh, 74px) 0 42px",
  flexDirection: "column",
  alignItems: "stretch",
  overflow: "visible",
});

globalStyle(".home-hero", {
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
});

globalStyle(".home-halftone-landscape", {
  position: "relative",
  width: "100%",
  height: "clamp(154px, 23vh, 208px)",
  marginBottom: "30px",
  color: "var(--ink)",
  overflow: "hidden",
});

globalStyle(".home-halftone-landscape-vector", {
  display: "block",
  width: "100%",
  height: "100%",
  background: "currentColor",
  WebkitMaskPosition: "center",
  maskPosition: "center",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskSize: "contain",
  maskSize: "contain",
});

globalStyle(".home-hero h1", {
  margin: "0",
  color: "var(--ink)",
  fontSize: "clamp(25px, 3vw, 34px)",
  fontWeight: "520",
  letterSpacing: "-0.035em",
});

globalStyle(".home-pixel-drift-title", {
  display: "flex",
  width: "100%",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.18em",
  whiteSpace: "nowrap",
});

globalStyle(".pixel-drift-heading", {
  position: "relative",
  display: "block",
  width: "clamp(158px, 20vw, 218px)",
  height: "clamp(46px, 6vh, 58px)",
  flex: "0 0 auto",
  overflow: "visible",
  transform: "translateY(0.12em)",
});

globalStyle(".pixel-drift-heading-canvas", {
  position: "absolute",
  top: "-20px",
  left: "-12px",
  display: "inline-block",
  width: "calc(100% + 24px)",
  height: "calc(100% + 40px)",
});

globalStyle(".home-hero p", {
  margin: "11px 0 0",
  color: "var(--muted)",
  fontSize: "11px",
});

globalStyle(".home-composer-stack", {
  position: "relative",
  marginTop: "clamp(34px, 6vh, 54px)",
});

globalStyle(".goal-composer", {
  position: "relative",
  zIndex: "2",
  padding: "0 14px 11px",
  border: "1px solid var(--line-strong)",
  borderRadius: "20px",
  background: "color-mix(in srgb, var(--surface-soft) 88%, transparent)",
  backdropFilter: "blur(12px)",
  boxShadow: "0 18px 50px rgb(20 25 32 / 8%)",
});

globalStyle(".goal-composer.is-dragging-attachment", {
  borderColor: "color-mix(in srgb, var(--ink) 42%, var(--line-strong))",
  background: "color-mix(in srgb, var(--surface) 92%, var(--ink) 8%)",
  boxShadow: "0 0 0 3px color-mix(in srgb, var(--ink) 8%, transparent)",
});

globalStyle(".home-attachment-strip", {
  display: "flex",
  gap: "8px",
  overflowX: "auto",
  padding: "12px 0 1px",
  scrollbarWidth: "thin",
});

globalStyle(".home-attachment-chip", {
  display: "flex",
  minWidth: "0",
  maxWidth: "230px",
  height: "48px",
  alignItems: "center",
  gap: "9px",
  flex: "0 0 auto",
  padding: "0 8px",
  border: "1px solid var(--line)",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--surface) 94%, var(--ink) 6%)",
});

globalStyle(".home-attachment-chip > i", {
  display: "inline-flex",
  width: "31px",
  height: "31px",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
  borderRadius: "9px",
  color: "var(--muted)",
  background: "var(--surface)",
  boxShadow: "inset 0 0 0 1px var(--line)",
  overflow: "hidden",
});

globalStyle(".home-attachment-chip > i.has-preview", {
  background: "var(--surface-soft)",
});

globalStyle(".home-attachment-chip > i > img", {
  display: "block",
  width: "100%",
  height: "100%",
  objectFit: "cover",
});

globalStyle(".home-attachment-chip > span", {
  overflow: "hidden",
  flex: "1 1 auto",
  color: "var(--ink)",
  fontSize: "12px",
  fontWeight: "560",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".home-attachment-chip > button", {
  display: "inline-flex",
  width: "22px",
  height: "22px",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
  padding: "0",
  border: "0",
  borderRadius: "50%",
  color: "var(--muted)",
  background: "transparent",
  cursor: "pointer",
});

globalStyle(".home-attachment-chip > button:hover", {
  color: "var(--ink)",
  background: "var(--hover)",
});

globalStyle(".home-layout.composer-enter-from-bottom .goal-composer", {
  animation: `${composerFromBottom} 520ms cubic-bezier(0.22, 1, 0.36, 1) both`,
  transformOrigin: "bottom center",
  willChange: "transform, opacity",
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
  minHeight: "80px",
  maxHeight: "220px",
  padding: "15px 2px 8px",
  fontSize: "13px",
  overflowY: "hidden",
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
  width: "32px",
  height: "32px",
  flex: "0 0 auto",
  padding: "0",
  placeItems: "center",
  color: "var(--surface)",
  border: "0",
  borderRadius: "50%",
  background: "var(--ink)",
  boxShadow: "none",
  cursor: "pointer",
});

globalStyle(".submit-task:hover:not(:disabled)", {
  color: "var(--surface)",
  background: "var(--ink)",
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

globalStyle(".home-halftone-landscape", {
  "@media": {
    "(max-width: 720px)": {
      height: "132px",
      marginBottom: "24px",
    },
  },
});
