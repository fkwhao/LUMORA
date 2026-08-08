import { globalStyle, keyframes } from "@vanilla-extract/css";

const hubEnter = keyframes({
  from: { opacity: "0", transform: "translateY(6px)" },
  to: { opacity: "1", transform: "translateY(0)" },
});

globalStyle(".window-navigation.conversation-tabs-visible", {
  right: "148px",
  maxWidth: "calc(100vw - 155px)",
  gap: "6px",
  overflow: "hidden",
});

globalStyle(".window-navigation.conversation-tabs-visible > button", {
  flex: "0 0 auto",
});

globalStyle(".window-navigation .conversation-hub-trigger", {
  width: "32px",
});

globalStyle(".window-navigation .conversation-hub-trigger.active", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--ink) 9%, transparent)",
});

globalStyle(".conversation-tab-strip", {
  display: "flex",
  minWidth: "0",
  maxWidth: "min(68vw, 940px)",
  alignItems: "center",
  gap: "4px",
  overflow: "hidden",
  // 页签之间和右侧余量仍可用于拖动窗口。
  // @ts-expect-error Electron 使用 Chromium 私有属性。
  WebkitAppRegion: "drag",
});

globalStyle(".conversation-tab", {
  display: "flex",
  width: "clamp(150px, 19vw, 280px)",
  height: "27px",
  minWidth: "112px",
  alignItems: "center",
  overflow: "hidden",
  color: "#656b74",
  borderRadius: "8px",
  background: "transparent",
  // @ts-expect-error Electron 使用 Chromium 私有属性。
  WebkitAppRegion: "no-drag",
});

globalStyle(".conversation-tab:hover", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--ink) 3%, transparent)",
});

globalStyle(".conversation-tab.active", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--ink) 11%, var(--canvas))",
});

globalStyle(".window-navigation .conversation-tab-target", {
  display: "flex",
  width: "auto",
  height: "100%",
  minWidth: "0",
  flex: "1 1 auto",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: "7px",
  padding: "0 4px 0 8px",
  color: "inherit",
  borderRadius: "8px 0 0 8px",
  background: "transparent",
});

globalStyle(".window-navigation .conversation-tab-target:hover", {
  color: "inherit",
  background: "transparent",
});

globalStyle(".conversation-tab-project", {
  display: "grid",
  width: "18px",
  height: "18px",
  flex: "0 0 auto",
  placeItems: "center",
  color: "white",
  borderRadius: "5px",
  background: "#6750d8",
  fontSize: "10px",
  fontWeight: "720",
});

globalStyle(".conversation-tab-title", {
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "11px",
  fontWeight: "570",
});

globalStyle(".window-navigation .conversation-tab-close", {
  width: "23px",
  height: "23px",
  marginRight: "2px",
  flex: "0 0 auto",
  color: "inherit",
  borderRadius: "6px",
  opacity: "0",
});

globalStyle(".conversation-tab:hover .conversation-tab-close, .conversation-tab.active .conversation-tab-close", {
  opacity: "0.72",
});

globalStyle(".window-navigation .conversation-tab-close:hover", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--ink) 9%, transparent)",
  opacity: "1",
});

globalStyle(".window-navigation .conversation-new-tab", {
  width: "28px",
});

globalStyle(".conversation-hub-layout", {
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

globalStyle(".conversation-hub-content", {
  width: "min(calc(100% - 96px), 1220px)",
  height: "100%",
  margin: "0 auto",
  padding: "clamp(46px, 8vh, 76px) 0 56px",
  animation: `${hubEnter} 260ms cubic-bezier(0.22, 1, 0.36, 1) both`,
});

globalStyle(".conversation-hub-search", {
  display: "flex",
  width: "min(76%, 920px)",
  minHeight: "48px",
  margin: "0 auto clamp(40px, 7vh, 70px)",
  padding: "0 17px",
  alignItems: "center",
  gap: "12px",
  color: "var(--muted)",
  border: "1px solid transparent",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--canvas) 76%, var(--surface))",
  transition: "border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease",
});

globalStyle(".conversation-hub-search:focus-within", {
  color: "var(--ink)",
  borderColor: "color-mix(in srgb, var(--ink) 17%, transparent)",
  background: "var(--surface)",
  boxShadow: "0 8px 30px rgb(20 25 32 / 6%)",
});

globalStyle(".conversation-hub-search input", {
  width: "100%",
  minWidth: "0",
  padding: "0",
  color: "var(--ink)",
  border: "0",
  outline: "0",
  background: "transparent",
  font: "inherit",
  fontSize: "14px",
});

globalStyle(".conversation-hub-search input::placeholder", {
  color: "var(--muted)",
});

