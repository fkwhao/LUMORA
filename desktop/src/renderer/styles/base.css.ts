import { globalStyle } from "@vanilla-extract/css";

globalStyle(".desktop-bridge-error", {
  display: "grid",
  minHeight: "100vh",
  placeContent: "center",
  gap: "8px",
  color: "#252a31",
  background: "#f4f5f7",
  textAlign: "center",
});

globalStyle(".desktop-bridge-error strong", {
  fontSize: "16px",
});

globalStyle(".desktop-bridge-error p", {
  margin: "0",
  color: "#747c88",
  fontSize: "12px",
});

globalStyle("*", {
  boxSizing: "border-box",
  letterSpacing: "0",
});

globalStyle("html,\nbody,\n#root", {
  width: "100%",
  minWidth: "1100px",
  height: "100%",
  margin: "0",
});

globalStyle("body", {
  overflow: "hidden",
  background: "var(--canvas)",
});

globalStyle("button,\ntextarea", {
  font: "inherit",
});

globalStyle("button", {
  color: "inherit",
});

globalStyle("button:focus-visible,\ntextarea:focus-visible", {
  outline: "2px solid color-mix(in srgb, var(--blue) 62%, white)",
  outlineOffset: "2px",
});

globalStyle("button:disabled", {
  cursor: "not-allowed",
  opacity: "0.45",
});

globalStyle(".app-shell", {
  display: "grid",
  gridTemplateColumns: "var(--sidebar-width) minmax(0, 1fr)",
  width: "100%",
  height: "100%",
  paddingTop: "32px",
  overflow: "hidden",
  background: "var(--canvas)",
  transition: "grid-template-columns 220ms cubic-bezier(0.2, 0.75, 0.25, 1)",
});

globalStyle(".settings-window-shell", {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  background: "var(--canvas)",
});

globalStyle(".app-shell.sidebar-collapsed", {
  gridTemplateColumns: "0 minmax(0, 1fr)",
});

globalStyle(".sidebar-collapsed .sidebar,\n.sidebar-collapsed .settings-sidebar", {
  visibility: "hidden",
  opacity: "0",
  pointerEvents: "none",
  transform: "translateX(-14px)",
});

globalStyle(".app-shell > .home-layout,\n.app-shell > .task-layout,\n.app-shell > .prototype-layout", {
  gridColumn: "2",
});

globalStyle(".window-drag-region", {
  position: "fixed",
  zIndex: "1000",
  top: "0",
  right: "138px",
  left: "0",
  height: "32px",
  // Electron 使用 Chromium 私有属性声明可拖拽标题栏区域。
  // @ts-expect-error vanilla-extract 的标准 CSS 类型不包含该属性。
  WebkitAppRegion: "drag",
});

globalStyle(".window-navigation", {
  position: "fixed",
  zIndex: "1002",
  top: "3px",
  left: "7px",
  display: "flex",
  alignItems: "center",
  gap: "5px",
  // 标题栏中的按钮必须排除在拖拽区域之外。
  // @ts-expect-error Electron 使用 Chromium 私有属性。
  WebkitAppRegion: "no-drag",
});

globalStyle(".window-navigation button", {
  display: "grid",
  width: "27px",
  height: "27px",
  padding: "0",
  placeItems: "center",
  color: "#60666f",
  border: "0",
  borderRadius: "8px",
  background: "transparent",
  cursor: "pointer",
  transition:
    "color 140ms ease, background-color 140ms ease, transform 140ms ease",
});

globalStyle(".window-navigation button:active:not(:disabled)", {
  transform: "scale(0.9)",
});

globalStyle(".window-navigation button:hover:not(:disabled)", {
  color: "#22262c",
  background: "#dfe2e6",
});

globalStyle(".window-navigation button:disabled", {
  opacity: "0.32",
});

globalStyle(".sidebar-resize-handle", {
  position: "fixed",
  zIndex: "1001",
  top: "32px",
  bottom: "0",
  left: "calc(var(--sidebar-width) - 3px)",
  width: "7px",
  cursor: "col-resize",
  touchAction: "none",
  // 拖拽分隔线不能被窗口拖拽区域接管。
  // @ts-expect-error Electron 使用 Chromium 私有属性。
  WebkitAppRegion: "no-drag",
});

globalStyle(".sidebar-resize-handle::after", {
  position: "absolute",
  top: "0",
  bottom: "0",
  left: "3px",
  width: "1px",
  background: "transparent",
  content: "\"\"",
  transition: "background 120ms ease",
});

globalStyle(".sidebar-resize-handle:hover::after,\n.resizing-sidebar .sidebar-resize-handle::after", {
  background: "#aeb5be",
});

globalStyle("body.resizing-sidebar", {
  cursor: "col-resize",
  userSelect: "none",
});
