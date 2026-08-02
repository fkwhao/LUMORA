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

    fireEvent.change(screen.getByLabelText("选择强调色"), {
      target: { value: "#8b5cf6" },
    });
    expect(
      document.documentElement.style.getPropertyValue("--blue"),
    ).toBe("#8b5cf6");

    localStorage.clear();
    applyAppearancePreferences(DEFAULT_APPEARANCE_PREFERENCES);
  });
});

function createApi(): LumoraTaskApi {
  return {
    create: vi.fn(),
    list: vi.fn(async () => []),
    get: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    decideApproval: vi.fn(),
  };
}