globalStyle(".conversation-hub-grid", {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 31%) minmax(0, 1fr)",
  gap: "clamp(48px, 8vw, 110px)",
});

globalStyle(".conversation-projects header, .conversation-recents > header", {
  display: "flex",
  minHeight: "38px",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "18px",
});

globalStyle(".conversation-projects h1, .conversation-recents h2", {
  margin: "0",
  color: "var(--ink)",
  fontSize: "14px",
  fontWeight: "650",
  letterSpacing: "-0.01em",
});

globalStyle(".conversation-projects header > button", {
  display: "grid",
  width: "32px",
  height: "32px",
  padding: "0",
  placeItems: "center",
  color: "var(--muted)",
  border: "0",
  borderRadius: "8px",
  background: "transparent",
  cursor: "pointer",
});

globalStyle(".conversation-projects header > button:hover", {
  color: "var(--ink)",
  background: "var(--canvas)",
});

globalStyle(".conversation-project-list", {
  display: "grid",
  gap: "5px",
});

globalStyle(".conversation-project-list > button", {
  display: "flex",
  width: "100%",
  minHeight: "42px",
  padding: "0 11px",
  alignItems: "center",
  gap: "10px",
  color: "var(--muted)",
  border: "0",
  borderRadius: "9px",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
});

globalStyle(".conversation-project-list > button:hover", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--canvas) 70%, transparent)",
});

globalStyle(".conversation-project-list > button.active", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--ink) 7%, var(--surface))",
});

globalStyle(".conversation-project-list > button > span:nth-child(2)", {
  minWidth: "0",
  flex: "1 1 auto",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "13px",
  fontWeight: "540",
});

globalStyle(".conversation-project-list > button small", {
  color: "var(--subtle)",
  fontSize: "10px",
});

globalStyle(".conversation-project-mark", {
  display: "grid",
  width: "23px",
  height: "23px",
  flex: "0 0 auto",
  placeItems: "center",
  color: "white",
  borderRadius: "6px",
  fontSize: "11px",
  fontWeight: "720",
});

globalStyle(".conversation-project-mark.project", {
  background: "#6750d8",
});

globalStyle(".conversation-project-mark.default", {
  background: "#4f5963",
});

globalStyle(".conversation-project-caption", {
  display: "block",
  marginBottom: "4px",
  color: "var(--subtle)",
  fontSize: "9px",
  fontWeight: "650",
  letterSpacing: "0.07em",
  textTransform: "uppercase",
});

globalStyle(".conversation-hub-new", {
  display: "inline-flex",
  minHeight: "34px",
  padding: "0 10px",
  alignItems: "center",
  gap: "7px",
  color: "var(--muted)",
  border: "0",
  borderRadius: "8px",
  background: "transparent",
  cursor: "pointer",
  fontSize: "12px",
});

globalStyle(".conversation-hub-new:hover", {
  color: "var(--ink)",
  background: "var(--canvas)",
});

globalStyle(".conversation-recent-list", {
  display: "grid",
  gap: "5px",
});

globalStyle(".conversation-recent-list > button", {
  display: "flex",
  width: "100%",
  minHeight: "52px",
  padding: "7px 10px",
  alignItems: "center",
  gap: "11px",
  color: "var(--ink)",
  border: "0",
  borderRadius: "10px",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  transition: "background-color 140ms ease, transform 140ms ease",
});

globalStyle(".conversation-recent-list > button:hover", {
  background: "color-mix(in srgb, var(--ink) 6%, var(--surface))",
  transform: "translateX(2px)",
});

globalStyle(".conversation-recent-copy", {
  display: "grid",
  minWidth: "0",
  gap: "4px",
});

globalStyle(".conversation-recent-copy strong", {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "13px",
  fontWeight: "570",
});

globalStyle(".conversation-recent-copy small", {
  color: "var(--subtle)",
  fontSize: "9px",
});

globalStyle(".conversation-hub-empty", {
  display: "grid",
  minHeight: "180px",
  placeContent: "center",
  justifyItems: "center",
  gap: "8px",
  color: "var(--subtle)",
  border: "1px dashed color-mix(in srgb, var(--line) 80%, transparent)",
  borderRadius: "12px",
  textAlign: "center",
});

globalStyle(".conversation-hub-empty strong", {
  color: "var(--muted)",
  fontSize: "12px",
  fontWeight: "580",
});

globalStyle(".conversation-hub-empty span", {
  fontSize: "10px",
});

globalStyle(".conversation-hub-content", {
  "@media": {
    "(max-width: 900px)": {
      width: "calc(100% - 48px)",
    },
  },
});
