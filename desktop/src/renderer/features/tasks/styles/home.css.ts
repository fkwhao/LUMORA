import { globalStyle, keyframes } from "@vanilla-extract/css";

const composerFromBottom = keyframes({
  from: {
    opacity: "0.82",
    transform: "translateY(28px)",
  },
  to: { opacity: "1", transform: "none" },
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

globalStyle(".home-native-composer", {
  position: "relative",
  zIndex: "2",
  display: "flex",
  minHeight: "154px",
  flexDirection: "column",
  gap: "8px",
  padding: "8px",
  color: "var(--aui-foreground)",
  border:
    "1px solid color-mix(in oklab, var(--aui-border) 60%, transparent)",
  borderRadius: "24px",
  background:
    "color-mix(in oklab, var(--aui-muted) 30%, var(--aui-background))",
  boxShadow:
    "0 4px 16px -8px rgb(0 0 0 / 8%), 0 1px 2px rgb(0 0 0 / 4%)",
  transition: "border-color 150ms ease, box-shadow 150ms ease",
});

globalStyle(".home-native-composer:focus-within", {
  borderColor: "var(--aui-border)",
  boxShadow:
    "0 6px 24px -8px rgb(0 0 0 / 12%), 0 1px 2px rgb(0 0 0 / 5%)",
});

globalStyle(".home-native-composer.is-dragging-attachment", {
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

globalStyle(".home-layout.composer-enter-from-bottom .home-native-composer", {
  animation: `${composerFromBottom} 360ms cubic-bezier(0.22, 1, 0.36, 1) both`,
  transformOrigin: "bottom center",
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

globalStyle("button.project-environment-trigger", {
  maxWidth: "150px",
  padding: "4px 6px",
  border: "0",
  borderRadius: "7px",
  outline: "none",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
});

globalStyle("button.project-environment-trigger:hover:not(:disabled)", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--ink) 5%, transparent)",
});

globalStyle("button.project-environment-trigger:focus-visible", {
  boxShadow: "0 0 0 2px color-mix(in srgb, var(--blue) 16%, transparent)",
});

globalStyle("button.project-environment-trigger:disabled", {
  opacity: "0.52",
  cursor: "not-allowed",
});

globalStyle("button.project-environment-trigger > span", {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
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

globalStyle(".home-native-composer textarea,\n.follow-up-composer textarea", {
  width: "100%",
  resize: "none",
  color: "var(--ink)",
  border: "0",
  outline: "0",
  background: "transparent",
  lineHeight: "1.65",
});

globalStyle(".home-native-composer-input", {
  minHeight: "88px",
  maxHeight: "220px",
  flex: "1 1 auto",
  padding: "4px 10px",
  color: "var(--aui-foreground)",
  fontSize: "14px",
  fontWeight: "400",
  lineHeight: "1.5",
  overflowY: "hidden",
});

globalStyle(".home-native-composer-input::placeholder", {
  color: "color-mix(in srgb, var(--aui-muted-foreground) 80%, transparent)",
});

globalStyle("textarea::placeholder", {
  color: "var(--subtle)",
});

globalStyle(".home-native-composer-toolbar", {
  display: "flex",
  minWidth: "0",
  minHeight: "28px",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
});

globalStyle(".home-native-composer-tools", {
  display: "flex",
  minWidth: "0",
  alignItems: "center",
  gap: "6px",
});

globalStyle(
  ".home-native-composer-icon-button, .home-native-composer-control",
  {
    display: "inline-flex",
    height: "28px",
    minHeight: "28px",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    flex: "0 0 auto",
    padding: "0 6px",
    color: "var(--aui-muted-foreground)",
    border: "0",
    borderRadius: "6px",
    outline: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "500",
    whiteSpace: "nowrap",
    transition: "color 120ms ease, background 120ms ease",
  },
);

globalStyle(".home-native-composer-icon-button", {
  width: "24px",
  minWidth: "24px",
  height: "24px",
  minHeight: "24px",
  padding: "0",
});

globalStyle(".home-native-composer-icon-button > svg", {
  width: "14px",
  height: "14px",
});

globalStyle(
  ".home-native-composer-control:not(.home-native-model-trigger)",
  {
    height: "24px",
    minHeight: "24px",
  },
);

globalStyle(".home-native-composer-control > svg", {
  flex: "0 0 auto",
});

globalStyle(".home-native-model-trigger", {
  minWidth: "0",
  maxWidth: "220px",
  color: "var(--aui-foreground)",
});

globalStyle(".home-native-model-trigger > span", {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(
  ".home-native-composer-icon-button:hover, .home-native-composer-icon-button[aria-expanded='true'], .home-native-composer-control:hover:not(:disabled), .home-native-composer-control[aria-expanded='true']",
  {
    color: "var(--aui-foreground)",
    background: "var(--aui-accent)",
  },
);

globalStyle(".home-native-composer-control.is-dangerous", {
  color: "#ff7a2f",
});

globalStyle(
  ".home-native-composer-control.is-dangerous:hover, .home-native-composer-control.is-dangerous[aria-expanded='true']",
  {
    color: "#ff8a42",
    background: "rgb(255 122 47 / 10%)",
  },
);

globalStyle(".home-native-composer-control:disabled", {
  cursor: "default",
  opacity: "0.48",
});

globalStyle(
  ".home-native-composer-icon-button:focus-visible, .home-native-composer-control:focus-visible",
  {
    boxShadow: "0 0 0 2px color-mix(in srgb, var(--blue) 24%, transparent)",
  },
);

globalStyle(".home-composer-popover", {
  border: "1px solid color-mix(in srgb, var(--line) 82%, transparent)",
  background: "color-mix(in srgb, var(--surface) 96%, transparent)",
  backdropFilter: "blur(24px) saturate(120%)",
  boxShadow: "0 18px 48px rgb(20 25 32 / 18%)",
});

globalStyle(".home-add-popover > button", {
  display: "inline-flex",
  width: "100%",
  minHeight: "36px",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: "9px",
  padding: "0 9px",
  borderRadius: "8px",
});

globalStyle(".home-add-popover > button > svg", {
  width: "16px",
  height: "16px",
  color: "var(--muted)",
});

globalStyle(".home-composer-popover.permission-popover > button", {
  minHeight: "56px",
  gridTemplateColumns: "24px minmax(0, 1fr) 18px",
  gap: "8px",
  padding: "8px 9px",
});

globalStyle(".home-model-popover [role='menu']", {
  display: "grid",
  gap: "2px",
});

globalStyle(".home-model-option", {
  display: "flex",
  width: "100%",
  minHeight: "34px",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  padding: "0 9px",
  borderRadius: "8px",
});

globalStyle(".home-model-option > svg", {
  width: "15px",
  height: "15px",
});

/* Keep the legacy task composer styling isolated from the home composer. */
globalStyle(".follow-up-composer button", {
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

globalStyle(".follow-up-composer button:hover:not(:disabled)", {
  color: "var(--ink)",
  borderColor: "var(--line-strong)",
  background: "var(--surface)",
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

globalStyle(".submit-task", {
  width: "28px",
  height: "28px",
  color: "var(--aui-primary-foreground)",
  background: "var(--aui-primary)",
  transition: "transform 120ms ease",
});

globalStyle(".submit-task:hover:not(:disabled)", {
  color: "var(--aui-primary-foreground)",
  background: "var(--aui-primary)",
  transform: "scale(1.04)",
});

globalStyle(".form-error", {
  margin: "10px 4px 0",
  color: "var(--danger)",
  fontSize: "10px",
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
