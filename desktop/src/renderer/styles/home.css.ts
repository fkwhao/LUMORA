import { globalStyle, keyframes } from "@vanilla-extract/css";

const composerFromBottom = keyframes({
  from: {
    opacity: "0.82",
    transform: "translateY(32vh) scaleX(0.94) scaleY(0.82)",
  },
  to: { opacity: "1", transform: "translateY(0) scale(1)" },
});

const homePixelTrack = keyframes({
  from: { transform: "translateX(0)" },
  to: { transform: "translateX(-1440px)" },
});

const homePixelClouds = keyframes({
  from: { transform: "translateX(0)" },
  to: { transform: "translateX(-1440px)" },
});

const homePixelScenery = keyframes({
  from: { transform: "translateX(0)" },
  to: { transform: "translateX(-1440px)" },
});

const homePixelBlob = keyframes({
  "0%, 100%": { transform: "scale(1, 1) translateY(0)" },
  "50%": { transform: "scale(1.035, 0.965) translateY(1px)" },
});

const homePixelStatus = keyframes({
  "0%, 49%": { opacity: "1" },
  "50%, 100%": { opacity: "0.38" },
});

const homePixelJump = keyframes({
  "0%": { transform: "translateY(0) scale(1, 1)" },
  "12%": { transform: "translateY(3px) scale(1.2, 0.72)" },
  "28%": { transform: "translateY(-20px) scale(0.76, 1.34)" },
  "48%": { transform: "translateY(-50px) scale(0.86, 1.18)" },
  "62%": { transform: "translateY(-44px) scale(1.04, 0.94)" },
  "78%": { transform: "translateY(-18px) scale(0.9, 1.12)" },
  "90%": { transform: "translateY(2px) scale(1.22, 0.7)" },
  "100%": { transform: "translateY(0) scale(1, 1)" },
});

globalStyle(".home-layout", {
  display: "grid",
  overflow: "hidden",
});

globalStyle(".home-content", {
  display: "flex",
  width: "min(calc(100% - 64px), 860px)",
  height: "100%",
  margin: "0 auto",
  padding: "clamp(34px, 7vh, 74px) 0 42px",
  flexDirection: "column",
  alignItems: "stretch",
  overflow: "auto",
});

globalStyle(".home-hero", {
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
});

globalStyle(".home-pixel-panel", {
  position: "relative",
  width: "100%",
  height: "clamp(154px, 23vh, 208px)",
  marginBottom: "30px",
  padding: "0",
  overflow: "hidden",
  color: "var(--ink)",
  border: "0",
  borderRadius: "0",
  background: "transparent",
  boxShadow: "none",
  cursor: "pointer",
  font: "inherit",
  textAlign: "left",
  WebkitMaskImage:
    "linear-gradient(90deg, transparent 0%, #000 7%, #000 93%, transparent 100%)",
  maskImage:
    "linear-gradient(90deg, transparent 0%, #000 7%, #000 93%, transparent 100%)",
});

globalStyle(".home-pixel-panel::after", {
  display: "none",
});

globalStyle(".home-pixel-panel:focus-visible", {
  outline: "1px dashed var(--muted)",
  outlineOffset: "5px",
});

globalStyle(".home-pixel-panel-heading", {
  position: "absolute",
  zIndex: "2",
  top: "14px",
  right: "18px",
  left: "18px",
  display: "flex",
  justifyContent: "space-between",
  color: "var(--muted)",
  fontFamily: "var(--code-font, ui-monospace, monospace)",
  fontSize: "9px",
  fontWeight: "650",
  letterSpacing: "0.08em",
});

globalStyle(".home-pixel-run-status::before", {
  display: "inline-block",
  width: "5px",
  height: "5px",
  marginRight: "6px",
  background: "currentColor",
  content: '\"\"',
  animation: `${homePixelStatus} 800ms steps(1, end) infinite`,
});

globalStyle(".home-pixel-artwork", {
  position: "absolute",
  right: "14px",
  bottom: "9px",
  left: "14px",
  width: "calc(100% - 28px)",
  height: "calc(100% - 46px)",
});

globalStyle(".home-pixel-bands", {
  opacity: "0.22",
});

globalStyle(".home-pixel-clouds", {
  animation: `${homePixelClouds} 36s linear infinite`,
});

globalStyle(".home-pixel-scenery", {
  animation: `${homePixelScenery} 24s linear infinite`,
});

globalStyle(".home-pixel-track", {
  animation: `${homePixelTrack} 12.8s linear infinite`,
});

globalStyle(".home-pixel-blob", {
  animation: `${homePixelBlob} 720ms steps(2, end) infinite`,
  transformBox: "fill-box",
  transformOrigin: "center bottom",
});

globalStyle(".home-pixel-panel.is-jumping .home-pixel-blob", {
  animation: `${homePixelJump} 820ms steps(1, end) 1`,
});

globalStyle(".home-pixel-blob-trail > rect", {
  animation: `${homePixelStatus} 560ms steps(1, end) infinite`,
});

globalStyle(".home-pixel-blob-trail .trail-two", {
  animationDelay: "-280ms",
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

globalStyle(".home-pixel-panel", {
  "@media": {
    "(max-width: 720px)": {
      height: "132px",
      marginBottom: "24px",
      borderRadius: "0",
    },
    "(prefers-reduced-motion: reduce)": {
      animation: "none",
    },
  },
});

globalStyle(".home-pixel-clouds, .home-pixel-scenery, .home-pixel-track, .home-pixel-blob, .home-pixel-blob-trail > rect, .home-pixel-run-status::before", {
  "@media": {
    "(prefers-reduced-motion: reduce)": {
      animation: "none",
    },
  },
});
