import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "../../src/renderer/App";
import { APPEARANCE_PREFERENCES_STORAGE_KEY } from "../../src/renderer/constants/storage";
import {
  applyAppearancePreferences,
  DEFAULT_APPEARANCE_PREFERENCES,
} from "../../src/renderer/features/appearance/appearance-preferences";
import type { LumoraTaskApi } from "../../src/shared/task-contract";

describe("appearance settings", () => {
  it("applies and persists theme and accent preferences", async () => {
    localStorage.clear();
    applyAppearancePreferences(DEFAULT_APPEARANCE_PREFERENCES);
    render(<App api={createApi()} />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    fireEvent.click(screen.getByRole("button", { name: "外观" }));
    fireEvent.click(screen.getByRole("radio", { name: /深色/ }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(
      JSON.parse(
        localStorage.getItem(APPEARANCE_PREFERENCES_STORAGE_KEY) ?? "{}",
      ),
    ).toMatchObject({ theme: "dark" });

    fireEvent.click(screen.getByLabelText("UI 字体"));
    const segoeOption = await screen.findByRole("option", { name: /Segoe UI/ });
    fireEvent.pointerDown(segoeOption, { button: 0 });
    fireEvent.pointerUp(segoeOption, { button: 0 });
    fireEvent.click(segoeOption);
    expect(
      JSON.parse(
        localStorage.getItem(APPEARANCE_PREFERENCES_STORAGE_KEY) ?? "{}",
      ),
    ).toMatchObject({ uiFont: "segoe" });

    fireEvent.click(screen.getByRole("button", { name: "打开强调色选择器" }));
    const colorInput = await screen.findByRole("textbox", { name: "强调色 HEX" });
    fireEvent.input(colorInput, {
      target: { value: "8B5CF6" },
    });
    fireEvent.blur(colorInput);
    expect(
      document.documentElement.style.getPropertyValue("--blue"),
    ).toBe("#8B5CF6");

    localStorage.clear();
    applyAppearancePreferences(DEFAULT_APPEARANCE_PREFERENCES);
  });
});

function createApi(): LumoraTaskApi {
  return {
    create: vi.fn(),
    list: vi.fn(async () => []),
    get: vi.fn(),
    updateWorkspace: vi.fn(),
    updatePreferences: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    decideApproval: vi.fn(),
  };
}
