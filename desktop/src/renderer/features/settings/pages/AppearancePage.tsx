import { Check, Moon, Monitor, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import {
  applyAppearancePreferences,
  loadAppearancePreferences,
  saveAppearancePreferences,
  watchSystemTheme,
  type AppearancePreferences,
  type ThemePreference,
} from "../../appearance/appearance-preferences";

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Monitor;
}> = [
  { value: "system", label: "跟随系统", icon: Monitor },
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
];

export function AppearancePage() {
  const [preferences, setPreferences] = useState(loadAppearancePreferences);

  useEffect(
    () => watchSystemTheme(() => loadAppearancePreferences()),
    [],
  );

  function updatePreferences(
    patch: Partial<AppearancePreferences>,
  ): void {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    applyAppearancePreferences(next);
    saveAppearancePreferences(next);
  }

  return (
    <main className="settings-layout appearance-settings">
      <div className="appearance-content">
        <header className="appearance-header">
          <span className="eyebrow">本地偏好</span>
          <h1>外观</h1>
          <p>调整 LUMORA 的主题、色彩和阅读体验。</p>
        </header>

        <section className="appearance-section" aria-labelledby="theme-heading">
          <div className="appearance-section-heading">
            <div>
              <h2 id="theme-heading">主题</h2>
              <p>切换后会立即应用到整个桌面应用。</p>
            </div>
          </div>
          <div className="theme-options" role="radiogroup" aria-label="主题">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                className={`theme-option ${value}${
                  preferences.theme === value ? " selected" : ""
                }`}
                type="button"
                role="radio"
                aria-checked={preferences.theme === value}
                key={value}
                onClick={() => updatePreferences({ theme: value })}
              >
                <span className="theme-preview" aria-hidden="true">
                  <span className="theme-preview-sidebar" />
                  <span className="theme-preview-surface">
                    <i />
                    <i />
                    <b />
                  </span>
                </span>
                <span className="theme-option-label">
                  <Icon size={15} />
                  {label}
                </span>
                {preferences.theme === value && (
                  <span className="theme-option-check">
                    <Check size={12} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        <section className="appearance-card" aria-label="显示选项">
          <AppearanceRow label="强调色" description="用于按钮、选中状态和链接。">
            <label className="color-field">
              <input
                type="color"
                aria-label="选择强调色"
                value={preferences.accentColor}
                onChange={(event) =>
                  updatePreferences({ accentColor: event.target.value })
                }
              />
              <span>{preferences.accentColor.toUpperCase()}</span>
            </label>
          </AppearanceRow>

          <AppearanceRow label="UI 字体" description="应用界面使用的字体。">
            <select
              aria-label="UI 字体"
              value={preferences.uiFont}
              onChange={(event) =>
                updatePreferences({
                  uiFont: event.target
                    .value as AppearancePreferences["uiFont"],
                })
              }
            >
              <option value="system">系统默认</option>
              <option value="segoe">Segoe UI</option>
              <option value="yahei">Microsoft YaHei</option>
            </select>
          </AppearanceRow>

          <AppearanceRow label="代码字体" description="代码块和 Diff 使用的等宽字体。">
            <select
              aria-label="代码字体"
              value={preferences.codeFont}
              onChange={(event) =>
                updatePreferences({
                  codeFont: event.target
                    .value as AppearancePreferences["codeFont"],
                })
              }
            >
              <option value="cascadia">Cascadia Code</option>
              <option value="consolas">Consolas</option>
              <option value="jetbrains">JetBrains Mono</option>
            </select>
          </AppearanceRow>

          <AppearanceRow
            label="半透明侧边栏"
            description="让侧边栏轻微透出窗口背景。"
          >
            <button
              className={`appearance-switch${
                preferences.translucentSidebar ? " enabled" : ""
              }`}
              type="button"
              role="switch"
              aria-checked={preferences.translucentSidebar}
              aria-label="半透明侧边栏"
              onClick={() =>
                updatePreferences({
                  translucentSidebar: !preferences.translucentSidebar,
                })
              }
            >
              <span />
            </button>
          </AppearanceRow>

          <AppearanceRow
            label="界面对比度"
            description="调整边界和分隔线的清晰程度。"
          >
            <div className="contrast-control">
              <input
                type="range"
                aria-label="界面对比度"
                min="20"
                max="80"
                value={preferences.contrast}
                onChange={(event) =>
                  updatePreferences({
                    contrast: Number(event.target.value),
                  })
                }
              />
              <output>{preferences.contrast}</output>
            </div>
          </AppearanceRow>
        </section>

        <p className="appearance-footnote">
          外观设置仅保存在本机，不会上传到模型服务。
        </p>
      </div>
    </main>
  );
}

function AppearanceRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="appearance-row">
      <div>
        <strong>{label}</strong>
        <small>{description}</small>
      </div>
      {children}
    </div>
  );
}
