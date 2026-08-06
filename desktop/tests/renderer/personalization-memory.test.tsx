import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PersonalizationPage } from "../../src/renderer/features/settings/PersonalizationPage";
import type { LumoraMemoryApi } from "../../src/shared/memory-contract";

afterEach(cleanup);

describe("personalization memory settings", () => {
  it("loads and persists the master memory switch", async () => {
    const api = createApi();
    const notify = vi.fn();
    render(<PersonalizationPage api={api} notify={notify} />);

    const toggle = await screen.findByRole("switch", { name: "启用记忆" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith(false));
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(notify).toHaveBeenCalledWith("记忆已关闭", "success");
  });

  it("requires confirmation before deleting memories", async () => {
    const api = createApi();
    render(<PersonalizationPage api={api} notify={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "重置" }));
    expect(api.reset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));

    await waitFor(() => expect(api.reset).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

function createApi(): LumoraMemoryApi {
  return {
    getSettings: vi.fn(async () => ({ enabled: true })),
    updateSettings: vi.fn(async (enabled: boolean) => ({ enabled })),
    reset: vi.fn(async () => ({ deletedCount: 2 })),
  };
}
