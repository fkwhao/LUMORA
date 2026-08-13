import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PluginsSettingsPage } from "../../src/renderer/features/settings/pages/PluginsSettingsPage";
import type { LumoraMcpApi } from "../../src/shared/mcp-contract";

describe("plugin settings", () => {
  it("integrates MCP settings and reserves the skills section", async () => {
    const api = {
      listServers: vi.fn(async () => []),
    } as unknown as LumoraMcpApi;

    render(<PluginsSettingsPage api={api} notify={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "插件" })).toBeVisible();
    expect(await screen.findByText("尚未配置 MCP Server")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "技能" }));

    expect(screen.getByRole("region", { name: "技能" })).toBeVisible();
    expect(screen.getByText("技能管理")).toBeVisible();
    expect(screen.queryByText("尚未配置 MCP Server")).not.toBeInTheDocument();
  });
});
