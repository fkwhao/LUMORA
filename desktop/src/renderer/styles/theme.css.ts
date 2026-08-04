import {
  createGlobalTheme,
  createGlobalThemeContract,
  globalStyle,
} from "@vanilla-extract/css";

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export const vars = createGlobalThemeContract(
  {
    ink: null,
    muted: null,
    subtle: null,
    line: null,
    lineStrong: null,
    canvas: null,
    surface: null,
    surfaceSoft: null,
    messageBubble: null,
    blue: null,
    blueSoft: null,
    green: null,
    greenSoft: null,
    amber: null,
    amberSoft: null,
    danger: null,
    sidebarWidth: null,
  },
  (_value, path) => `--${toKebabCase(path.join("-"))}`,
);

createGlobalTheme(":root", vars, {
  ink: "#1a1c1f",
  muted: "#656b73",
  subtle: "#8c929a",
  line: "#e6e6e6",
  lineStrong: "#d8d8d8",
  canvas: "#ffffff",
  surface: "#ffffff",
  surfaceSoft: "#f7f7f7",
  messageBubble: "#eef0f3",
  blue: "#339cff",
  blueSoft: "#edf7ff",
  green: "#00a240",
  greenSoft: "#eaf8ef",
  amber: "#e78a17",
  amberSoft: "#fff7e9",
  danger: "#ba2623",
  sidebarWidth: "248px",
});

createGlobalTheme('[data-theme="dark"]', vars, {
  ink: "#ffffff",
  muted: "#a9a9aa",
  subtle: "#747475",
  line: "#2b2b2b",
  lineStrong: "#3a3a3a",
  canvas: "#181818",
  surface: "#181818",
  surfaceSoft: "#222222",
  messageBubble: "#2b2c2f",
  blue: "#339cff",
  blueSoft: "#192f43",
  green: "#40c977",
  greenSoft: "#183326",
  amber: "#f0a23d",
  amberSoft: "#3b2c18",
  danger: "#fa423e",
  sidebarWidth: "248px",
});

globalStyle(":root", {
  color: vars.ink,
  background: vars.canvas,
  fontFamily:
    'var(--ui-font, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)',
  fontSynthesis: "none",
  fontKerning: "normal",
  textRendering: "optimizeLegibility",
  WebkitFontSmoothing: "auto",
  colorScheme: "light",
});

globalStyle('[data-theme="dark"]', {
  colorScheme: "dark",
});
