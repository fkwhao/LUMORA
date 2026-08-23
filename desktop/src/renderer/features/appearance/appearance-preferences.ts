import { APPEARANCE_PREFERENCES_STORAGE_KEY } from "../../constants/storage";

export type ThemePreference = "system" | "light" | "dark";
export type UiFontPreference = "system" | "segoe" | "yahei";
export type CodeFontPreference = "cascadia" | "consolas" | "jetbrains";

export interface AppearancePreferences {
  theme: ThemePreference;
  accentColor: string;
  uiFont: UiFontPreference;
  codeFont: CodeFontPreference;
  translucentSidebar: boolean;
  contrast: number;
}

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  theme: "system",
  accentColor: "#339cff",
  uiFont: "system",
  codeFont: "cascadia",
  translucentSidebar: false,
  contrast: 50,
};

const UI_FONT_STACKS: Record<UiFontPreference, string> = {
  system:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  segoe:
    '"Segoe UI Variable Text", "Segoe UI", sans-serif',
  yahei:
    '"Microsoft YaHei", "Microsoft YaHei UI", "Segoe UI", sans-serif',
};

const CODE_FONT_STACKS: Record<CodeFontPreference, string> = {
  cascadia:
    '"Cascadia Mono", "Cascadia Code", Consolas, "SFMono-Regular", monospace',
  consolas: 'Consolas, "SFMono-Regular", monospace',
  jetbrains: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
};

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const LEGACY_DEFAULT_ACCENT_COLOR = "#1768ef";

export function loadAppearancePreferences(): AppearancePreferences {
  try {
    const value = globalThis.localStorage?.getItem(
      APPEARANCE_PREFERENCES_STORAGE_KEY,
    );
    return value
      ? normalizeAppearancePreferences(JSON.parse(value) as unknown)
      : DEFAULT_APPEARANCE_PREFERENCES;
  } catch {
    return DEFAULT_APPEARANCE_PREFERENCES;
  }
}

export function saveAppearancePreferences(
  preferences: AppearancePreferences,
): void {
  const normalized = normalizeAppearancePreferences(preferences);
  globalThis.localStorage?.setItem(
    APPEARANCE_PREFERENCES_STORAGE_KEY,
    JSON.stringify(normalized),
  );
}

export function applyAppearancePreferences(
  preferences: AppearancePreferences,
): void {
  const normalized = normalizeAppearancePreferences(preferences);
  const root = document.documentElement;
  const resolvedTheme = resolveTheme(normalized.theme);
  const variantContrast =
    (resolvedTheme === "dark" ? 60 : 45) + (normalized.contrast - 50);
  const lineOpacity = 0.1 + variantContrast * 0.0016;

  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = normalized.theme;
  root.dataset.translucentSidebar = String(normalized.translucentSidebar);
  root.style.setProperty("--blue", normalized.accentColor);
  root.style.setProperty(
    "--blue-soft",
    `${normalized.accentColor}${resolvedTheme === "dark" ? "24" : "14"}`,
  );
  root.style.setProperty("--ui-font", UI_FONT_STACKS[normalized.uiFont]);
  root.style.setProperty("--code-font", CODE_FONT_STACKS[normalized.codeFont]);
  root.style.setProperty(
    "--appearance-line",
    resolvedTheme === "dark"
      ? `rgb(255 255 255 / ${lineOpacity})`
      : `rgb(20 28 38 / ${lineOpacity})`,
  );
  // 同步 Windows 原生标题栏覆盖层，避免深色主题顶部仍保留浅色条。
  globalThis.window?.lumora?.window?.setAppearance(resolvedTheme);
}

export function watchSystemTheme(
  getPreferences: () => AppearancePreferences,
): () => void {
  if (typeof globalThis.matchMedia !== "function") {
    return () => undefined;
  }
  const query = globalThis.matchMedia("(prefers-color-scheme: dark)");
  const handleChange = () => {
    const preferences = getPreferences();
    if (preferences.theme === "system") {
      applyAppearancePreferences(preferences);
    }
  };
  query.addEventListener?.("change", handleChange);
  return () => query.removeEventListener?.("change", handleChange);
}

function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") {
    return preference;
  }
  return typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function normalizeAppearancePreferences(
  value: unknown,
): AppearancePreferences {
  if (!value || typeof value !== "object") {
    return DEFAULT_APPEARANCE_PREFERENCES;
  }
  const candidate = value as Partial<AppearancePreferences>;
  const candidateAccent =
    typeof candidate.accentColor === "string" &&
    HEX_COLOR_PATTERN.test(candidate.accentColor)
      ? candidate.accentColor
      : DEFAULT_APPEARANCE_PREFERENCES.accentColor;
  return {
    theme: isTheme(candidate.theme)
      ? candidate.theme
      : DEFAULT_APPEARANCE_PREFERENCES.theme,
    accentColor:
      candidateAccent.toLowerCase() === LEGACY_DEFAULT_ACCENT_COLOR
        ? DEFAULT_APPEARANCE_PREFERENCES.accentColor
        : candidateAccent,
    uiFont:
      candidate.uiFont && candidate.uiFont in UI_FONT_STACKS
        ? candidate.uiFont
        : DEFAULT_APPEARANCE_PREFERENCES.uiFont,
    codeFont:
      candidate.codeFont && candidate.codeFont in CODE_FONT_STACKS
        ? candidate.codeFont
        : DEFAULT_APPEARANCE_PREFERENCES.codeFont,
    translucentSidebar:
      typeof candidate.translucentSidebar === "boolean"
        ? candidate.translucentSidebar
        : DEFAULT_APPEARANCE_PREFERENCES.translucentSidebar,
    contrast: clampContrast(candidate.contrast),
  };
}

function isTheme(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function clampContrast(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(80, Math.max(20, Math.round(value)))
    : DEFAULT_APPEARANCE_PREFERENCES.contrast;
}
