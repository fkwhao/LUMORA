import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import {
  applyAppearancePreferences,
  loadAppearancePreferences,
  watchSystemTheme,
} from "./features/appearance/appearance-preferences";
import "./styles/assistant-ui.css";
import "./styles";

// 在 React 首次绘制前应用本地外观，避免启动时先闪出默认浅色主题。
applyAppearancePreferences(loadAppearancePreferences());
watchSystemTheme(loadAppearancePreferences);

const root = document.getElementById("root");
if (!root) {
  throw new Error("Renderer root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
