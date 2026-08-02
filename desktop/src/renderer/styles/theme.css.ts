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
  ink: "#181b20",
  muted: "#717987",
  subtle: "#959daa",
  line: "#e0e5eb",
  lineStrong: "#d2d8e0",
  canvas: "#f1f2f4",
  surface: "#ffffff",
  surfaceSoft: "#f7f8fa",
  blue: "#1768ef",
  blueSoft: "#edf4ff",
  green: "#159764",
  greenSoft: "#edf9f3",
  amber: "#e78a17",
  amberSoft: "#fff7e9",
  danger: "#d94a47",
  sidebarWidth: "248px",
});

createGlobalTheme('[data-theme="dark"]', vars, {
  ink: "#f0f0f1",
  muted: "#a5a6aa",
  subtle: "#77797f",
  line: "#303236",
  lineStrong: "#3c3e43",
  canvas: "#18191b",
  surface: "#1d1e20",
  surfaceSoft: "#28292c",
  blue: "#4d93ff",
  blueSoft: "#202f47",
  green: "#42bd85",
  greenSoft: "#173528",
  amber: "#f0a23d",
  amberSoft: "#3b2c18",
  danger: "#ef6b67",
  sidebarWidth: "248px",
});

globalStyle(":root", {
  color: vars.ink,
  background: vars.canvas,
  fontFamily:
    'var(--ui-font, "Segoe UI Variable", "Microsoft YaHei UI", "PingFang SC", sans-serif)',
  fontSynthesis: "none",
  textRendering: "optimizeLegibility",
  WebkitFontSmoothing: "antialiased",
  colorScheme: "light",
});

globalStyle('[data-theme="dark"]', {
  colorScheme: "dark",
});
